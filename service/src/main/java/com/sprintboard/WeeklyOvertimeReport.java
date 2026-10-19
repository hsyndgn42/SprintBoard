package com.sprintboard;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class WeeklyOvertimeReport {
 private final JdbcTemplate db;private final ObjectMapper mapper;
 public WeeklyOvertimeReport(JdbcTemplate db,ObjectMapper mapper){this.db=db;this.mapper=mapper;}
 public record Report(String from,String to,String html,List<Map<String,Object>> blocks,List<Map<String,Object>> people){}
 static LocalDate previousMonday(LocalDate date){return date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(1);}
 static double num(Object value){return value instanceof Number n?n.doubleValue():0;}
 static String format(double value){return java.math.BigDecimal.valueOf(Math.round(value*100)/100d).stripTrailingZeros().toPlainString();}
 static String escape(Object value){return Objects.toString(value,"").replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;");}
 @org.springframework.transaction.annotation.Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
 public Report build(LocalDate from,Instant generated){
  LocalDate to=from.plusDays(6);var balances=new LeaveLedgerService(db,mapper).balances();var people=new ArrayList<Map<String,Object>>();
  for(var member:db.queryForList("SELECT id,name FROM member WHERE active=TRUE ORDER BY name")){
   String id=member.get("ID").toString();var balance=balances.stream().filter(b->id.equals(b.get("memberId"))).findFirst().orElseThrow();
   double weekly=db.queryForObject("SELECT COALESCE(SUM(e.earned_hours),0) FROM overtime_entry e WHERE e.member_id=? AND EXISTS (SELECT 1 FROM overtime_request r WHERE r.entry_id=e.id AND r.status='APPROVED' AND r.work_date BETWEEN ? AND ?)",Double.class,id,java.sql.Date.valueOf(from),java.sql.Date.valueOf(to));
   double undated=db.queryForObject("SELECT COALESCE(SUM(e.earned_hours),0) FROM overtime_entry e WHERE e.member_id=? AND NOT EXISTS(SELECT 1 FROM overtime_request r WHERE r.entry_id=e.id AND r.status='APPROVED')",Double.class,id)+db.queryForObject("SELECT COALESCE(SUM(earned_hours),0) FROM overtime_snapshot WHERE member_id=?",Double.class,id);
   double totalEarned=num(balance.get("earnedHours"))+db.queryForObject("SELECT COALESCE(SUM(earned_hours),0) FROM overtime_snapshot WHERE member_id=?",Double.class,id);
   double days=0,weekDays=0,unallocatedDays=0;
   for(var leave:db.queryForList("SELECT days,start_on,end_on FROM leave_record WHERE member_id=? AND leave_type='OVERTIME'",id)){
    double d=num(leave.get("DAYS"));days+=d;
    if(leave.get("START_ON")==null||leave.get("END_ON")==null){unallocatedDays+=d;continue;}
    LocalDate a=LocalDate.parse(leave.get("START_ON").toString()),b=LocalDate.parse(leave.get("END_ON").toString());
    if(!a.isBefore(from)&&!b.isAfter(to))weekDays+=d;
    else if(!b.isBefore(from)&&!a.isAfter(to))unallocatedDays+=d;
   }
   double pending=db.queryForObject("SELECT COALESCE(SUM(hours),0) FROM overtime_request WHERE member_id=? AND status='PENDING' AND work_date BETWEEN ? AND ?",Double.class,id,java.sql.Date.valueOf(from),java.sql.Date.valueOf(to));
   var row=new LinkedHashMap<String,Object>();row.put("name",member.get("NAME"));row.put("weeklyHours",weekly);row.put("weeklyDays",weekDays);row.put("totalEarned",totalEarned);row.put("totalDays",days);row.put("balanceHours",balance.get("balanceHours"));row.put("pendingHours",pending);row.put("undatedHours",undated);row.put("unallocatedDays",unallocatedDays);row.put("warnings",balance.get("warnings"));people.add(row);
  }
  String range=from+" – "+to;
  var html=new StringBuilder("<!doctype html><html lang='tr'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Haftalık mesai raporu</title><style>body{font:15px system-ui;color:#16344b;background:#edf3f8;margin:0;padding:32px}main{max-width:1200px;margin:auto;background:white;padding:32px;border-radius:18px}h1{margin:0 0 10px}p{line-height:1.6;color:#52677a}table{width:100%;border-collapse:collapse}th,td{padding:14px;text-align:right;border-bottom:1px solid #dce5ee;font-variant-numeric:tabular-nums}th:first-child,td:first-child{text-align:left}thead{background:#eaf2fb}small{color:#536c83}.scroll{overflow:auto}h2{margin-top:32px}</style><main><h1>Haftalık mesai ve hakediş</h1><p>"+range+" · Türkiye<br>Oluşturuldu: "+escape(generated.atZone(SlackDigestService.ZONE))+"</p><div class='scroll'><table><thead><tr><th>Kişi</th><th>Haftalık mesai (sa)</th><th>Haftalık kullanım (gün)</th><th>Toplam mesai (sa)</th><th>Toplam kullanım (gün)</th><th>Güncel bakiye (sa)</th><th>Haftalık bekleyen (sa)</th></tr></thead><tbody>");
  for(var p:people){html.append("<tr><th>"+escape(p.get("name"))+"</th>");for(String k:List.of("weeklyHours","weeklyDays","totalEarned","totalDays","balanceHours","pendingHours"))html.append("<td>"+format(num(p.get(k)))+"</td>");html.append("</tr>");}
  html.append("</tbody></table></div><p>Haftalık değerler önceki tamamlanmış Pazartesi–Pazar dönemidir. Toplamlar ve bakiye raporun oluşturulduğu andaki aktif üyelerin kayıtlarını gösterir; hafta sonu bakiyesi değildir. Bekleyen talepler ve planlı mesai hakedişe eklenmez. Yıllık/şirket izinleri mesai kullanımı değildir. Bakiyede geçmiş açılış ve kullanım düzeltmeleri korunur; izinler iki kez düşülmez.</p><h2>Tarih ve kayıt kontrolü</h2><p>Günü bilinmeyen eski/doğrudan girilmiş mesailer haftaya dağıtılmaz; toplamda yer alır. Tarihsiz veya birden fazla haftaya yayılan izinler bu haftaya tahminle yazılmaz. Slack’te henüz kişiyle eşleştirilmemiş bildirimler bekleyen saatlere dahil değildir.</p><ul>");
  for(var p:people){if(num(p.get("undatedHours"))>0||num(p.get("unallocatedDays"))>0)html.append("<li>"+escape(p.get("name"))+": haftaya atanamayan "+format(num(p.get("undatedHours")))+" saat geçmiş mesai; "+format(num(p.get("unallocatedDays")))+" gün tarih aralığı belirsiz/haftaları aşan kullanım.</li>");for(var warning:(List<?>)p.get("warnings"))html.append("<li>"+escape(p.get("name"))+": "+escape(warning)+"</li>");}
  html.append("</ul></main></html>");
  var blocks=new ArrayList<Map<String,Object>>();blocks.add(Map.of("type","header","text",Map.of("type","plain_text","text","Haftalık mesai ve hakediş")));blocks.add(section(range+" · Türkiye\nHaftalık gerçekleşen: "+format(people.stream().mapToDouble(p->num(p.get("weeklyHours"))).sum())+" sa · Mesaiden izin: "+format(people.stream().mapToDouble(p->num(p.get("weeklyDays"))).sum())+" gün"));
  for(var p:people.stream().limit(35).toList())blocks.add(section(p.get("name")+"\nHafta: "+format(num(p.get("weeklyHours")))+" sa mesai · "+format(num(p.get("weeklyDays")))+" gün kullanım\nToplam: "+format(num(p.get("totalEarned")))+" sa mesai · "+format(num(p.get("totalDays")))+" gün kullanım · Güncel bakiye: "+format(num(p.get("balanceHours")))+" sa"));
  blocks.add(section("Tam kişi tablosu, bekleyen talepler ve tarih kontrolü ekteki HTML raporunda. Planlanan mesai hakedişe dahil değildir. Toplamlar günceldir; haftalık değerler yalnız tarihi bilinen kayıtlardır."));
  return new Report(from.toString(),to.toString(),html.toString(),blocks,people);
 }
 private static Map<String,Object> section(String text){return Map.of("type","section","text",Map.of("type","plain_text","text",text));}
}
