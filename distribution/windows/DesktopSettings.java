package com.sprintboard.desktop;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.KeyStore;
import java.security.cert.X509Certificate;
import java.util.*;
import javax.net.ssl.*;

/** Explicit, local configuration only. Passwords never appear in the process command line. */
final class DesktopSettings {
  private static final Set<String> ALLOWED=Set.of("server.address","server.port","server.ssl.enabled",
      "server.ssl.key-store","server.ssl.key-store-password-file","server.ssl.key-alias","browser.host");
  final String bind;
  final int port;
  final URI address;
  final SSLContext tls;
  final List<String> serverArguments;
  final Map<String,String> serverEnvironment;

  private DesktopSettings(String bind,int port,URI address,SSLContext tls,List<String> args,Map<String,String> env){
    this.bind=bind;this.port=port;this.address=address;this.tls=tls;
    serverArguments=List.copyOf(args);serverEnvironment=Map.copyOf(env);
  }

  static DesktopSettings load(Path dataDir,Integer override)throws Exception {
    Path file=dataDir.resolve("settings.properties");
    if(!Files.exists(file))try{
      Files.writeString(file,"# Restart SprintBoard after editing. See app/docs/WINDOWS_SECURITY.md for HTTPS.\nserver.address=127.0.0.1\nserver.port=4181\nserver.ssl.enabled=false\n",StandardOpenOption.CREATE_NEW);
    }catch(FileAlreadyExistsException ignored){}
    Properties values=new Properties();try(var input=Files.newBufferedReader(file,StandardCharsets.UTF_8)){values.load(input);}
    if(!ALLOWED.containsAll(values.stringPropertyNames()))throw new IOException("settings.properties desteklenmeyen ayar içeriyor.");
    String bind=values.getProperty("server.address","127.0.0.1").trim();
    if(!Set.of("127.0.0.1","0.0.0.0").contains(bind))throw new IOException("server.address yalnız 127.0.0.1 veya 0.0.0.0 olabilir.");
    int port=override==null?port(values.getProperty("server.port","4181")):override;
    String enabled=values.getProperty("server.ssl.enabled","false").trim();
    if(!Set.of("true","false").contains(enabled))throw new IOException("server.ssl.enabled true veya false olmalı.");
    boolean https=Boolean.parseBoolean(enabled);
    if(!https&&!bind.equals("127.0.0.1"))throw new IOException("Ağ erişimi için HTTPS zorunlu. WINDOWS_SECURITY.md kılavuzundaki sertifika ayarlarını tamamlayın.");
    var args=new ArrayList<>(List.of("--server.address="+bind,"--server.port="+port,"--server.ssl.enabled="+https,
        "--server.forward-headers-strategy=none","--server.servlet.session.cookie.secure="+https));
    if(!https)return new DesktopSettings(bind,port,URI.create("http://127.0.0.1:"+port+"/"),null,args,Map.of());
    String host=values.getProperty("browser.host","localhost").trim();
    if(!host.matches("[A-Za-z0-9.-]{1,253}")||host.startsWith(".")||host.endsWith(".")||host.contains(".."))
      throw new IOException("browser.host sertifikadaki DNS adı veya IPv4 adresi olmalı; URL veya yol içermemeli.");
    Path store=localFile(dataDir,values.getProperty("server.ssl.key-store"));
    Path passwordFile=localFile(dataDir,values.getProperty("server.ssl.key-store-password-file"));
    if(Files.size(passwordFile)>4096)throw new IOException("Sertifika parola dosyası geçersiz.");
    char[] password=Files.readString(passwordFile,StandardCharsets.UTF_8).stripTrailing().toCharArray();
    if(password.length<1)throw new IOException("Sertifika parola dosyası boş.");
    try {
      KeyStore keyStore=KeyStore.getInstance("PKCS12");
      try(var input=Files.newInputStream(store)){keyStore.load(input,password);}
      String alias=values.getProperty("server.ssl.key-alias","").trim();
      if(alias.isEmpty()){
        var keys=new ArrayList<String>();for(var names=keyStore.aliases();names.hasMoreElements();){var name=names.nextElement();if(keyStore.isKeyEntry(name))keys.add(name);}
        if(keys.size()!=1)throw new IOException("Sertifikada birden fazla anahtar varsa server.ssl.key-alias belirtin.");
        alias=keys.getFirst();
      }
      if(!keyStore.isKeyEntry(alias)||keyStore.getKey(alias,password)==null)throw new IOException("HTTPS sertifikasının özel anahtarı bulunamadı.");
      if(!(keyStore.getCertificate(alias) instanceof X509Certificate cert))throw new IOException("HTTPS sertifikası X.509 olmalı.");
      cert.checkValidity();
      // Trust only this installation's selected server certificate for the internal health check.
      // Hostname checking remains enabled; no trust-all manager or TLS verification bypass.
      KeyStore trust=KeyStore.getInstance(KeyStore.getDefaultType());trust.load(null,null);trust.setCertificateEntry("server",cert);
      TrustManagerFactory factory=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());factory.init(trust);
      SSLContext tls=SSLContext.getInstance("TLS");tls.init(null,factory.getTrustManagers(),null);
      args.addAll(List.of("--server.ssl.key-store="+store.toUri(),"--server.ssl.key-store-type=PKCS12",
          "--server.ssl.key-alias="+alias,"--server.ssl.enabled-protocols=TLSv1.2,TLSv1.3"));
      return new DesktopSettings(bind,port,URI.create("https://"+host+":"+port+"/"),tls,args,
          Map.of("SERVER_SSL_KEY_STORE_PASSWORD",new String(password)));
    }finally{Arrays.fill(password,'\0');}
  }

  private static Path localFile(Path dataDir,String value)throws IOException {
    if(value==null||value.isBlank()||value.startsWith("\\\\")||value.startsWith("//"))throw new IOException("Yerel sertifika ve parola dosyalarının yollarını belirtin.");
    Path file=dataDir.resolve(value).normalize().toAbsolutePath();
    if(!Files.isRegularFile(file))throw new IOException("HTTPS dosyası bulunamadı: "+file);
    return file;
  }

  static int port(String value){try{int n=Integer.parseInt(value);if(n>=1024&&n<=65535)return n;}catch(NumberFormatException ignored){}throw new IllegalArgumentException("Port 1024–65535 arasında olmalı.");}

  boolean healthy(){
    // Always connect to this machine, even when the certificate's DNS name resolves elsewhere.
    try(var plain=new Socket()){
      plain.connect(new InetSocketAddress("127.0.0.1",port),1000);plain.setSoTimeout(2000);
      Socket socket=plain;
      if(tls!=null){
        var secure=(SSLSocket)tls.getSocketFactory().createSocket(plain,address.getHost(),port,true);
        var parameters=secure.getSSLParameters();parameters.setEndpointIdentificationAlgorithm("HTTPS");secure.setSSLParameters(parameters);
        secure.setSoTimeout(2000);secure.startHandshake();socket=secure;
      }
      try(var connection=socket){
        connection.getOutputStream().write(("GET /api/health HTTP/1.1\r\nHost: "+address.getHost()+":"+port+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
        String response=new String(connection.getInputStream().readNBytes(8192),StandardCharsets.UTF_8);
        return response.startsWith("HTTP/1.1 200 ")&&response.matches("(?s).*\"status\"\\s*:\\s*\"ok\".*");
      }
    }catch(Exception ignored){return false;}
  }
}
