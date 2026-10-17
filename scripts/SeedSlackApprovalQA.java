import com.sprintboard.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.flywaydb.core.Flyway;
import java.nio.file.*;
public class SeedSlackApprovalQA {
 public static void main(String[] args)throws Exception{
  Path db=Path.of("tmp/defect-reporter-ui-db").toAbsolutePath().normalize();
  if(Files.exists(Path.of(db+".mv.db")))throw new IllegalStateException("Disposable QA DB must be fresh");
  var ds=new DriverManagerDataSource("jdbc:h2:file:"+db.toString().replace('\\','/')+";DB_CLOSE_ON_EXIT=FALSE","sa","");
  Flyway.configure().dataSource(ds).load().migrate();var j=new JdbcTemplate(ds);var inbox=new SlackInboxService(j,new ObjectMapper(),null,null);
  for(int i=1;i<=3;i++){
   String text=i==3?"#defect\nBaşlık: QA Slack invalid <img src=x onerror=alert(1)>":"#defect\nTür: TEST\nBaşlık: QA Slack "+(i==1?"Backlog":"Sprint")+"\nOrtam: SAT\nÖnem: HIGH\nHedef: "+(i==1?"BACKLOG":"SPRINT");
   inbox.accept("TTEST123","CTEST123","1792180000.00000"+i,"UTEST123",text,SlackDefectParser.DEFAULT_TEMPLATE,1);
  }
  System.out.println("Three isolated inbox fixtures ready; no Slack network calls.");
 }
}
