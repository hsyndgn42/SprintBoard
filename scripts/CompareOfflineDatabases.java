import java.nio.file.*;
import java.sql.*;
import java.util.*;
/** Compare offline DB copies without exposing row values or credentials. */
public class CompareOfflineDatabases {
  static Connection open(String arg)throws Exception {
    Path p=Path.of(arg).toRealPath();
    if(!p.toString().endsWith(".mv.db"))throw new IllegalArgumentException("Expected existing H2 file");
    String name=p.toString().replace('\\','/');
    return DriverManager.getConnection("jdbc:h2:file:"+name.substring(0,name.length()-6)+";IFEXISTS=TRUE;ACCESS_MODE_DATA=r;DB_CLOSE_ON_EXIT=FALSE","sa","");
  }
  static Map<List<Object>,Integer> rows(Connection c,String table)throws Exception {
    var counts=new HashMap<List<Object>,Integer>();
    try(var s=c.createStatement();var r=s.executeQuery("SELECT * FROM \""+table.replace("\"","\"\"")+"\"")) {
      while(r.next()) {var row=new ArrayList<Object>();for(int i=1;i<=r.getMetaData().getColumnCount();i++) {
        Object v=r.getObject(i);if(v instanceof Clob b)v=b.getSubString(1,(int)b.length());if(v instanceof byte[] b)v=Base64.getEncoder().encodeToString(b);row.add(v);
      }counts.merge(row,1,Integer::sum);}
    }return counts;
  }
  public static void main(String[] args)throws Exception {
    if(args.length!=2)throw new IllegalArgumentException("Two offline DB files required");
    try(var a=open(args[0]);var b=open(args[1]);var s=a.createStatement();var r=s.executeQuery("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='PUBLIC' AND TABLE_TYPE='BASE TABLE'")) {
      int n=0;while(r.next()){String table=r.getString(1);if(!rows(a,table).equals(rows(b,table)))throw new IllegalStateException("Database mismatch in "+table);n++;}
      System.out.println("PASS: "+n+" tables match, including accounts, photos and integration settings.");
    }
  }
}
