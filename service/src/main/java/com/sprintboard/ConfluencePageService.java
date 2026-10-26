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
 /** Confluence offers no stylesheet, so meaning has to ride on a small fixed palette. */
 private static final String INK="#0E3A45",PAPER="#F5F7FA",EDGE="#C9D4DE",DELIVERY="#A8CDD1",BAU="#E6D2A8",SPARE="#EEF1F6",OVER="#E8BDB8";

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
  double deliveryHours=tasks.stream().filter(t->!BauPolicy.isBau(t)).mapToDouble(ConfluencePageService::effort).sum();
  double bauHours=tasks.stream().filter(BauPolicy::isBau).mapToDouble(ConfluencePageService::effort).sum();
  double available=capacity.stream().filter(c->!Boolean.TRUE.equals(c.get("supportMember"))).mapToDouble(c->SprintDigestSnapshot.n(c,"availableHours")).sum();
  var out=new StringBuilder(hero(sprint)).append(load(deliveryHours,bauHours,available));
  if(tasks.isEmpty())out.append("<p>Bu sprintte planlanmış iş yok. SprintBoard'da iş ekleyip sayfayı yeniden gönderin.</p>");
  for(String category:CATEGORIES){
   var group=tasks.stream().filter(t->category.equals(Objects.toString(t.get("taskCategory"),""))).toList();
   if(!group.isEmpty())out.append(section(category,group,jiraBase));
  }
  return out.append(people(tasks)).append(footer(now)).toString();
 }

 /** The goal is the only sentence most readers need, so it opens the page instead of a row of counters. */
 private static String hero(Map<String,Object> sprint){
  String name=SprintDigestSnapshot.s(sprint,"name"),goal=SprintDigestSnapshot.s(sprint,"goal").trim(),status=SprintDigestSnapshot.s(sprint,"status");
  var out=new StringBuilder("<ac:structured-macro ac:name=\"panel\">");
  out.append(param("title",name.isBlank()?"Sprint "+SprintDigestSnapshot.s(sprint,"number"):name))
     .append(param("titleBGColor",INK)).append(param("titleColor","#FFFFFF"))
     .append(param("bgColor",PAPER)).append(param("borderColor",EDGE))
     .append("<ac:rich-text-body>");
  out.append("<h2>").append(goal.isEmpty()?"Bu sprint için hedef yazılmadı.":h(goal)).append("</h2>");
  out.append("<p>").append(date(sprint.get("start"))).append(" &#8211; ").append(date(sprint.get("end")))
     .append("&#160;&#160;").append(lozenge(sprintColour(status),sprintLabel(status))).append("</p>");
  return out.append("</ac:rich-text-body></ac:structured-macro>").toString();
 }

 /**
  * One proportional bar answers the planning question: does the work fit?
  * Under capacity it splits delivery, BAU and idle time; over capacity it splits what
  * fits from what does not, because by then that is the only number worth reading.
  */
 private static String load(double deliveryHours,double bauHours,double available){
  double planned=deliveryHours+bauHours,span=Math.max(Math.max(available,planned),0.01),over=planned-available;
  var out=new StringBuilder("<h2>Yük</h2>");
  if(over>0.01){
   int fits=share(available,span);
   out.append(bar(List.of(new Segment(fits,DELIVERY,SprintDigestSnapshot.num(available)+" sa kapasite"),
                          new Segment(100-fits,OVER,SprintDigestSnapshot.num(over)+" sa sığmıyor"))));
   out.append("<p>Kapasite ").append(SprintDigestSnapshot.num(available)).append(" sa, planlanan ")
      .append(SprintDigestSnapshot.num(planned)).append(" sa. Aradaki ").append(SprintDigestSnapshot.num(over))
      .append(" sa için kapsamı daraltın ya da kapasite ekleyin.</p>");
  }else{
   int delivery=share(deliveryHours,span),bau=share(bauHours,span);
   out.append(bar(List.of(new Segment(delivery,DELIVERY,SprintDigestSnapshot.num(deliveryHours)+" sa teslimat"),
                          new Segment(bau,BAU,SprintDigestSnapshot.num(bauHours)+" sa BAU"),
                          new Segment(100-delivery-bau,SPARE,SprintDigestSnapshot.num(available-planned)+" sa boşta"))));
   out.append("<p>").append(SprintDigestSnapshot.num(available)).append(" sa kapasitenin ")
      .append(SprintDigestSnapshot.num(planned)).append(" sa'i planlandı.</p>");
  }
  return out.toString();
 }

 private record Segment(int width,String colour,String label){}
 private static int share(double part,double span){return (int)Math.round(Math.max(part,0)/span*100);}

 private static String bar(List<Segment> segments){
  var visible=segments.stream().filter(s->s.width()>0).toList();
  if(visible.isEmpty())return "";
  var out=new StringBuilder("<table><colgroup>");
  for(var segment:visible)out.append("<col style=\"width: ").append(segment.width()).append("%;\" />");
  out.append("</colgroup><tbody><tr>");
  // Below roughly a sixth of the width a label wraps into noise, so the colour carries it alone.
  for(var segment:visible)out.append("<td data-highlight-colour=\"").append(segment.colour()).append("\"><p>")
     .append(segment.width()>=17?h(segment.label()):"&#160;").append("</p></td>");
  return out.append("</tr></tbody></table>").toString();
 }

 private static String section(String category,List<Map<String,Object>> group,String jiraBase){
  var out=new StringBuilder("<h2>").append(h(categoryLabel(category))).append(" (").append(group.size()).append(" iş)</h2>");
  out.append("<table><colgroup><col style=\"width: 44%;\" /><col style=\"width: 12%;\" /><col style=\"width: 14%;\" /><col style=\"width: 10%;\" /><col style=\"width: 20%;\" /></colgroup>");
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

 /** Everyone scrolls here to find their own name, so it is sorted by load rather than alphabetically. */
 private static String people(List<Map<String,Object>> tasks){
  var load=new LinkedHashMap<String,double[]>();
  for(var task:tasks)for(var assignment:DefectReserve.assignments(task)){
   String name=SprintDigestSnapshot.s(assignment,"memberName");
   if(name.isBlank())continue;
   var totals=load.computeIfAbsent(name,key->new double[2]);
   totals[0]+=DefectReserve.planned(assignment);totals[1]++;
  }
  if(load.isEmpty())return "";
  var out=new StringBuilder("<h2>Kim ne yapıyor</h2>");
  out.append("<table><colgroup><col style=\"width: 50%;\" /><col style=\"width: 25%;\" /><col style=\"width: 25%;\" /></colgroup>");
  out.append("<thead><tr><th>Kişi</th><th>İş</th><th>Efor</th></tr></thead><tbody>");
  load.entrySet().stream().sorted((a,b)->Double.compare(b.getValue()[0],a.getValue()[0])).forEach(entry->
   out.append("<tr><td>").append(h(entry.getKey())).append("</td><td>").append((int)entry.getValue()[1])
      .append("</td><td>").append(SprintDigestSnapshot.num(entry.getValue()[0])).append(" sa</td></tr>"));
  return out.append("</tbody></table>").toString();
 }

 private static String footer(Instant now){
  String time=DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm").withZone(ZoneId.of("Europe/Istanbul")).format(now);
  return "<hr /><p><em>SprintBoard "+h(time)+"'de yazdı. Sayfa her gönderimde yenilenir, izin kayıtları paylaşılmaz.</em></p>";
 }

 /** Confluence turns an ISO date into a date lozenge; anything else is printed as written. */
 private static String date(Object value){
  String text=Objects.toString(value,"");
  return text.matches("\\d{4}-\\d{2}-\\d{2}")?"<time datetime=\""+text+"\" />":h(text);
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
