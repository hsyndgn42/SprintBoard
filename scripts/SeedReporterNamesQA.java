import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.flywaydb.core.Flyway;
public class SeedReporterNamesQA{
 public static void main(String[] args){
  var ds=new DriverManagerDataSource("jdbc:h2:file:./tmp/defect-reporter-ui-db;IFEXISTS=TRUE;DB_CLOSE_ON_EXIT=FALSE","sa","");
  Flyway.configure().dataSource(ds).load().migrate();var db=new JdbcTemplate(ds);
  db.update("UPDATE slack_config SET enabled=FALSE");
  db.update("UPDATE slack_inbox SET reporter_name='Ada Yılmaz' WHERE user_id='UTEST123'");
  db.update("UPDATE defect_detail SET reporter_name='Ada Yılmaz' WHERE reporter_id='UTEST123'");
  System.out.println("Isolated reporter-name fixtures ready.");
 }
}
