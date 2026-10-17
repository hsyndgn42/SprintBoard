package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.sql.*;
import java.util.zip.ZipInputStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.Timeout;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class LocalAdminRecoveryTest {
  @TempDir Path directory;
  final String oldPassword="fixture-old-password", newPassword="fixture-new-password";
  final BCryptPasswordEncoder encoder=new BCryptPasswordEncoder();
  Path fixture() throws Exception {
    Path base=directory.resolve("fixture");
    try(var c=DriverManager.getConnection("jdbc:h2:file:"+base,"sa","")) {
      c.createStatement().execute("CREATE TABLE app_user(username VARCHAR PRIMARY KEY,password_hash VARCHAR,role VARCHAR,active BOOLEAN,session_version BIGINT)");
      c.createStatement().execute("CREATE TABLE audit_event(occurred_at TIMESTAMP,entity_type VARCHAR,entity_id VARCHAR,action VARCHAR,detail_json VARCHAR)");
      c.createStatement().execute("CREATE TABLE product(payload VARCHAR)");
      c.createStatement().execute("INSERT INTO product VALUES('unchanged')");
      try(var insert=c.prepareStatement("INSERT INTO app_user VALUES(?,?,?,TRUE,0)")) {
        for(String name:new String[]{"admin","viewer"}){insert.setString(1,name);insert.setString(2,encoder.encode(oldPassword));insert.setString(3,name.equals("admin")?"ADMIN":"USER");insert.executeUpdate();}
      }
    }
    return Path.of(base+".mv.db");
  }
  Connection connect(Path file)throws Exception{return DriverManager.getConnection("jdbc:h2:file:"+file.toString().replace(".mv.db","")+";IFEXISTS=TRUE","sa","");}
  Path recover(Path file,String name,String approval)throws Exception{return LocalAdminRecovery.recover(file,name,newPassword.toCharArray(),newPassword.toCharArray(),approval);}
  void assertPassword(Connection c,String name,String password,long version)throws Exception{
    try(var statement=c.prepareStatement("SELECT password_hash,session_version FROM app_user WHERE username=?")){
      statement.setString(1,name);try(var row=statement.executeQuery()){assertTrue(row.next());assertTrue(encoder.matches(password,row.getString(1)));assertEquals(version,row.getLong(2));}
    }
  }
  @Test void recoveryBacksUpOldStateUpdatesOnlyAdminAndAuditsWithoutSecrets()throws Exception{
    Path file=fixture(), backup=recover(file,"admin","RECOVER admin");
    try(var c=connect(file)){
      assertPassword(c,"admin",newPassword,1);assertPassword(c,"viewer",oldPassword,0);
      var row=c.createStatement().executeQuery("SELECT payload FROM product");assertTrue(row.next());assertEquals("unchanged",row.getString(1));
      row=c.createStatement().executeQuery("SELECT action,detail_json FROM audit_event");assertTrue(row.next());assertEquals("ADMIN_RECOVERED",row.getString(1));assertEquals("{\"actor\":\"local-recovery\"}",row.getString(2));assertFalse(row.next());
    }
    Path restored=Files.createDirectory(directory.resolve("restored"));
    try(var zip=new ZipInputStream(Files.newInputStream(backup))){
      for(var entry=zip.getNextEntry();entry!=null;entry=zip.getNextEntry()){
        Path target=restored.resolve(entry.getName()).normalize();assertTrue(target.startsWith(restored));Files.copy(zip,target);
      }
    }
    try(var c=connect(restored.resolve("fixture.mv.db"))){assertPassword(c,"admin",oldPassword,0);var row=c.createStatement().executeQuery("SELECT COUNT(*) FROM audit_event");row.next();assertEquals(0,row.getInt(1));}
  }
  @Test void invalidTargetConfirmationPasswordsAndInactiveAdminCannotBeRecovered()throws Exception{
    Path file=fixture();
    assertThrows(Exception.class,()->recover(directory.resolve("missing.mv.db"),"admin","RECOVER admin"));
    assertThrows(Exception.class,()->recover(file,"viewer","RECOVER viewer"));
    assertThrows(Exception.class,()->recover(file,"missing","RECOVER missing"));
    assertThrows(Exception.class,()->recover(file,"admin","yes"));
    assertThrows(Exception.class,()->LocalAdminRecovery.recover(file,"admin","short".toCharArray(),"short".toCharArray(),"RECOVER admin"));
    assertThrows(Exception.class,()->LocalAdminRecovery.recover(file,"admin",newPassword.toCharArray(),oldPassword.toCharArray(),"RECOVER admin"));
    try(var c=connect(file)){assertPassword(c,"admin",oldPassword,0);c.createStatement().executeUpdate("UPDATE app_user SET active=FALSE WHERE username='admin'");}
    assertThrows(Exception.class,()->recover(file,"admin","RECOVER admin"));
    try(var files=Files.list(directory)){assertEquals(0,files.filter(p->p.toString().endsWith(".zip")).count());}
  }
  @Test void auditFailureRollsBackPasswordAndLeavesSafetyBackup()throws Exception{
    Path file=fixture();try(var c=connect(file)){c.createStatement().execute("DROP TABLE audit_event");}
    assertThrows(Exception.class,()->recover(file,"admin","RECOVER admin"));
    try(var c=connect(file)){assertPassword(c,"admin",oldPassword,0);}
    try(var files=Files.list(directory)){assertEquals(1,files.filter(p->p.toString().endsWith(".zip")).count());}
  }
  @Test @Timeout(20) void databaseInAnotherProcessIsRejectedWithoutCreatingBackup()throws Exception{
    Path file=fixture();
    var process=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java").toString(),"-cp",System.getProperty("java.class.path"),HoldingProcess.class.getName(),file.toString()).redirectErrorStream(true).start();
    try{
      assertEquals("READY",process.inputReader().readLine());
      assertThrows(Exception.class,()->recover(file,"admin","RECOVER admin"));
      try(var files=Files.list(directory)){assertEquals(0,files.filter(p->p.toString().endsWith(".zip")).count());}
    }finally{process.getOutputStream().write(1);process.getOutputStream().flush();if(!process.waitFor(5,java.util.concurrent.TimeUnit.SECONDS))process.destroyForcibly();}
  }
  public static class HoldingProcess {
    public static void main(String[] args)throws Exception{
      try(var c=DriverManager.getConnection("jdbc:h2:file:"+args[0].replace(".mv.db","")+";IFEXISTS=TRUE","sa","")){System.out.println("READY");System.out.flush();System.in.read();}
    }
  }
}
