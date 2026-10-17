import com.sprintboard.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.flywaydb.core.Flyway;
import java.util.*;
import java.time.*;
public class SeedOvertimeMatchingQA {
 public static void main(String[] args){
  var ds=new DriverManagerDataSource("jdbc:h2:file:./tmp/settings-pagination-qa/db;IFEXISTS=TRUE;DB_CLOSE_ON_EXIT=FALSE","sa","");
  Flyway.configure().dataSource(ds).load().migrate();var db=new JdbcTemplate(ds);
  db.update("UPDATE slack_config SET enabled=FALSE,bot_secret='',app_secret=''");
  String member="qa-match-"+UUID.randomUUID(),sprint=db.queryForObject("SELECT id FROM sprint WHERE status='active'",String.class);
  int number=db.queryForObject("SELECT number FROM sprint WHERE id=?",Integer.class,sprint);
  String date=db.queryForObject("SELECT start_date FROM sprint WHERE id=?",String.class,sprint),user="U"+System.currentTimeMillis();
  db.update("INSERT INTO member(id,name,title,role,team_role,engagement,active) VALUES(?,'Mesai Plan QA','Developer','DEVELOPER','DEVELOPER','CORE',TRUE)",member);
  db.update("INSERT INTO member_participation(id,member_id,closed) VALUES(?,?,FALSE)",UUID.randomUUID().toString(),member);
  db.update("INSERT INTO slack_member_link(team_id,user_id,member_id,updated_by) VALUES('TQAMATCH',?,?,'QA')",user,member);
  db.update("INSERT INTO overtime_entry(id,member_id,sprint_id,earned_hours,used_hours,planned_hours,include_in_capacity,note,created_at) VALUES(?,?,?,0,0,16,TRUE,'QA 16 saat plan',CURRENT_TIMESTAMP)","qa-plan-"+UUID.randomUUID(),member,sprint);
  var service=new SlackOvertimeService(db,new ObjectMapper(),null);
  for(int i=0;i<3;i++)service.accept("TQAMATCH","C0CA3PMA1Q9",System.currentTimeMillis()+"."+i,user,"#mesai\nSprint: "+number+"\nTarih: "+date+"\nSaat: "+new int[]{8,12,3}[i]+"\nAçıklama: QA-MATCH-"+i,1);
  db.update("UPDATE slack_overtime_inbox SET reporter_name='Mesai Plan QA' WHERE user_id=?",user);
  db.update("INSERT INTO overtime_request(id,member_id,sprint_id,requester,work_date,hours,reason,status,created_at) VALUES(?,?,?,'qa.user',?,2,'QA-MATCH-REQUEST','PENDING',?)",UUID.randomUUID().toString(),member,sprint,LocalDate.parse(date).plusDays(1),Instant.now().toString());
  System.out.println("Isolated matching fixtures ready; Slack listener disabled.");
 }
}
