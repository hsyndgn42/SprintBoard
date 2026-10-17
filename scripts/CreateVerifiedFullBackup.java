import com.sprintboard.DatabaseBackupScheduler;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.zip.*;
import java.sql.Clob;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
/** Run with live service stopped. Verify a restored copy before old backups may be removed. */
public class CreateVerifiedFullBackup {
 static List<Map<String,Object>> rows(JdbcTemplate db,String table)throws Exception{var rows=db.queryForList("SELECT * FROM "+table);for(var r:rows)for(var k:new ArrayList<>(r.keySet()))if(r.get(k) instanceof Clob c)r.put(k,c.getSubString(1,(int)c.length()));return rows;}
 public static void main(String[] args)throws Exception{
  Path root=Path.of(".").toRealPath();var source=new DriverManagerDataSource("jdbc:h2:file:"+root.resolve("service/data/sprintboard")+";IFEXISTS=TRUE;DB_CLOSE_ON_EXIT=FALSE","sa","");
  try(var connection=source.getConnection()){
   var db=new JdbcTemplate(source);var service=new DatabaseBackupScheduler(db,root.resolve("backups/scheduled").toString(),root.resolve("service/data/slack-token.key").toString(),"",10);
   Path archive=service.create(Instant.now()),temp=Files.createTempDirectory(root.resolve("tmp"),"verify-full-");
   try{
    try(var zip=new ZipFile(archive.toFile());var nested=new ZipInputStream(zip.getInputStream(zip.getEntry("database.zip")))){ZipEntry e;while((e=nested.getNextEntry())!=null)if(e.getName().endsWith(".mv.db"))Files.copy(nested,temp.resolve("restored.mv.db"));
     if(!Arrays.equals(Files.readAllBytes(root.resolve("service/data/slack-token.key")),zip.getInputStream(zip.getEntry("slack-token.key")).readAllBytes()))throw new IllegalStateException("Key mismatch");
    }
    var restored=new DriverManagerDataSource("jdbc:h2:file:"+temp.resolve("restored")+";IFEXISTS=TRUE;ACCESS_MODE_DATA=r;DB_CLOSE_ON_EXIT=FALSE","sa","");
    try(var restoredConnection=restored.getConnection()){
     var copy=new JdbcTemplate(restored);int count=0;
     for(String t:db.queryForList("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='PUBLIC' AND TABLE_TYPE='BASE TABLE'",String.class)){
      String name=t.equals("flyway_schema_history")?"\"flyway_schema_history\"":t;var a=rows(db,name);var b=rows(copy,name);
      if(a.size()!=b.size()||!a.containsAll(b))throw new IllegalStateException("Restored mismatch: "+t);count++;
     }
     System.out.println("VERIFIED "+count+" tables; sprint="+db.queryForObject("SELECT COUNT(*) FROM sprint",Integer.class)+" backlog="+db.queryForObject("SELECT COUNT(*) FROM backlog_item",Integer.class)+" accounts="+db.queryForObject("SELECT COUNT(*) FROM app_user",Integer.class));
    }
    System.out.println("BACKUP="+archive.getFileName());
   }finally{Files.deleteIfExists(temp.resolve("restored.mv.db"));Files.deleteIfExists(temp.resolve("restored.trace.db"));Files.delete(temp);}
  }
 }
}
