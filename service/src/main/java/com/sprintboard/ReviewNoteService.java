package com.sprintboard;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Meeting notes are editable follow-up, not part of the immutable delivery snapshot. */
@Service
public class ReviewNoteService {
  private final JdbcTemplate jdbc;
  public ReviewNoteService(JdbcTemplate jdbc){this.jdbc=jdbc;}
  public record Notes(String sprintId,String demoNotes,String stakeholderFeedback,String decisions,String nextSteps,int version,String updatedAt,String updatedBy) {}
  public Notes get(String sprint){
    if(jdbc.queryForObject("SELECT COUNT(*) FROM sprint WHERE id=?",Integer.class,sprint)==0)return null;
    var rows=jdbc.query("SELECT * FROM sprint_review_note WHERE sprint_id=?",(rs,i)->new Notes(rs.getString("sprint_id"),rs.getString("demo_notes"),rs.getString("stakeholder_feedback"),rs.getString("decisions"),rs.getString("next_steps"),rs.getInt("version"),rs.getObject("updated_at",java.time.OffsetDateTime.class).toString(),rs.getString("updated_by")),sprint);
    return rows.isEmpty()?new Notes(sprint,"","","","",0,null,null):rows.getFirst();
  }
  private String text(Map<String,Object> input,String key){
    Object value=input.get(key);
    if(!(value instanceof String text)||text.length()>10000)throw new IllegalArgumentException("Her not alanı metin olmalı ve en fazla 10.000 karakter içermeli.");
    return text.strip();
  }
  @Transactional
  public Notes save(String sprint,Map<String,Object> input,String actor){
    // Lock the parent even for the first save: two empty editors cannot insert over each other.
    if(jdbc.queryForList("SELECT id FROM sprint WHERE id=? FOR UPDATE",sprint).isEmpty())return null;
    Notes current=get(sprint);
    if(!(input.get("version") instanceof Number version)||version.doubleValue()!=current.version())
      throw new IllegalArgumentException("Review notları başka bir işlemde değişti. Taslağınızı koruyup güncel kaydı yükleyin ve yeniden düzenleyin.");
    String demo=text(input,"demoNotes"),feedback=text(input,"stakeholderFeedback"),decisions=text(input,"decisions"),next=text(input,"nextSteps");
    if(actor==null||actor.isBlank()||actor.length()>200)throw new IllegalArgumentException("Geçerli kayıt sahibi gerekli.");
    if(current.version()==0)jdbc.update("INSERT INTO sprint_review_note(sprint_id,demo_notes,stakeholder_feedback,decisions,next_steps,version,updated_at,updated_by) VALUES(?,?,?,?,?,1,CURRENT_TIMESTAMP,?)",sprint,demo,feedback,decisions,next,actor);
    else jdbc.update("UPDATE sprint_review_note SET demo_notes=?,stakeholder_feedback=?,decisions=?,next_steps=?,version=version+1,updated_at=CURRENT_TIMESTAMP,updated_by=? WHERE sprint_id=?",demo,feedback,decisions,next,actor,sprint);
    jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'review-note',?,'review-notes-saved',?)",sprint,"{\"version\":"+(current.version()+1)+"}");
    return get(sprint);
  }
}
