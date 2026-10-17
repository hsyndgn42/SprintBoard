package com.sprintboard;

import java.util.*;
import static com.sprintboard.SprintDigestSnapshot.*;

/** Presentation only: existing capacity/ledger calculations remain the source of truth. */
final class SlackDigestPresentation {
 private SlackDigestPresentation(){}
 private static Map<String,Object> text(String value){return Map.of("type","plain_text","text",value,"emoji",true);}
 private static Map<String,Object> fields(String... values){return Map.of("type","section","fields",Arrays.stream(values).map(SlackDigestPresentation::text).toList());}
 static List<Map<String,Object>> blocks(String name,String time,List<Map<String,Object>> delivery,long done,double capacity,double plan,double support,double actual,double planned){
  var result=new ArrayList<Map<String,Object>>();
  result.add(Map.of("type","header","text",text("📊 "+name.substring(0,Math.min(name.length(),110))+" · Sprint özeti")));
  result.add(Map.of("type","context","elements",List.of(text(time+" · Türkiye saati · Güncel durum"))));
  result.add(Map.of("type","divider"));
  String rate=delivery.isEmpty()?"—":num(100.0*done/delivery.size())+"%";
  result.add(fields("✅ Teslimat · BAU hariç\n"+done+" / "+delivery.size()+" Done", "📈 Tamamlanma\n"+rate,
   "👥 Çekirdek kapasite / plan\n"+num(capacity)+" / "+num(plan)+" sa", "🤝 Dış Support planı\n"+num(support)+" sa",
   "🕒 Gerçekleşen mesai\n"+num(actual)+" sa", "🗓️ Planlanan mesai\n"+num(planned)+" sa"));
  result.add(Map.of("type","divider"));
  var defects=new ArrayList<String>();
  for(String type:List.of("TEST_DEFECT","PROD_DEFECT")){
   var group=delivery.stream().filter(t->"DEFECT".equals(t.get("taskCategory"))&&type.equals(t.get("taskSubtype"))).toList();
   long solved=group.stream().filter(t->"done".equals(status(t))).count();
   defects.add((type.equals("TEST_DEFECT")?"🧪 Test Defect":"🚨 Prod Defect")+"\n"+solved+" çözülen · "+(group.size()-solved)+" açık");
  }
  result.add(fields(defects.toArray(String[]::new)));
  result.add(Map.of("type","context","elements",List.of(text("📎 Review HTML: görevler, grafikler, kişi bazlı mesai ve sprint izin günleri."))));
  return List.copyOf(result);
 }
 private static class Person {String name;double earned,planned;Person(String name){this.name=name;}}
 static String overtimePeople(int sprintNumber,String sprintId,List<Map<String,Object>> history,List<Map<String,Object>> entries){
  var people=new LinkedHashMap<String,Person>();
  for(var row:history)if(n(row,"sprintNumber")==sprintNumber){var p=person(people,row);p.earned+=n(row,"earnedHours");}
  for(var row:entries)if(sprintId.equals(row.get("sprintId"))){var p=person(people,row);p.earned+=n(row,"earnedHours");p.planned+=n(row,"plannedHours");}
  var ordered=people.values().stream().filter(p->p.earned>0||p.planned>0).sorted(Comparator.<Person>comparingDouble(p->p.earned).reversed().thenComparing(p->p.name)).toList();
  var html=new StringBuilder("<section class='section' data-section='overtime-people'><span class='eyebrow'>BU SPRINT · KİŞİ BAZINDA</span><h2>Kim ne kadar mesai yaptı?</h2>");
  if(ordered.isEmpty())return html.append("<p>Bu sprintte kayıtlı mesai yok.</p></section>").toString();
  html.append("<table class='personal-table'><thead><tr><th>Kişi</th><th>Gerçekleşen mesai</th><th>Planlanan mesai</th></tr></thead><tbody>");
  for(var p:ordered)html.append("<tr><th scope='row'>"+h(p.name)+"</th><td data-label='Gerçekleşen'>"+num(p.earned)+" sa</td><td data-label='Planlanan'>"+num(p.planned)+" sa</td></tr>");
  html.append("</tbody><tfoot><tr><th>Toplam</th><td data-label='Gerçekleşen'>"+num(ordered.stream().mapToDouble(p->p.earned).sum())+" sa</td><td data-label='Planlanan'>"+num(ordered.stream().mapToDouble(p->p.planned).sum())+" sa</td></tr></tfoot></table><p class='muted'>Gerçekleşen: onaylı/doğrudan girilen ve tarihsel mesai kayıtları. Bekleyen talepler dahil değildir. Planlanan saatler gerçekleşen mesaiye veya hakedişe eklenmez.</p></section>");
  return html.toString();
 }
 private static Person person(Map<String,Person> people,Map<String,Object> row){String name=s(row,"memberName"),id=s(row,"memberId");return people.computeIfAbsent(id.isBlank()?"name:"+name:id,k->new Person(name.isBlank()?"Kişi belirtilmemiş":name));}
 static String leaves(List<Map<String,Object>> capacity){
  var rows=capacity.stream().filter(c->n(c,"leaveDays")>0).sorted(Comparator.comparing(c->s(c,"memberName"))).toList();
  var html=new StringBuilder("<section class='section' data-section='sprint-leaves'><span class='eyebrow'>YALNIZ BU SPRINT</span><h2>Sprint izinleri</h2>");
  if(rows.isEmpty())return html.append("<p>Bu sprintte kapasiteye yansıyan izin yok.</p></section>").toString();
  html.append("<table class='personal-table'><thead><tr><th>Kişi</th><th>İzin</th></tr></thead><tbody>");
  for(var row:rows)html.append("<tr><th scope='row'>"+h(row.get("memberName"))+"</th><td data-label='İzin'>"+num(n(row,"leaveDays"))+" gün</td></tr>");
  return html.append("</tbody><tfoot><tr><th>Toplam</th><td data-label='İzin'>"+num(rows.stream().mapToDouble(c->n(c,"leaveDays")).sum())+" kişi-gün</td></tr></tfoot></table><p class='muted'>Kapasite hesabındaki izin günleri gösterilir; onay bekleyen talepler ve çalışılmayan ortak tatil günleri dahil değildir. İzin nedenleri ve hakediş bakiyeleri paylaşılmaz.</p></section>").toString();
 }
}
