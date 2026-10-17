package com.sprintboard;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Append-only closure record; old imported sprints intentionally have no snapshot. */
@Service
public class SprintClosureStore {
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  public SprintClosureStore(JdbcTemplate jdbc,ObjectMapper mapper){this.jdbc=jdbc;this.mapper=mapper;}
  public Map<String,Object> read(String id){
    var rows=jdbc.queryForList("SELECT payload_json FROM sprint_closure WHERE sprint_id=?",String.class,id);
    if(rows.isEmpty())return null;
    try{return mapper.readValue(rows.getFirst(),new TypeReference<Map<String,Object>>(){});}
    catch(Exception e){throw new IllegalStateException("Kapanış kaydı okunamadı.",e);}
  }
  public void write(String id,Map<String,Object> data){
    try{jdbc.update("INSERT INTO sprint_closure(sprint_id,closed_at,payload_json) VALUES (?,?,?)",id,data.get("closedAt"),mapper.writeValueAsString(data));}
    catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException("Kapanış kaydı saklanamadı.",e);}
  }
  public String fingerprint(Object data){
    try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsString(data).getBytes(StandardCharsets.UTF_8)));}
    catch(Exception e){throw new IllegalStateException("Kapanış kontrolü hesaplanamadı.",e);}
  }
}
