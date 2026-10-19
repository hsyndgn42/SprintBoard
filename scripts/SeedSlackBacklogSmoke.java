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
    String raw="#backlog\nTür: "+(i==1?"WRONG":"DEV")+"\nBaşlık: "+title+"\nAçıklama: UI onay kontrolü";
    var mapper=new com.fasterxml.jackson.databind.ObjectMapper();
    String parsed=mapper.writeValueAsString(Map.of("valid",i!=1,"errors",i==1?List.of("Tür geçersiz"):List.of(),"title",title,"description","UI onay kontrolü","taskCategory",i==1?"WRONG":"DEV","raw",raw));
    Object[] values={"slack-qa-"+i,"TQA:CQA:"+i,"TQA","CQA","1000."+i,"UQA","Test Gönderen","https://app.slack.com/client/TQA/CQA",raw,parsed,1,java.time.Instant.now().plusSeconds(i).toString(),i==1?"INVALID":"PENDING"};
    for(int j=0;j<values.length;j++)insert.setObject(j+1,values[j]);insert.executeUpdate();
   }
  }
  try(var c=DriverManager.getConnection(url,"sa","");var insert=c.prepareStatement("INSERT INTO slack_overtime_inbox(id,source_key,team_id,channel_id,message_ts,user_id,reporter_name,source_url,raw_text,parsed_json,config_version,received_at,status) VALUES('qa-invalid-ot','TQA:COT:1','TQA','COT12345','1001.1','UQA','Test Gönderen','https://app.slack.com/client/TQA/COT12345',?,?,1,?,'INVALID')")){
   String raw="#mesai\nSprint: 1\nTarih: 2026-10-5\nSaat: 2\nAçıklama: Tarih düzeltme QA";
   var parsed=Map.of("valid",false,"errors",List.of("Tarih YYYY-AA-GG biçiminde olmalı."),"sprintNumber",1,"date","2026-10-5","hours",2,"reason","Tarih düzeltme QA","raw",raw);
   insert.setString(1,raw);insert.setString(2,new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(parsed));insert.setString(3,java.time.Instant.now().toString());insert.executeUpdate();
  }
  try(var c=DriverManager.getConnection(url,"sa","");var insert=c.prepareStatement("INSERT INTO slack_inbox(id,source_key,team_id,channel_id,message_ts,user_id,reporter_name,source_url,raw_text,parsed_json,config_version,received_at,status) VALUES('qa-invalid-defect','TQA:CDEF:1','TQA','CDEF1234','1002.1','UQA','Test Gönderen','https://app.slack.com/client/TQA/CDEF1234',?,?,1,?,'INVALID')")){
   String raw="#defect\nTür: TEST\nBaşlık: Invalid defect QA\nOrtam: ADSAT\nÖnem: HIGH\nHedef: BACKLOG";
   insert.setString(1,raw);insert.setString(2,new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(com.sprintboard.SlackDefectParser.parse(raw,com.sprintboard.SlackDefectParser.DEFAULT_TEMPLATE)));insert.setString(3,java.time.Instant.now().toString());insert.executeUpdate();
  }
  System.out.println("Seeded disposable backlog, defect and overtime messages; no Slack credentials or reactions.");
 }
}
