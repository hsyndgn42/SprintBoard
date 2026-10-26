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
 /** Confluence has no stylesheet, so the review export's palette is carried inline. */
 private static final String INK="#183246",MUTED="#607486",LINE="#dce4e8",GREEN="#267a68",RED="#b65c53",PAPER="#faf8f3",TRACK="#e3e8e7";

 private final WorkspaceService workspace; private final ConfluenceConfigStore config; private final JiraConfigStore jira;
 private final ConfluenceTransport transport; private final JdbcTemplate db; private final ObjectMapper mapper;
 public ConfluencePageService(WorkspaceService workspace,ConfluenceConfigStore config,JiraConfigStore jira,ConfluenceTransport transport,JdbcTemplate db,ObjectMapper mapper){
  this.workspace=workspace;this.config=config;this.jira=jira;this.transport=transport;this.db=db;this.mapper=mapper;
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
  String token=config.token(),title=title(sprint),body=storage(sprint,workspace.capacity(sprintId),now,jiraBase());
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

 static String storage(Map<String,Object> sprint,List<Map<String,Object>> capacity,Instant now,String jiraBase){
  var tasks=SprintDigestSnapshot.rows(sprint,"items").stream().filter(t->!SprintDigestSnapshot.leave(t)).toList();
  var core=capacity.stream().filter(c->!Boolean.TRUE.equals(c.get("supportMember"))).toList();
  double available=core.stream().mapToDouble(c->SprintDigestSnapshot.n(c,"availableHours")).sum();
  double planned=core.stream().mapToDouble(c->SprintDigestSnapshot.n(c,"plannedHours")).sum();
  // Overload and slack are counted per person, the way the app reports them. A team
  // total would cancel one member's spare hours against another's missing ones.
  double over=core.stream().mapToDouble(c->Math.max(0,SprintDigestSnapshot.n(c,"plannedHours")-SprintDigestSnapshot.n(c,"availableHours"))).sum();
  double free=core.stream().mapToDouble(c->Math.max(0,SprintDigestSnapshot.n(c,"availableHours")-SprintDigestSnapshot.n(c,"plannedHours"))).sum();

  var out=new StringBuilder(cover(sprint));
  out.append(kpis(List.of(new String[]{"Çekirdek kapasite",SprintDigestSnapshot.num(available)+" sa"},
                          new String[]{"Planlanan efor",SprintDigestSnapshot.num(planned)+" sa"},
                          new String[]{"Kişisel aşım",SprintDigestSnapshot.num(over)+" sa"},
                          new String[]{"Kişisel boşluk",SprintDigestSnapshot.num(free)+" sa"})));
  out.append(people(core));
  if(tasks.isEmpty())out.append(note("Bu sprintte planlanmış iş yok. SprintBoard'da iş ekleyip sayfayı yeniden gönderin."));
  for(String category:CATEGORIES){
   var group=tasks.stream().filter(t->category.equals(Objects.toString(t.get("taskCategory"),""))).toList();
   if(!group.isEmpty())out.append(section(category,group,jiraBase));
  }
  return out.append(footer(now)).toString();
 }

 /** Mirrors the review export's cover: a green rule, the sprint name, then the goal. */
 private static String cover(Map<String,Object> sprint){
  String name=SprintDigestSnapshot.s(sprint,"name"),number=SprintDigestSnapshot.s(sprint,"number");
  String goal=SprintDigestSnapshot.s(sprint,"goal").trim(),status=SprintDigestSnapshot.s(sprint,"status");
  var out=new StringBuilder("<div style=\"border-top: 6px solid "+GREEN+"; background-color: "+PAPER+"; padding: 26px 28px;\">");
  out.append("<p style=\"margin: 0; font-size: 11px; font-weight: bold; letter-spacing: 2px; color: "+GREEN+";\">SPRINT PLANI</p>");
  out.append("<p style=\"margin: 10px 0 4px; font-family: Georgia, serif; font-size: 34px; line-height: 1.15; color: "+INK+";\">")
     .append(h(name.isBlank()?"Sprint "+number:name)).append("</p>");
  out.append("<p style=\"margin: 0; font-size: 13px; color: "+MUTED+";\">")
     .append(h(day(sprint.get("start")))).append(" &#8211; ").append(h(day(sprint.get("end"))))
     .append("&#160;&#160;").append(lozenge(sprintColour(status),sprintLabel(status))).append("</p>");
  out.append("<p style=\"margin: 20px 0 0; padding-top: 18px; border-top: 1px solid #acbcb6; font-family: Georgia, serif; font-size: 19px; line-height: 1.5; color: "+INK+";\">")
     .append(goal.isEmpty()?"Bu sprint için hedef yazılmadı.":h(goal)).append("</p>");
  return out.append("</div>").toString();
 }

 /** Four numbers that decide whether the plan is sound, in the review export's strip. */
 private static String kpis(List<String[]> cells){
  var out=new StringBuilder("<table><colgroup>");
  for(int i=0;i<cells.size();i++)out.append("<col style=\"width: ").append(100/cells.size()).append("%;\" />");
  out.append("</colgroup><tbody><tr>");
  for(var cell:cells)out.append("<td style=\"border: 0; border-top: 1px solid "+LINE+"; border-bottom: 1px solid "+LINE+"; padding: 16px 14px;\">")
     .append("<p style=\"margin: 0; font-size: 11px; color: "+MUTED+";\">").append(h(cell[0])).append("</p>")
     .append("<p style=\"margin: 2px 0 0; font-size: 24px; color: "+INK+";\"><strong>").append(h(cell[1])).append("</strong></p></td>");
  return out.append("</tr></tbody></table>").toString();
 }

 /**
  * A bar per person, because the sprint question is never "is the team full"
  * but "who is over and who still has room".
  */
 private static String people(List<Map<String,Object>> core){
  var rows=core.stream().filter(c->!SprintDigestSnapshot.s(c,"memberName").isBlank())
   .sorted((a,b)->Double.compare(ratio(b),ratio(a))).toList();
  if(rows.isEmpty())return "";
  var out=new StringBuilder(heading("Kişi bazında yük"));
  out.append("<table><colgroup><col style=\"width: 26%;\" /><col style=\"width: 50%;\" /><col style=\"width: 24%;\" /></colgroup><tbody>");
  for(var row:rows){
   double capacity=SprintDigestSnapshot.n(row,"availableHours"),load=SprintDigestSnapshot.n(row,"plannedHours");
   double gap=load-capacity;
   String note=capacity<=0.01?"kapasite girilmemiş":gap>0.01?SprintDigestSnapshot.num(gap)+" sa aşım"
    :gap<-0.01?SprintDigestSnapshot.num(-gap)+" sa boşta":"tam dolu";
   out.append("<tr><td style=\"border: 0; padding: 7px 10px 7px 0;\"><p style=\"margin: 0; font-size: 13px;\">").append(h(row.get("memberName")))
      .append("</p></td><td style=\"border: 0; padding: 7px 10px;\">").append(track(load,capacity))
      .append("</td><td style=\"border: 0; padding: 7px 0 7px 10px;\"><p style=\"margin: 0; font-size: 12px; color: "+MUTED+";\">")
      .append(SprintDigestSnapshot.num(load)).append(" / ").append(capacity<=0.01?"—":SprintDigestSnapshot.num(capacity))
      .append(" sa &#183; ").append(h(note)).append("</p></td></tr>");
  }
  return out.append("</tbody></table>").toString();
 }

 private static double ratio(Map<String,Object> row){
  double capacity=SprintDigestSnapshot.n(row,"availableHours");
  return capacity<=0.01?0:SprintDigestSnapshot.n(row,"plannedHours")/capacity;
 }

 /** The fill is capped at the track, so an overload shows as a full red bar plus the hour gap beside it. */
 private static String track(double load,double capacity){
  if(capacity<=0.01)return fill(100,TRACK);
  int filled=(int)Math.min(100,Math.round(load/capacity*100));
  String colour=load>capacity+0.01?RED:GREEN;
  if(filled>=100)return fill(100,colour);
  if(filled<=0)return fill(100,TRACK);
  return "<table><colgroup><col style=\"width: "+filled+"%;\" /><col style=\"width: "+(100-filled)+"%;\" /></colgroup><tbody><tr>"
   +cell(colour)+cell(TRACK)+"</tr></tbody></table>";
 }
 private static String fill(int width,String colour){
  return "<table><colgroup><col style=\"width: "+width+"%;\" /></colgroup><tbody><tr>"+cell(colour)+"</tr></tbody></table>";
 }
 /** Confluence needs the highlight class as well as the attribute before it paints a cell. */
 private static String cell(String colour){
  return "<td class=\"highlight-"+colour+"\" data-highlight-colour=\""+colour+"\" style=\"background-color: "+colour+"; border: 0; padding: 0;\"><p style=\"margin: 0; font-size: 9px; line-height: 14px;\">&#160;</p></td>";
 }

 private static String section(String category,List<Map<String,Object>> group,String jiraBase){
  double hours=group.stream().mapToDouble(ConfluencePageService::effort).sum();
  var out=new StringBuilder(heading(categoryLabel(category)+" ("+group.size()+" iş, "+SprintDigestSnapshot.num(hours)+" sa)"));
  out.append("<table><colgroup><col style=\"width: 42%;\" /><col style=\"width: 13%;\" /><col style=\"width: 15%;\" /><col style=\"width: 10%;\" /><col style=\"width: 20%;\" /></colgroup>");
  out.append("<thead><tr><th>İş</th><th>PBI</th><th>Durum</th><th>Efor</th><th>Kişiler</th></tr></thead><tbody>");
  for(var task:group){
   var names=new ArrayList<String>();
   for(var assignment:DefectReserve.assignments(task))names.add(h(assignment.get("memberName")));
   String state=SprintDigestSnapshot.status(task);
   out.append("<tr><td>").append(h(task.get("name"))).append("</td><td>").append(issue(task,jiraBase))
      .append("</td><td>").append(lozenge(stateColour(state),SprintDigestSnapshot.label(state)))
      .append("</td><td>").append(SprintDigestSnapshot.num(effort(task))).append(" sa</td><td>")
      .append(names.isEmpty()?"&#160;":String.join(", ",names)).append("</td></tr>");
  }
  return out.append("</tbody></table>").toString();
 }

 /** Readers jump straight to Jira from the plan, so the key links out whenever we know where Jira lives. */
 private static String issue(Map<String,Object> task,String jiraBase){
  String key=SprintDigestSnapshot.s(task,"jiraKey");
  if(key.isBlank())return "&#160;";
  return jiraBase==null||jiraBase.isBlank()?h(key):"<a href=\""+h(jiraBase+"/browse/"+key)+"\">"+h(key)+"</a>";
 }

 private static String heading(String text){
  return "<p style=\"margin: 28px 0 10px; padding-bottom: 8px; border-bottom: 2px solid "+GREEN+"; font-family: Georgia, serif; font-size: 20px; color: "+INK+";\"><strong>"+h(text)+"</strong></p>";
 }
 private static String note(String text){
  return "<p style=\"margin: 20px 0; padding: 12px 16px; border-left: 3px solid "+GREEN+"; background-color: #f0f4f0; font-size: 12px; color: "+MUTED+";\">"+h(text)+"</p>";
 }
 private static String footer(Instant now){
  String time=DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm").withZone(ZoneId.of("Europe/Istanbul")).format(now);
  return "<p style=\"margin: 32px 0 0; padding-top: 16px; border-top: 1px solid "+LINE+"; font-size: 11px; color: "+MUTED+";\">SprintBoard "
   +h(time)+"'de yazdı. Sayfa her gönderimde yenilenir, izin kayıtları paylaşılmaz.</p>";
 }

 /** Turkish long dates read better here than Confluence's own English date lozenge. */
 private static String day(Object value){
  String text=Objects.toString(value,"");
  if(!text.matches("\\d{4}-\\d{2}-\\d{2}"))return text;
  return LocalDate.parse(text).format(DateTimeFormatter.ofPattern("d MMMM yyyy",Locale.forLanguageTag("tr-TR")));
 }
 private static String lozenge(String colour,String title){
  return "<ac:structured-macro ac:name=\"status\">"+param("colour",colour)+param("title",title)+"</ac:structured-macro>";
 }
 private static String param(String name,String value){
  return "<ac:parameter ac:name=\""+h(name)+"\">"+h(value)+"</ac:parameter>";
 }
 private static String stateColour(String state){
  return switch(state){case "done"->"Green";case "doing"->"Blue";case "undone"->"Red";default->"Grey";};
 }
 private static String sprintColour(String status){
  return switch(status){case "active"->"Green";case "planned"->"Blue";case "completed"->"Grey";default->"Grey";};
 }
 private static String sprintLabel(String status){
  return switch(status){case "active"->"Aktif";case "planned"->"Planlandı";case "completed"->"Tamamlandı";default->"Taslak";};
 }

 private static double effort(Map<String,Object> task){
  return task.containsKey("planningHours")?SprintDigestSnapshot.n(task,"planningHours"):SprintDigestSnapshot.n(task,"estimatedHours");
 }
 /** A missing or unreachable Jira only costs the links, never the page. */
 private String jiraBase(){
  try{return jira.load().baseUrl();}catch(RuntimeException e){return "";}
 }
 private static String h(Object value){return SprintDigestSnapshot.h(value);}
 static String categoryLabel(String category){
  return switch(category){
   case "DEV"->"Geliştirme";case "DESIGN"->"Tasarım";case "ANALYZE"->"Analiz ve keşif";
   case "TEST"->"Test ve kalite";case "DEFECT"->"Hata düzeltme";case "BAU"->"Tekrarlayan ekip işi";
   default->"Diğer";
  };
 }
}
