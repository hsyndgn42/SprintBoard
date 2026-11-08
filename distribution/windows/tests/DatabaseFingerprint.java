import java.sql.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Test helper: hashes table values; never outputs credentials or personal records. */
public class DatabaseFingerprint {
  public static void main(String[] args)throws Exception {
    var output=new ArrayList<String>();
    try(var connection=DriverManager.getConnection("jdbc:h2:file:"+args[0]+";IFEXISTS=TRUE;DB_CLOSE_ON_EXIT=FALSE","sa","");
        var tables=connection.createStatement().executeQuery("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='PUBLIC' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")){
      while(tables.next()){
        String table=tables.getString(1);var rows=new ArrayList<String>();
        try(var statement=connection.createStatement();var values=statement.executeQuery("SELECT * FROM \""+table.replace("\"","\"\"")+"\"")){
          while(values.next()){
            var hash=MessageDigest.getInstance("SHA-256");
            for(int i=1;i<=values.getMetaData().getColumnCount();i++){
              String value=values.getString(i);
              if(value==null)hash.update((byte)0);
              else{hash.update((byte)1);byte[] bytes=value.getBytes(StandardCharsets.UTF_8);hash.update(java.nio.ByteBuffer.allocate(4).putInt(bytes.length).array());hash.update(bytes);}
            }
            rows.add(HexFormat.of().formatHex(hash.digest()));
          }
        }
        Collections.sort(rows);
        String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(String.join("\n",rows).getBytes(StandardCharsets.US_ASCII)));
        output.add(table+"\t"+rows.size()+"\t"+hash);
      }
    }
    Files.write(Path.of(args[1]),output,StandardCharsets.UTF_8);
    System.out.println("Fingerprinted "+output.size()+" tables; no row values exported.");
  }
}
