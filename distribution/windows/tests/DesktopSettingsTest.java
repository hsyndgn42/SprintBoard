package com.sprintboard.desktop;

import java.nio.file.*;
import java.util.*;
import java.io.IOException;

public class DesktopSettingsTest {
  private static int checks;
  private static void check(boolean value,String message){checks++;if(!value)throw new AssertionError(message);}
  private static void rejects(Path dir,String config)throws Exception{
    Files.writeString(dir.resolve("settings.properties"),config);
    try{DesktopSettings.load(dir,null);throw new AssertionError("Invalid security configuration accepted");}
    catch(IOException|IllegalArgumentException expected){checks++;}
  }
  public static void main(String[] args)throws Exception{
    Path dir=Files.createTempDirectory(Path.of(args[0]),"desktop-security-");
    var defaults=DesktopSettings.load(dir,null);
    check(defaults.bind.equals("127.0.0.1")&&defaults.address.toString().equals("http://127.0.0.1:4181/"),"Default must be loopback");
    check(defaults.serverEnvironment.isEmpty(),"No credentials in defaults");
    check(DesktopSettings.load(dir,4188).port==4188,"QA port override");
    rejects(dir,"server.address=0.0.0.0\nserver.port=4181\n");
    rejects(dir,"server.address=0.0.0.0\nserver.ssl.enabled=tru\n");
    rejects(dir,"server.address=0.0.0.0\nserver.ssl.enabled=true\n");
    rejects(dir,"server.address=example.com\n");
    rejects(dir,"server.port=80\n");
    rejects(dir,"spring.datasource.url=jdbc:h2:mem:unexpected\n");
    rejects(dir,"server.ssl.enabled=true\nbrowser.host=localhost/path\n");
    rejects(dir,"server.ssl.enabled=true\nserver.ssl.key-store=//server/share/secret.p12\n");
    // Upgrade from the original two-property file remains local and valid.
    Files.writeString(dir.resolve("settings.properties"),"server.address=127.0.0.1\nserver.port=4182\n");
    check(DesktopSettings.load(dir,null).tls==null,"Old local configuration must work");
    System.out.println("PASS: "+checks+" desktop security configuration checks");
  }
}
