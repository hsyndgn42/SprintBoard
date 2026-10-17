import com.sprintboard.BackupService;
import com.fasterxml.jackson.databind.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import java.nio.file.*;

/** Read-only validation/export of an offline release DB copy; never opens the live DB. */
public class VerifyReleaseBackup {
  public static void main(String[] args) throws Exception {
    if(args.length!=2) throw new IllegalArgumentException("backup DB path, new JSON path required");
    Path root=Path.of(".").toRealPath(), db=Path.of(args[0]).toRealPath();
    Path out=Path.of(args[1]).toAbsolutePath().normalize();
    Path backups=root.resolve("backups").toRealPath();
    if(!db.startsWith(backups)||!db.toString().endsWith(".mv.db")||!out.startsWith(backups)||Files.exists(out))
      throw new IllegalArgumentException("Only existing backup DB and new backup JSON allowed");
    String path=db.toString().replace('\\','/');
    var ds=new DriverManagerDataSource("jdbc:h2:file:"+path.substring(0,path.length()-6)+";IFEXISTS=TRUE;ACCESS_MODE_DATA=r;DB_CLOSE_ON_EXIT=FALSE","sa","");
    try(var connection=ds.getConnection()) {
      var jdbc=new JdbcTemplate(ds);var mapper=new ObjectMapper().findAndRegisterModules();
      var service=new BackupService(jdbc,mapper,backups.toString());
      JsonNode export=mapper.valueToTree(service.exportData());
      service.preview(export); // Validate all supported table relationships and values, without restore.
      mapper.writerWithDefaultPrettyPrinter().writeValue(out.toFile(),export);
      var tables=export.path("tables");
      System.out.println("Read-only backup validation PASS; schema="+export.path("schemaVersion")+
          ", sprints="+tables.path("sprint").size()+", tasks="+tables.path("sprint_task").size()+
          ", assignments="+tables.path("assignment").size()+", roadmaps="+tables.path("roadmap_item").size());
      System.out.println("Sprint states: "+jdbc.queryForList("SELECT status,COUNT(*) AS total FROM sprint GROUP BY status"));
      System.out.println("Unassigned backlog pool: "+jdbc.queryForObject("SELECT COUNT(*) FROM backlog_item b WHERE NOT EXISTS (SELECT 1 FROM sprint_task t WHERE t.backlog_id=b.id)",Integer.class));
    }
  }
}
