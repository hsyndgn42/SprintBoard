package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/**
 * Publishes a sprint plan as a Confluence page in storage format.
 * The page id is remembered per sprint so a second publish updates the same page
 * rather than leaving the space with a trail of near-identical drafts.
 */
@Service
public class ConfluencePageService {
 /** Mirrors the review export so the wiki and the HTML tell the same story in the same order. */
 private static final List<String> CATEGORIES=List.of("DESIGN","DEV","ANALYZE","TEST","DEFECT","OTHER","BAU");

 private final WorkspaceService workspace; private final ConfluenceConfigStore config;
 private final ConfluenceTransport transport; private final JdbcTemplate db; private final ObjectMapper mapper;
 public ConfluencePageService(WorkspaceService workspace,ConfluenceConfigStore config,ConfluenceTransport transport,JdbcTemplate db,ObjectMapper mapper){
  this.workspace=workspace;this.config=config;this.transport=transport;this.db=db;this.mapper=mapper;
 }

 public record Published(String pageId,String pageUrl,int pageVersion,String title){}

 public Map<String,Object> link(String sprintId){
  var rows=db.queryForList("SELECT page_id,page_url,page_version,published_at,published_by FROM confluence_page_link WHERE sprint_id=?",sprintId);
  return rows.isEmpty()?Map.of():rows.getFirst();
 }

 @Transactional(isolation=Isolation.REPEATABLE_READ)
 public Published publish(String sprintId,String actor,Instant now){
  var settings=config.load();
  if(!settings.enabled())throw new IllegalArgumentException("Confluence entegrasyonu kapalı. Ayarlar · Entegrasyonlar bölümünden açın.");
  var sprint=workspace.sprint(sprintId);
  if(sprint==null)throw new IllegalArgumentException("Sprint bulunamadı.");
  String token=config.token(),title=title(sprint),body=storage(sprint,workspace.capacity(sprintId),now);
  var existing=db.queryForList("SELECT page_id FROM confluence_page_link WHERE sprint_id=?",sprintId);
  Published result=existing.isEmpty()
   ?create(settings,token,title,body)
   :update(settings,token,existing.getFirst().get("page_id").toString(),title,body);
  db.update("DELETE FROM confluence_page_link WHERE sprint_id=?",sprintId);
  db.update("INSERT INTO confluence_page_link(sprint_id,page_id,page_url,page_version,published_at,published_by) VALUES(?,?,?,?,?,?)",
   sprintId,result.pageId(),result.pageUrl(),result.pageVersion(),DateTimeFormatter.ISO_INSTANT.format(now),actor==null?"":actor);
  return result;
 }

 private Published create(ConfluenceConfigStore.Config settings,String token,String title,String body){
  ObjectNode payload=mapper.createObjectNode();
  payload.put("type","page");payload.put("title",title);
  payload.putObject("space").put("key",settings.spaceKey());
  payload.putObject("body").putObject("storage").put("value",body).put("representation","storage");
  if(!settings.parentPageId().isBlank())payload.putArray("ancestors").addObject().put("id",settings.parentPageId());
  return read(settings,transport.post(settings.baseUrl(),token,"/rest/api/content",payload),title);
 }

 private Published update(ConfluenceConfigStore.Config settings,String token,String pageId,String title,String body){
  // Confluence rejects an update whose version is not exactly current+1, so read it first.
  var current=transport.get(settings.baseUrl(),token,"/rest/api/content/"+pageId,Map.of("expand","version"));
  ObjectNode payload=mapper.createObjectNode();
  payload.put("id",pageId);payload.put("type","page");payload.put("title",title);
  payload.putObject("space").put("key",settings.spaceKey());
  payload.putObject("version").put("number",current.path("version").path("number").asInt(1)+1).put("message","SprintBoard güncellemesi");
  payload.putObject("body").putObject("storage").put("value",body).put("representation","storage");
  return read(settings,transport.put(settings.baseUrl(),token,"/rest/api/content/"+pageId,payload),title);
 }

 private Published read(ConfluenceConfigStore.Config settings,com.fasterxml.jackson.databind.JsonNode page,String title){
  String id=page.path("id").asText("");
  if(id.isBlank())throw new IllegalStateException("Confluence sayfa kimliği okunamadı.");
  String webui=page.path("_links").path("webui").asText("");
  return new Published(id,webui.isBlank()?settings.baseUrl()+"/pages/viewpage.action?pageId="+id:settings.baseUrl()+webui,page.path("version").path("number").asInt(1),title);
 }

 /** Confluence titles are unique per space, so the sprint number keeps reruns off each other. */
 static String title(Map<String,Object> sprint){
  return "Sprint "+SprintDigestSnapshot.s(sprint,"number")+" · "+SprintDigestSnapshot.s(sprint,"name")+" · Plan";
 }

 static String storage(Map<String,Object> sprint,List<Map<String,Object>> capacity,Instant now){
  var tasks=SprintDigestSnapshot.rows(sprint,"items").stream().filter(t->!SprintDigestSnapshot.leave(t)).toList();
  var delivery=tasks.stream().filter(t->!BauPolicy.isBau(t)).toList();
  double deliveryHours=delivery.stream().mapToDouble(ConfluencePageService::effort).sum();
  double bauHours=tasks.stream().filter(BauPolicy::isBau).mapToDouble(ConfluencePageService::effort).sum();
  double available=capacity.stream().filter(c->!Boolean.TRUE.equals(c.get("supportMember"))).mapToDouble(c->SprintDigestSnapshot.n(c,"availableHours")).sum();
  String time=DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm").withZone(ZoneId.of("Europe/Istanbul")).format(now);

  var out=new StringBuilder();
  out.append("<p><strong>Hedef:</strong> ").append(h(sprint.get("goal"))).append("</p>");
  out.append("<p>").append(h(sprint.get("start"))).append(" — ").append(h(sprint.get("end")))
     .append(" · Durum: ").append(h(sprint.get("status"))).append("</p>");
  out.append("<table><tbody>")
     .append(row("Teslimat işi",delivery.size()+" iş"))
     .append(row("Planlanan teslimat eforu",SprintDigestSnapshot.num(deliveryHours)+" sa"))
     .append(row("Planlanan BAU eforu",SprintDigestSnapshot.num(bauHours)+" sa"))
     .append(row("Çekirdek ekip kapasitesi",SprintDigestSnapshot.num(available)+" sa"))
     .append("</tbody></table>");

  for(String category:CATEGORIES){
   var group=tasks.stream().filter(t->category.equals(Objects.toString(t.get("taskCategory"),""))).toList();
   if(group.isEmpty())continue;
   out.append("<h2>").append(h(categoryLabel(category))).append(" · ").append(group.size()).append("</h2>");
   out.append("<table><tbody><tr><th>İş</th><th>Durum</th><th>Efor</th><th>Kişiler</th></tr>");
   for(var task:group){
    var names=new ArrayList<String>();
    for(var assignment:DefectReserve.assignments(task))names.add(h(assignment.get("memberName")));
    out.append("<tr><td>").append(h(task.get("name"))).append("</td><td>").append(h(SprintDigestSnapshot.label(SprintDigestSnapshot.status(task))))
       .append("</td><td>").append(SprintDigestSnapshot.num(effort(task))).append(" sa</td><td>")
       .append(names.isEmpty()?"—":String.join(", ",names)).append("</td></tr>");
   }
   out.append("</tbody></table>");
  }
  if(tasks.isEmpty())out.append("<p>Bu sprintte planlanmış iş yok.</p>");
  out.append("<p><em>SprintBoard tarafından ").append(h(time)).append(" (Europe/Istanbul) oluşturuldu. İzin kayıtları ve kişisel ayrıntılar paylaşılmaz.</em></p>");
  return out.toString();
 }

 private static double effort(Map<String,Object> task){
  return task.containsKey("planningHours")?SprintDigestSnapshot.n(task,"planningHours"):SprintDigestSnapshot.n(task,"estimatedHours");
 }
 private static String row(String label,String value){return "<tr><th>"+h(label)+"</th><td>"+h(value)+"</td></tr>";}
 private static String h(Object value){return SprintDigestSnapshot.h(value);}
 static String categoryLabel(String category){
  return switch(category){
   case "DEV"->"Geliştirme";case "DESIGN"->"Tasarım";case "ANALYZE"->"Analiz ve keşif";
   case "TEST"->"Test ve kalite";case "DEFECT"->"Hata düzeltme";case "BAU"->"Tekrarlayan ekip işi";
   default->"Diğer";
  };
 }
}
