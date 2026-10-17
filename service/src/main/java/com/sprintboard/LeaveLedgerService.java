package com.sprintboard;

import com.fasterxml.jackson.databind.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;

/** Leave is the single source of compensatory usage; historical balances are opening balances, not transactions. */
public class LeaveLedgerService {
  private final JdbcTemplate j; private final ObjectMapper m;
  public LeaveLedgerService(JdbcTemplate j,ObjectMapper m){this.j=j;this.m=m;}
  private static String text(Map<String,Object> r,String k){return Objects.toString(r.get(k),"").trim();}
  private static double n(Map<String,Object> r,String k){return r.get(k) instanceof Number v?v.doubleValue():Double.NaN;}
  private static double round(double n){return Math.round(n*100d)/100d;}
  public List<Map<String,Object>> balances(){
    return j.queryForList("SELECT id,name FROM member ORDER BY name").stream().map(member->balance(member.get("ID").toString(),member.get("NAME").toString())).toList();
  }
  private Map<String,Object> balance(String member,String name){
    var snapshots=j.queryForList("SELECT o.*,s.number sprint_number,s.name sprint_name FROM overtime_snapshot o JOIN sprint s ON s.id=o.sprint_id WHERE member_id=? ORDER BY s.number,o.id",member);
    var warnings=new ArrayList<String>(); Map<String,Object> previous=null;
    for(var row:snapshots){
      if(n(row,"BALANCE_HOURS")<0)warnings.add(row.get("SPRINT_NAME")+": negatif geçmiş bakiye");
      if(previous!=null){
        double used=n(row,"USED_CUMULATIVE_HOURS")-n(previous,"USED_CUMULATIVE_HOURS");
        if(used<0)warnings.add(row.get("SPRINT_NAME")+": kümülatif kullanım azalmış");
        if(Math.abs(n(previous,"BALANCE_HOURS")+n(row,"EARNED_HOURS")-used-n(row,"BALANCE_HOURS"))>.01)warnings.add(row.get("SPRINT_NAME")+": önceki bakiye + hakediş − kullanım değişimi uyuşmuyor (eksik ara kayıt olabilir)");
        if(Objects.equals(row.get("SPRINT_NUMBER"),previous.get("SPRINT_NUMBER")))warnings.add(row.get("SPRINT_NAME")+": aynı kişi/sprint için birden fazla geçmiş bakiye");
      }
      previous=row;
    }
    double opening=previous==null?0:n(previous,"BALANCE_HOURS");
    double earned=j.queryForObject("SELECT COALESCE(SUM(earned_hours),0) FROM overtime_entry WHERE member_id=?",Double.class,member);
    double manual=j.queryForObject("SELECT COALESCE(SUM(used_hours),0) FROM overtime_entry WHERE member_id=?",Double.class,member);
    double leave=j.queryForObject("SELECT COALESCE(SUM(overtime_hours),0) FROM leave_record WHERE member_id=? AND overtime_accounting='DEBIT'",Double.class,member);
    int unknown=j.queryForObject("SELECT COUNT(*) FROM leave_record WHERE member_id=? AND leave_type='UNSPECIFIED'",Integer.class,member);
    if(unknown>0)warnings.add(unknown+" izin kaydının türü belirsiz; mesai bakiyesinden ayrıca düşülmedi");
    double balance=round(opening+earned-manual-leave);if(balance<0)warnings.add("Güncel mesai bakiyesi negatif");
    var result=new LinkedHashMap<String,Object>();result.put("memberId",member);result.put("memberName",name);result.put("openingHours",opening);result.put("openingSprint",previous==null?null:previous.get("SPRINT_NAME"));result.put("openingSprintNumber",previous==null?null:previous.get("SPRINT_NUMBER"));
    result.put("earnedHours",earned);result.put("manualUsedHours",manual);result.put("leaveUsedHours",leave);result.put("balanceHours",balance);result.put("unknownLeaves",unknown);result.put("warnings",warnings);return result;
  }
  public void validateNew(Map<String,Object> input){save(null,input,false);}
  public Map<String,Object> save(String id,Map<String,Object> input){return save(id,input,true);}
  private Map<String,Object> save(String id,Map<String,Object> input,boolean persist){
    String member=text(input,"memberId"),sprint=text(input,"sprintId"),kind=text(input,"leaveType");
    var s=j.queryForList("SELECT * FROM sprint WHERE id=? FOR UPDATE",sprint);if(s.isEmpty())throw new IllegalArgumentException("Sprint bulunamadı.");
    if(j.queryForList("SELECT id FROM member WHERE id=? FOR UPDATE",member).isEmpty())throw new IllegalArgumentException("Üye bulunamadı.");
    var oldRows=id==null?List.<Map<String,Object>>of():j.queryForList("SELECT * FROM leave_record WHERE id=?",id);
    if(id!=null&&oldRows.isEmpty())return null;
    var old=oldRows.isEmpty()?null:oldRows.getFirst();
    if(old!=null&&(!member.equals(old.get("MEMBER_ID"))||!sprint.equals(old.get("SPRINT_ID"))))throw new IllegalArgumentException("Mevcut iznin kişisi ve sprinti değiştirilemez.");
    if(!Set.of("ANNUAL","OVERTIME","COMPANY_GRANTED").contains(kind))throw new IllegalArgumentException("Yıllık izin, mesai hakedişi veya şirket izni seçin.");
    double days=n(input,"days");if(!Double.isFinite(days)||days<=0||days>100||days*2!=Math.rint(days*2))throw new IllegalArgumentException("İzin 0,5–100 gün arasında yarım gün adımlı olmalı.");
    String start=text(input,"start"),end=text(input,"end");
    LocalDate a=null,b=null;try{if(!start.isEmpty()||!end.isEmpty()){a=LocalDate.parse(start);b=LocalDate.parse(end);if(b.isBefore(a))throw new IllegalArgumentException();}}catch(Exception e){throw new IllegalArgumentException("İzin başlangıç/bitiş tarihleri birlikte ve doğru sırada olmalı.");}
    boolean samePeriod=old!=null&&days==n(old,"DAYS")&&start.equals(Objects.toString(old.get("START_ON"),""))&&end.equals(Objects.toString(old.get("END_ON"),""));
    boolean frozen=j.queryForObject("SELECT COUNT(*) FROM sprint_closure WHERE sprint_id=?",Integer.class,sprint)>0;
    if(frozen&&!samePeriod)throw new IllegalArgumentException("Kapanış özeti sabitlenmiş sprintte yalnız izin türü düzeltilebilir; gün ve tarihler değiştirilemez.");
    var schedule=new WorkScheduleService(j,m).forSprint(sprint);
    if(!samePeriod){
      LocalDate sprintStart=LocalDate.parse(s.getFirst().get("START_DATE").toString()),sprintEnd=LocalDate.parse(s.getFirst().get("END_DATE").toString());
      if(a!=null&&(a.isBefore(sprintStart)||b.isAfter(sprintEnd)))throw new IllegalArgumentException("İzin tarihleri seçilen sprint içinde olmalı; dönemleri ayrı kaydedin.");
      LocalDate from=a==null?sprintStart:a,to=b==null?sprintEnd:b;
      var memberRow=j.queryForMap("SELECT joined_on,left_on FROM member WHERE id=?",member);
      var legacy=new HashMap<String,Object>();legacy.put("joinedOn",Objects.toString(memberRow.get("JOINED_ON"),null));legacy.put("leftOn",Objects.toString(memberRow.get("LEFT_ON"),null));
      var present=new ParticipationService(j,m).days(sprint,member,sprintStart,sprintEnd,legacy);
      var off=new HashSet<>(j.queryForList("SELECT day_date FROM non_working_day WHERE member_id IS NULL OR member_id=?",java.sql.Date.class,member));
      long eligible=from.datesUntil(to.plusDays(1)).filter(present::contains).filter(schedule::works).filter(d->!off.contains(java.sql.Date.valueOf(d))).count();
      if(days>eligible)throw new IllegalArgumentException("İzin günü, tarih aralığındaki çalışılabilir günleri aşıyor (tatiller hariç).");
      long totalEligible=present.stream().filter(schedule::works).filter(d->!off.contains(java.sql.Date.valueOf(d))).count();
      double otherDays=j.queryForObject("SELECT COALESCE(SUM(days),0) FROM leave_record WHERE member_id=? AND sprint_id=? AND id<>?",Double.class,member,sprint,id==null?"":id);
      if(days+otherDays>totalEligible)throw new IllegalArgumentException("Bu sprintte toplam izin, kişinin çalışılabilir günlerini aşıyor; mevcut kayıtları kontrol edin.");
      if(a!=null&&j.queryForObject("SELECT COUNT(*) FROM leave_record WHERE member_id=? AND id<>? AND start_on<=? AND end_on>=?",Integer.class,member,id==null?"":id,java.sql.Date.valueOf(b),java.sql.Date.valueOf(a))>0)throw new IllegalArgumentException("Bu tarihlerle çakışan izin var; mevcut kaydı düzenleyin.");
    }
    String accounting="NONE";double hours=0;
    if(kind.equals("OVERTIME")){
      accounting=text(input,"overtimeAccounting");if(!Set.of("DEBIT","IN_SNAPSHOT").contains(accounting))throw new IllegalArgumentException("Mesai izninin bakiyeden düşüleceğini veya geçmiş bakiyede zaten bulunduğunu belirtin.");
      if(accounting.equals("IN_SNAPSHOT")&&j.queryForObject("SELECT COUNT(*) FROM overtime_snapshot o JOIN sprint s ON s.id=o.sprint_id WHERE o.member_id=? AND s.number>=?",Integer.class,member,s.getFirst().get("NUMBER"))==0)throw new IllegalArgumentException("Bu izin dönemini kapsayan geçmiş mesai bakiyesi yok; yeni kullanım seçin.");
      hours=old!=null&&samePeriod&&"OVERTIME".equals(old.get("LEAVE_TYPE"))?n(old,"OVERTIME_HOURS"):round(days*new MemberCapacityService(j).forSprint(sprint,member,schedule.hoursPerDay()).hoursPerDay());
      if(accounting.equals("IN_SNAPSHOT")){
        double recorded=j.queryForObject("SELECT o.used_cumulative_hours FROM overtime_snapshot o JOIN sprint s ON s.id=o.sprint_id WHERE o.member_id=? ORDER BY s.number DESC,o.id DESC LIMIT 1",Double.class,member);
        double linked=j.queryForObject("SELECT COALESCE(SUM(overtime_hours),0) FROM leave_record WHERE member_id=? AND overtime_accounting='IN_SNAPSHOT' AND id<>?",Double.class,member,id==null?"":id);
        if(linked+hours>recorded+.001)throw new IllegalArgumentException("Geçmiş bakiyeye bağlı izin saatleri, kayıtlı kümülatif kullanımı aşıyor. Kaynak mesai tablosunu kontrol edin.");
      }
      double previousDebit=old!=null&&"DEBIT".equals(old.get("OVERTIME_ACCOUNTING"))?n(old,"OVERTIME_HOURS"):0;
      if(accounting.equals("DEBIT")&&hours-previousDebit>Math.max(0,n(balance(member,""),"balanceHours"))+.001)throw new IllegalArgumentException("Yeterli mesai hakedişi yok. Önce hak edilen mesaiyi kaydedin.");
    }
    if(!persist)return Map.of("days",days,"overtimeHours",hours);
    String saved=id==null?"leave-"+UUID.randomUUID():id;
    if(id==null)j.update("INSERT INTO leave_record(id,member_id,sprint_id,days,precision_label,status,start_on,end_on,leave_type,overtime_hours,overtime_accounting) VALUES (?,?,?,?,?,'recorded',?,?,?,?,?)",saved,member,sprint,days,a==null?"sprint-level":"exact",a==null?null:java.sql.Date.valueOf(a),b==null?null:java.sql.Date.valueOf(b),kind,hours,accounting);
    else j.update("UPDATE leave_record SET days=?,precision_label=?,start_on=?,end_on=?,leave_type=?,overtime_hours=?,overtime_accounting=? WHERE id=?",days,a==null?"sprint-level":"exact",a==null?null:java.sql.Date.valueOf(a),b==null?null:java.sql.Date.valueOf(b),kind,hours,accounting,saved);
    j.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'leave',?,?,?)",saved,id==null?"created":"updated",m.valueToTree(Map.of("actor",TaskActivity.actor(),"input",input,"overtimeHours",hours,"overtimeAccounting",accounting)).toString());
    return Map.of("id",saved,"days",days,"overtimeHours",hours,"overtimeAccounting",accounting);
  }
  public static void validateBackup(JsonNode tables){
    var sprintNumbers=new HashMap<String,Integer>();tables.path("sprint").forEach(s->sprintNumbers.put(s.path("id").asText(),s.path("number").asInt()));
    var latest=new HashMap<String,JsonNode>();
    for(var snapshot:tables.path("overtime_snapshot")){String id=snapshot.path("member_id").asText();var previous=latest.get(id);if(previous==null||sprintNumbers.getOrDefault(snapshot.path("sprint_id").asText(),-1)>=sprintNumbers.getOrDefault(previous.path("sprint_id").asText(),-1))latest.put(id,snapshot);}
    var linked=new HashMap<String,Double>();
    for(var r:tables.path("leave_record")){
      String kind=r.path("leave_type").asText(),mode=r.path("overtime_accounting").asText();double h=r.path("overtime_hours").asDouble(Double.NaN);
      if(!Set.of("UNSPECIFIED","COMPANY_GRANTED","ANNUAL","OVERTIME").contains(kind)||!Double.isFinite(h)||h<0||!r.path("overtime_hours").isNumber()||
        (kind.equals("OVERTIME")?h<=0||h>r.path("days").asDouble()*24||!Set.of("DEBIT","IN_SNAPSHOT").contains(mode):h!=0||!mode.equals("NONE")))throw new IllegalArgumentException("İzin hakediş bilgisi geçersiz.");
      if(mode.equals("IN_SNAPSHOT")){
        String member=r.path("member_id").asText();var snapshot=latest.get(member);
        if(snapshot==null||sprintNumbers.getOrDefault(snapshot.path("sprint_id").asText(),-1)<sprintNumbers.getOrDefault(r.path("sprint_id").asText(),Integer.MAX_VALUE))throw new IllegalArgumentException("Geçmiş kullanıma bağlı iznin mesai bakiyesi bulunamadı.");
        double total=linked.merge(member,h,Double::sum);if(total>snapshot.path("used_cumulative_hours").asDouble()+.001)throw new IllegalArgumentException("İzinler geçmiş mesai kullanımını aşıyor.");
      }
    }
  }
}
