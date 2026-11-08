package com.sprintboard;

import com.fasterxml.jackson.databind.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** Publishes an explicitly previewed selection to one existing, dedicated wiki page. */
@Service
public class ConfluenceBacklogService {
 private final WorkspaceService workspace;private final ConfluenceConfigStore configs;private final JiraConfigStore jira;
 private final ConfluenceTransport transport;private final JdbcTemplate db;private final ObjectMapper mapper;private final Clock clock;
 public ConfluenceBacklogService(WorkspaceService workspace,ConfluenceConfigStore configs,JiraConfigStore jira,ConfluenceTransport transport,JdbcTemplate db,ObjectMapper mapper,Clock clock){this.workspace=workspace;this.configs=configs;this.jira=jira;this.transport=transport;this.db=db;this.mapper=mapper;this.clock=clock;}
 public record Row(String id,String title,String category,String typeLabel,String roadmap,String priority,String stage,String state,String stateLabel,String sprint,String jiraKey,String jiraUrl,double estimatedHours,String estimate){}
 public record Preview(String pageId,String pageUrl,String pageTitle,int pageVersion,int configVersion,String generatedAt,String fingerprint,String scope,List<String> itemIds,List<Row> rows,int excludedLeave,int pool,int planned,int active){}
 private record Selection(List<String> ids,String scope){}
 private record Target(String title,int version){}
 private static String text(Map<String,Object> m,String key){return Objects.toString(m.get(key),"");}
 private static String h(Object value){return SprintDigestSnapshot.h(value);}
 private static String number(double value){return SprintDigestSnapshot.num(value);}
 private static String pageUrl(ConfluenceConfigStore.Config c){return c.backlogPageId().isBlank()?"":c.baseUrl()+"/pages/viewpage.action?pageId="+c.backlogPageId();}

 public Map<String,Object> status(){
  var c=configs.load();var out=new LinkedHashMap<String,Object>();out.put("enabled",c.enabled());out.put("configured",!c.backlogPageId().isBlank()&&c.patConfigured());out.put("pageId",c.backlogPageId());out.put("pageUrl",pageUrl(c));
  var last=db.query("SELECT published_at,item_count,scope_label FROM confluence_backlog_publish WHERE id=1 AND base_url=? AND page_id=?",(rs,n)->Map.<String,Object>of("publishedAt",rs.getString(1),"itemCount",rs.getInt(2),"scope",rs.getString(3)),c.baseUrl(),c.backlogPageId());
  out.put("lastPublish",last.isEmpty()?null:last.getFirst());return out;
 }
 @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
 public Preview preview(Map<String,Object> input){return build(selection(input),configured(),clock.instant());}

 @Transactional(isolation=Isolation.REPEATABLE_READ)
 public Map<String,Object> publish(Map<String,Object> input){
  if(!Boolean.TRUE.equals(input.get("confirmed")))throw new IllegalArgumentException("Önizlemeyi kontrol edip gönderimi onaylayın.");
  Instant at;try{at=Instant.parse(text(input,"generatedAt"));}catch(Exception e){throw new IllegalArgumentException("Göndermeden önce önizlemeyi açın.");}
  if(at.isBefore(clock.instant().minusSeconds(900))||at.isAfter(clock.instant().plusSeconds(30)))throw new IllegalArgumentException("Önizlemenin süresi doldu; yeniden açın.");
  // Prevent a settings change or a second publish from switching the destination during the write.
  db.queryForList("SELECT id FROM confluence_config WHERE id=1 FOR UPDATE");
  var c=configured();var p=build(selection(input),c,at);
  if(!MessageDigest.isEqual(p.fingerprint().getBytes(StandardCharsets.UTF_8),text(input,"fingerprint").getBytes(StandardCharsets.UTF_8)))throw new IllegalArgumentException("İşler, ayarlar veya wiki sayfası değişmiş. Önizlemeyi yenileyin.");
  String body=storage(p);if(body.getBytes(StandardCharsets.UTF_8).length>3_500_000)throw new IllegalArgumentException("Wiki içeriği çok büyük. Backlog filtrelerini daraltın.");
  var payload=mapper.createObjectNode();payload.put("id",p.pageId());payload.put("type","page");payload.put("title",p.pageTitle());
  payload.putObject("space").put("key",c.spaceKey());payload.putObject("version").put("number",p.pageVersion()+1).put("message","SprintBoard Backlog güncellemesi");
  payload.putObject("body").putObject("storage").put("value",body).put("representation","storage");
  var result=transport.put(c.baseUrl(),configs.token(),"/rest/api/content/"+p.pageId(),payload);
  if(!p.pageId().equals(result.path("id").asText())||result.path("version").path("number").asInt()!=p.pageVersion()+1)throw new IllegalStateException("Wiki gönderim sonucu doğrulanamadı. Yeniden göndermeden önce wiki sayfasını kontrol edin.");
  String sentAt=clock.instant().toString(),actor=TaskActivity.actor();
  db.update("MERGE INTO confluence_backlog_publish(id,base_url,page_id,page_version,published_at,published_by,item_count,scope_label) KEY(id) VALUES(1,?,?,?,?,?,?,?)",c.baseUrl(),p.pageId(),p.pageVersion()+1,sentAt,actor,p.rows().size(),p.scope());
  try{db.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'confluence','backlog','backlog-published',?)",mapper.writeValueAsString(Map.of("actor",actor,"pageId",p.pageId(),"pageVersion",p.pageVersion()+1,"itemCount",p.rows().size(),"scope",p.scope())));}catch(com.fasterxml.jackson.core.JsonProcessingException e){throw new IllegalStateException(e);}
  return Map.of("pageId",p.pageId(),"pageUrl",p.pageUrl(),"pageVersion",p.pageVersion()+1,"publishedAt",sentAt,"itemCount",p.rows().size());
 }
 private Selection selection(Map<String,Object> input){
  if(!(input.get("itemIds") instanceof List<?> raw)||raw.size()>5000)throw new IllegalArgumentException("Wikiye en fazla 5000 iş gönderilebilir; filtreleri daraltın.");
  var ids=new ArrayList<String>();var unique=new HashSet<String>();
  for(var id:raw){if(!(id instanceof String s)||s.isBlank()||s.length()>160||!unique.add(s))throw new IllegalArgumentException("İş seçimi geçersiz. Backlog’u yenileyin.");ids.add(s);}
  String scope=text(input,"scope").trim();if(scope.isBlank()||scope.length()>2000||scope.chars().anyMatch(Character::isISOControl))throw new IllegalArgumentException("Gönderim kapsamı geçersiz.");
  return new Selection(List.copyOf(ids),scope);
 }
 private ConfluenceConfigStore.Config configured(){
  var c=configs.load();if(!c.enabled())throw new IllegalArgumentException("Confluence entegrasyonu kapalı. Ayarlar’dan açın.");
  if(!c.backlogPageId().matches("[1-9][0-9]{0,17}")||!c.patConfigured())throw new IllegalArgumentException("Ayarlar → Confluence bölümüne Backlog sayfa ID’si ve token girin.");
  if(c.backlogPageId().equals(c.parentPageId())||db.queryForObject("SELECT COUNT(*) FROM confluence_page_link WHERE page_id=?",Integer.class,c.backlogPageId())>0)throw new IllegalArgumentException("Bu sayfa sprint planları için kullanılıyor. Backlog için ayrı bir wiki sayfası seçin.");
  return c;
 }
 private Target target(ConfluenceConfigStore.Config c){
  var page=transport.get(c.baseUrl(),configs.token(),"/rest/api/content/"+c.backlogPageId(),Map.of("expand","version,space"));
  if(!c.backlogPageId().equals(page.path("id").asText())||!"page".equals(page.path("type").asText())||!"current".equals(page.path("status").asText()))throw new IllegalArgumentException("Backlog hedefi yayındaki bir Confluence sayfası olmalı.");
  if(!c.spaceKey().equalsIgnoreCase(page.path("space").path("key").asText()))throw new IllegalArgumentException("Backlog sayfası ayarlardaki Confluence alanına ait değil.");
  int version=page.path("version").path("number").asInt();String title=page.path("title").asText();
  if(version<1||title.isBlank())throw new IllegalStateException("Wiki sayfasının başlığı veya sürümü okunamadı.");return new Target(title,version);
 }
 private Preview build(Selection selection,ConfluenceConfigStore.Config c,Instant at){
  var target=target(c);var byId=new HashMap<String,Map<String,Object>>();workspace.backlog().forEach(i->byId.put(text(i,"id"),i));
  var subtypeLabels=new HashMap<String,String>();db.query("SELECT code,label FROM task_subtype",rs->{subtypeLabels.put(rs.getString(1),rs.getString(2));});
  String jiraBase;try{jiraBase=jira.load().baseUrl();}catch(RuntimeException e){jiraBase="";}
  String estimateMode=Objects.toString(workspace.settings().get("estimationMode"),"");var rows=new ArrayList<Row>();int excluded=0;
  for(String id:selection.ids()){
   var item=byId.get(id);if(item==null)throw new IllegalArgumentException("Seçilen bir iş artık bulunamıyor; Backlog’u yenileyin.");
   if(SprintDigestSnapshot.leave(item)){excluded++;continue;}
   String category=text(item,"taskCategory"),subtype=text(item,"taskSubtype"),sprintStatus=text(item,"sprintStatus"),state=text(item,"taskStatus").toLowerCase(Locale.ROOT);
   boolean pool=text(item,"sprintId").isBlank()&&"Ready".equals(item.get("state"));
   String stage=pool?"POOL":"planned".equals(sprintStatus)?"PLANNED":"active".equals(sprintStatus)?"ACTIVE":"CLOSED";
   if(state.isBlank())state=text(item,"state").toLowerCase(Locale.ROOT);
   String label=pool?"Havuzda":"PLANNED".equals(stage)?"Planlandı":SprintDigestSnapshot.label(state);
   String estimate="SIZE_AND_HOURS".equals(estimateMode)?text(item,"size"):(item.get("storyPoints") instanceof Number n?number(n.doubleValue())+" SP":"");
   String key=SprintDigestSnapshot.key(item);
   rows.add(new Row(id,text(item,"title"),category,category+(subtype.isBlank()?"":" · "+subtypeLabels.getOrDefault(subtype,subtype)),text(item,"roadmapTitle"),priority(text(item,"priority")),stage,state,label,text(item,"sprintName"),key,SprintDigestSnapshot.issueUrl(key,jiraBase),SprintDigestSnapshot.n(item,"estimatedHours"),estimate));
  }
  String fingerprint;
  try{fingerprint=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(List.of("backlog-wiki-v1",c.baseUrl(),c.spaceKey(),c.backlogPageId(),c.version(),target,at.toString(),selection,rows))));}catch(Exception e){throw new IllegalStateException("Önizleme oluşturulamadı.",e);}
  return new Preview(c.backlogPageId(),pageUrl(c),target.title(),target.version(),c.version(),at.toString(),fingerprint,selection.scope(),selection.ids(),rows,excluded,(int)rows.stream().filter(r->r.stage().equals("POOL")).count(),(int)rows.stream().filter(r->r.stage().equals("PLANNED")).count(),(int)rows.stream().filter(r->r.stage().equals("ACTIVE")).count());
 }
 static String priority(String code){return switch(code){case "URGENT"->"Acil";case "HIGH"->"Yüksek";case "NORMAL"->"Normal";case "LOW"->"Düşük";default->"—";};}
 static String storage(Preview p){
  var out=new StringBuilder(ConfluencePageService.note("Kapsam: "+p.scope()));
  out.append(ConfluencePageService.kpis(List.of(new String[]{"Toplam iş",String.valueOf(p.rows().size()),"#183246"},new String[]{"Havuzda",String.valueOf(p.pool()),"#183246"},new String[]{"Planlanan sprintlerde",String.valueOf(p.planned()),"#183246"},new String[]{"Aktif sprintte",String.valueOf(p.active()),"#183246"})));
  if(p.rows().isEmpty())out.append(ConfluencePageService.note("Bu görünümde paylaşılacak iş yok."));
  else{
   out.append(ConfluencePageService.heading("Backlog işleri"));
   var categories=new LinkedHashSet<>(List.of("DESIGN","DEV","ANALYZE","TEST","DEFECT","OTHER","BAU"));p.rows().forEach(r->categories.add(r.category()));
   for(String category:categories){var group=p.rows().stream().filter(r->r.category().equals(category)).toList();if(group.isEmpty())continue;
    out.append(ConfluencePageService.subheading(ConfluencePageService.categoryLabel(category),group.size()+" iş"));
    out.append("<table style=\"width: 100%;\"><thead><tr><th>İş / tür</th><th>Roadmap</th><th>Öncelik</th><th>Durum / Sprint</th><th>Tahmin</th><th>PBI</th></tr></thead><tbody>");
    for(var r:group){String colour=r.stage().equals("PLANNED")?"Blue":switch(r.state()){case "done"->"Green";case "doing"->"Blue";case "undone"->"Red";default->"Grey";};
     out.append("<tr><td><strong>").append(h(r.title())).append("</strong><br />").append(h(r.typeLabel())).append("</td><td>").append(h(r.roadmap().isBlank()?"Roadmap bağlantısı yok":r.roadmap())).append("</td><td>").append(h(r.priority())).append("</td><td>").append(ConfluencePageService.lozenge(colour,r.stateLabel())).append("<br />").append(h(r.sprint())).append("</td><td>").append(r.estimatedHours()>0?number(r.estimatedHours())+" sa":"Saat belirtilmedi").append(r.estimate().isBlank()?"":"<br />"+h(r.estimate())).append("</td><td>").append(r.jiraUrl().isBlank()?h(r.jiraKey()):"<a href=\""+h(r.jiraUrl())+"\">"+h(r.jiraKey())+"</a>").append("</td></tr>");
    }out.append("</tbody></table>");
   }
  }
  out.append(ConfluencePageService.note("Tahminler Backlog’daki kayıtlı değerlerdir; gerçekleşen çalışma süresi değildir. İzin işleri ve kişisel izin bilgileri paylaşılmaz."));
  return out.append(ConfluencePageService.footer(Instant.parse(p.generatedAt()))).toString();
 }
}
