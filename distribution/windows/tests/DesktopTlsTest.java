package com.sprintboard.desktop;

import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/** Real packaged-server HTTPS test. Trusts its disposable certificate only, never the OS trust store. */
public class DesktopTlsTest {
  public static void main(String[] args)throws Exception {
    Path image=Path.of(args[0]).toAbsolutePath(),qa=Files.createTempDirectory(Path.of(args[1]),"tls-qa-");
    Path data=Files.createDirectories(qa.resolve("TLS Team Data"));
    int port;try(var socket=new java.net.ServerSocket(0,0,InetAddress.getLoopbackAddress())){port=socket.getLocalPort();}
    String password=UUID.randomUUID().toString();
    Files.writeString(data.resolve("password.txt"),password);
    var keytool=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","keytool.exe").toString(),
        "-genkeypair","-alias","server","-keyalg","RSA","-keysize","2048","-validity","2","-dname","CN=localhost",
        "-ext","SAN=dns:localhost","-storetype","PKCS12","-keystore",data.resolve("server.p12").toString(),
        "-storepass:file",data.resolve("password.txt").toString(),"-noprompt").redirectErrorStream(true).redirectOutput(qa.resolve("keytool.log").toFile()).start();
    if(!keytool.waitFor(30,TimeUnit.SECONDS)||keytool.exitValue()!=0)throw new AssertionError("Test certificate generation failed");
    String config="server.address=127.0.0.1\nserver.port="+port+"\nserver.ssl.enabled=true\nserver.ssl.key-store=server.p12\nserver.ssl.key-store-password-file=password.txt\nbrowser.host=localhost\n";
    Files.writeString(data.resolve("settings.properties"),config);
    var settings=DesktopSettings.load(data,null);
    if(settings.serverArguments.stream().anyMatch(x->x.contains(password)))throw new AssertionError("Password in command arguments");
    var process=new ProcessBuilder(image.resolve("SprintBoard.exe").toString(),"--headless","--no-browser","--data-dir="+data)
        .redirectOutput(qa.resolve("launcher.out").toFile()).redirectError(qa.resolve("launcher.err").toFile()).start();
    try{
      boolean ready=false;
      for(int i=0;i<100&&process.isAlive();i++){if(settings.healthy()){ready=true;break;}Thread.sleep(500);}
      if(!ready)throw new AssertionError("Packaged HTTPS server did not start: "+qa);
      var cookie=new CookieManager(null,CookiePolicy.ACCEPT_ALL);
      var client=HttpClient.newBuilder().sslContext(settings.tls).cookieHandler(cookie).build();
      var response=client.send(HttpRequest.newBuilder(settings.address.resolve("api/auth/session")).GET().build(),HttpResponse.BodyHandlers.ofString());
      if(response.statusCode()!=200||!response.body().contains("\"setupRequired\":true"))throw new AssertionError("HTTPS setup unavailable");
      var matcher=Pattern.compile("\"csrfToken\":\"([^\"]+)\"").matcher(response.body());
      if(!matcher.find())throw new AssertionError("Missing CSRF token");
      String token=matcher.group(1),body="{\"username\":\"tls.qa\",\"password\":\""+password+"\"}";
      var setup=client.send(HttpRequest.newBuilder(settings.address.resolve("api/auth/setup")).header("Content-Type","application/json").header("X-CSRF-TOKEN",token)
          .POST(HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
      if(setup.statusCode()!=201)throw new AssertionError("HTTPS admin setup failed: "+setup.statusCode());
      var session=client.send(HttpRequest.newBuilder(settings.address.resolve("api/auth/session")).GET().build(),HttpResponse.BodyHandlers.ofString());
      var csrf=Pattern.compile("\"csrfToken\":\"([^\"]+)\"").matcher(session.body());if(!csrf.find())throw new AssertionError("Missing login CSRF");
      var login=client.send(HttpRequest.newBuilder(settings.address.resolve("login")).header("Content-Type","application/x-www-form-urlencoded").header("X-CSRF-TOKEN",csrf.group(1))
          .POST(HttpRequest.BodyPublishers.ofString("username=tls.qa&password="+URLEncoder.encode(password,StandardCharsets.UTF_8))).build(),HttpResponse.BodyHandlers.ofString());
      if(login.statusCode()!=302)throw new AssertionError("HTTPS login redirect failed: "+login.statusCode());
      var authenticated=client.send(HttpRequest.newBuilder(settings.address.resolve("api/auth/session")).GET().build(),HttpResponse.BodyHandlers.ofString());
      if(authenticated.statusCode()!=200||!authenticated.body().contains("\"authenticated\":true")||!authenticated.body().contains("\"role\":\"ADMIN\""))throw new AssertionError("HTTPS admin session not authenticated");
      if(cookie.getCookieStore().getCookies().stream().filter(c->c.getName().equals("JSESSIONID")).noneMatch(HttpCookie::getSecure))throw new AssertionError("Session cookie is not Secure");
      Files.writeString(data.resolve("settings.properties"),config.replace("browser.host=localhost","browser.host=wrong.invalid"));
      if(DesktopSettings.load(data,null).healthy())throw new AssertionError("Certificate hostname mismatch accepted");
      Files.writeString(data.resolve("settings.properties"),config);
      Files.writeString(data.resolve("password.txt"),"wrong-password");
      try{DesktopSettings.load(data,null);throw new AssertionError("Wrong key password accepted");}catch(java.io.IOException expected){}
      Files.writeString(data.resolve("password.txt"),password);
      for(Path file:List.of(data.resolve("launcher.properties"),data.resolve("logs/service.log"),qa.resolve("launcher.err")))
        if(Files.readString(file).contains(password))throw new AssertionError("Password leaked to state or logs");
      System.out.println("PASS: packaged HTTPS, certificate/hostname verification, first admin, login, Secure cookie, wrong-password rejection and no password in arguments/state/logs");
    }finally{
      if(process.isAlive()){
        var stop=new ProcessBuilder(image.resolve("SprintBoard.exe").toString(),"--headless","--stop","--data-dir="+data).start();
        if(!stop.waitFor(15,TimeUnit.SECONDS)||!process.waitFor(40,TimeUnit.SECONDS)){process.destroy();throw new AssertionError("HTTPS test shutdown failed");}
      }
    }
  }
}
