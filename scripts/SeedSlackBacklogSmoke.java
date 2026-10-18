import java.nio.file.*;
import java.sql.*;
import java.util.*;
import org.flywaydb.core.Flyway;

/** Disposable UI fixture; refuses any existing database or directory outside tmp QA runs. */
class SeedSlackBacklogSmoke {
 public static void main(String[] args)throws Exception{
  Path root=Path.of(args[0]).toRealPath();
  if(!root.getFileName().toString().startsWith("sprint-edit-runtime-")||!root.getParent().getFileName().toString().equals("tmp"))throw new IllegalArgumentException("Disposable QA directory required");
  Path db=root.resolve("service/data/sprintboard");if(Files.exists(Path.of(db+".mv.db")))throw new IllegalArgumentException("Refusing existing database");
  Files.createDirectories(db.getParent());String url="jdbc:h2:file:"+db.toString().replace('\\','/')+";DB_CLOSE_ON_EXIT=FALSE";
  Flyway.configure().dataSource(url,"sa","").load().migrate();
  try(var c=DriverManager.getConnection(url,"sa","");var insert=c.prepareStatement("INSERT INTO slack_backlog_inbox(id,source_key,team_id,channel_id,message_ts,user_id,reporter_name,source_url,raw_text,parsed_json,config_version,received_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")){
   for(int i=0;i<21;i++){
    String title=i==0?"<img src=x onerror=alert(1)> İstek QA":"Slack QA isteği "+i;
    String raw="#backlog\nTür: DEV\nBaşlık: "+title+"\nAçıklama: UI onay kontrolü";
    var mapper=new com.fasterxml.jackson.databind.ObjectMapper();
    String parsed=mapper.writeValueAsString(Map.of("valid",true,"errors",List.of(),"title",title,"description","UI onay kontrolü","taskCategory","DEV","raw",raw));
    Object[] values={"slack-qa-"+i,"TQA:CQA:"+i,"TQA","CQA","1000."+i,"UQA","Test Gönderen","https://app.slack.com/client/TQA/CQA",raw,parsed,1,java.time.Instant.now().plusSeconds(i).toString(),"PENDING"};
    for(int j=0;j<values.length;j++)insert.setObject(j+1,values[j]);insert.executeUpdate();
   }
  }
  System.out.println("Seeded 21 disposable backlog requests; no Slack credentials or reactions.");
 }
}
