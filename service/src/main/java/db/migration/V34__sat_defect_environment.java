package db.migration;

import java.sql.*;
import java.util.*;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/** V14 used an H2-generated constraint name; resolve it by its column, never by a guessed name. */
public class V34__sat_defect_environment extends BaseJavaMigration {
  @Override public Integer getChecksum(){return 34001;}
  @Override public void migrate(Context context)throws Exception{
    Connection db=context.getConnection();var names=new ArrayList<String>();
    try(var query=db.prepareStatement("""
      SELECT c.CONSTRAINT_NAME,c.CHECK_CLAUSE FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS c
      JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS t ON t.CONSTRAINT_SCHEMA=c.CONSTRAINT_SCHEMA AND t.CONSTRAINT_NAME=c.CONSTRAINT_NAME
      WHERE t.TABLE_SCHEMA='PUBLIC' AND t.TABLE_NAME='DEFECT_DETAIL'
      """);var rows=query.executeQuery()){
      while(rows.next())if(rows.getString(2).contains("\"ENVIRONMENT\"")&&!rows.getString(1).equals("CK_DEFECT_ENVIRONMENT_SAT"))names.add(rows.getString(1));
    }
    if(names.size()!=1)throw new SQLException("Expected exactly one defect environment constraint");
    try(var sql=db.createStatement()){
      // Install the expanded guard before dropping the older guard; a failed migration never leaves it unvalidated.
      sql.execute("ALTER TABLE defect_detail ADD CONSTRAINT IF NOT EXISTS ck_defect_environment_sat CHECK(environment IN ('UNSET','DEV','SIT','SAT','UAT','PREPROD','PROD','OTHER'))");
      sql.execute("ALTER TABLE defect_detail DROP CONSTRAINT \""+names.getFirst().replace("\"","\"\"")+"\"");
    }
  }
}
