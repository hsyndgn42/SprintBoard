import com.sprintboard.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.flywaydb.core.Flyway;
public class SeedSlackOvertimeQA{
 public static void main(String[] args){
  var ds=new DriverManagerDataSource("jdbc:h2:file:./tmp/slack-overtime-ui;IFEXISTS=TRUE;DB_CLOSE_ON_EXIT=FALSE","sa","");
  Flyway.configure().dataSource(ds).load().migrate();var db=new JdbcTemplate(ds);
  db.update("UPDATE slack_config SET enabled=FALSE,bot_secret='',app_secret='',overtime_channel_id='C0CA3PMA1Q9'");
  db.update("INSERT INTO sprint(id,number,name,goal,start_date,end_date,status,story_points_available) VALUES('qa-ot-sprint',9001,'Sprint 9001','','2026-10-15','2026-10-17','completed',FALSE)");
  var service=new SlackOvertimeService(db,new ObjectMapper(),null);
  service.accept("TTEST123","C0CA3PMA1Q9","1792180000.100001","UTEST123","#mesai\nSprint: 9001\nTarih: 2026-10-16\nSaat: 2,5\nAçıklama: QA mesai <script>alert(1)</script>",1);
  service.accept("TTEST123","C0CA3PMA1Q9","1792180000.100002","UTEST123","#mesai\nSprint: 9001\nTarih: 2026-10-17\nSaat: 1,5\nAçıklama: QA ikinci mesai",1);
  service.accept("TTEST123","C0CA3PMA1Q9","1792180000.100003","UTEST123","#mesai\nSaat: 99",1);
  db.update("UPDATE slack_overtime_inbox SET reporter_name='Ada Yılmaz'");
  System.out.println("Isolated Slack overtime fixtures ready; tokens empty and listener disabled.");
 }
}
