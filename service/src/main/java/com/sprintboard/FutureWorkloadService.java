package com.sprintboard;

import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Read-only forecast: never creates sprints, assignments or leave records. */
@Service
public class FutureWorkloadService {
  private final WorkspaceService workspace;
  private final JdbcTemplate db;
  private final WorkScheduleService schedules;
  private final MemberCapacityService memberCapacity;
  private final ParticipationService participation;
  private final Clock clock;
  public FutureWorkloadService(WorkspaceService workspace,JdbcTemplate db,WorkScheduleService schedules,MemberCapacityService memberCapacity,ParticipationService participation,Clock clock){
    this.workspace=workspace;this.db=db;this.schedules=schedules;this.memberCapacity=memberCapacity;this.participation=participation;this.clock=clock;
  }
  public record RoleHours(String role,double hours){}
  public record Period(String id,String sprintId,String label,String start,String end,boolean scenario,double nominalHours,double offHours,double leaveHours,double overtimeHours,double bauHours,double bauOverHours,double capacityHours,List<RoleHours> roles,String bauSource){}
  public record Work(String id,String title,String category,String roadmapId,String roadmapTitle,String source,String sprintId,String sprintName,double estimatedHours,double coreHours,double supportHours,double reserveHours,boolean unestimated,String basis,List<RoleHours> roles){}
  public record Report(String generatedAt,String today,String from,int weeks,double bauDays,List<Period> periods,List<Work> items,List<String> warnings){}
  private record Window(String id,String sprintId,String label,LocalDate start,LocalDate end,LocalDate originalStart,LocalDate originalEnd){}
  private static String str(Map<String,Object> m,String k){return Objects.toString(m.get(k),"");}
  private static double num(Map<String,Object> m,String k){return m.get(k) instanceof Number n?n.doubleValue():0;}
  private static double round(double v){return Math.round(v*100d)/100d;}
  private static boolean external(Map<String,Object> m){return "SUPPORT".equalsIgnoreCase(str(m,"engagement"))||"ARCHITECT".equalsIgnoreCase(str(m,"teamRole"));}
  static String role(String value){return switch(value.toUpperCase(Locale.ROOT)){case "DEVELOPER","DEV","DEFECT"->"DEV";case "DESIGNER","DESIGN"->"DESIGN";case "TESTER","TEST_ENGINEER","TEST"->"TEST";case "ANALYST","ANALYZE"->"ANALYZE";default->"OTHER";};}
  private static List<RoleHours> roleRows(Map<String,Double> values){return values.entrySet().stream().map(e->new RoleHours(e.getKey(),round(e.getValue()))).toList();}
  @SuppressWarnings("unchecked") private static List<Map<String,Object>> tasks(Map<String,Object> sprint){return (List<Map<String,Object>>)sprint.getOrDefault("items",List.of());}

  @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
  public Report report(String requestedStart,int count,int weeks,Double requestedBauDays){
    if(count<1||count>12||weeks<1||weeks>6)throw new IllegalArgumentException("Dönem sayısı 1–12, senaryo sprint süresi 1–6 hafta olmalı.");
    LocalDate today=LocalDate.now(clock.withZone(ZoneId.of("Europe/Istanbul")));
    var summaries=workspace.sprints();
    LocalDate from;
    if(requestedStart==null||requestedStart.isBlank()){
      from=summaries.stream().filter(s->"active".equals(s.get("status"))).map(s->LocalDate.parse(str(s,"end")).plusDays(1)).max(LocalDate::compareTo).orElse(today);
      if(from.isBefore(today))from=today;
      while(!schedules.at(from).works(from))from=from.plusDays(1);
    }else{try{from=LocalDate.parse(requestedStart);}catch(Exception e){throw new IllegalArgumentException("Başlangıç tarihi geçersiz.");}}
    if(from.isBefore(today)||from.isAfter(today.plusYears(1)))throw new IllegalArgumentException("Başlangıç bugün ile bir yıl sonrası arasında olmalı.");
    double bauDays=requestedBauDays==null?workspace.bauTemplates().stream().filter(t->Boolean.TRUE.equals(t.get("active"))&&"CORE".equals(t.get("mode"))&&!"LEAVE".equals(t.get("workKind"))).mapToDouble(t->num(t,"daysPerMember")).sum():requestedBauDays;
    if(!Double.isFinite(bauDays)||bauDays<0||bauDays>42)throw new IllegalArgumentException("Senaryo BAU günü 0–42 arasında olmalı.");
    var warnings=new LinkedHashSet<String>();
    var planned=new LinkedHashMap<String,Map<String,Object>>();
    summaries.stream().filter(s->"planned".equals(s.get("status"))).sorted(Comparator.comparing(s->str(s,"start"))).forEach(s->planned.put(str(s,"id"),workspace.sprint(str(s,"id"))));
    var windows=windows(from,count,weeks,planned,warnings);
    var members=workspace.team();var byMember=new HashMap<String,Map<String,Object>>();members.forEach(m->byMember.put(str(m,"id"),m));
    var calendar=workspace.calendar();var leaves=workspace.leaves();
    var presences=new HashMap<String,List<ParticipationService.Period>>();members.forEach(m->presences.put(str(m,"id"),participation.periods(str(m,"id"))));
    var periods=new ArrayList<Period>();
    for(var window:windows)periods.add(capacity(window,planned.get(window.sprintId()),members,calendar,leaves,presences,bauDays,weeks,warnings));
    var backlog=workspace.backlog();var byBacklog=new HashMap<String,Map<String,Object>>();backlog.forEach(b->byBacklog.put(str(b,"id"),b));
    var items=new ArrayList<Work>();
    for(var b:backlog)if("Ready".equals(b.get("state"))&&str(b,"sprintId").isEmpty()&&!BauPolicy.isBau(b)){
      double hours=num(b,"estimatedHours");items.add(new Work(str(b,"id"),str(b,"title"),str(b,"taskCategory"),str(b,"roadmapId"),str(b,"roadmapTitle"),"POOL","","",hours,hours,0,0,hours<=0,"BACKLOG_ESTIMATE",List.of(new RoleHours(role(str(b,"taskCategory")),hours))));
    }
    for(var sprint:planned.values()){
      // A reserve is consumed in the same deterministic order as the sprint plan, per member.
      var balances=new HashMap<String,Map<String,Double>>();
      for(var task:tasks(sprint))if(DefectReserve.isReserve(task)){
        var balance=new HashMap<String,Double>();for(var a:DefectReserve.assignments(task))balance.merge(str(a,"memberId"),DefectReserve.hours(a),Double::sum);balances.put(str(task,"id"),balance);
      }
      var ordered=tasks(sprint).stream().sorted(Comparator.<Map<String,Object>>comparingDouble(t->num(t,"scopeOrder")).thenComparing(t->str(t,"id"))).toList();
      for(var task:ordered){
        if(BauPolicy.isBau(task))continue;
        var assignments=DefectReserve.assignments(task);var hoursByRole=new LinkedHashMap<String,Double>();
        double assigned=assignments.stream().mapToDouble(DefectReserve::hours).sum(),core=0,support=0,reserved=0;
        var balance=balances.getOrDefault(str(task,"reserveTaskId"),new HashMap<>());
        for(var a:assignments){
          double hours=DefectReserve.hours(a),covered=Math.min(hours,balance.getOrDefault(str(a,"memberId"),0d));
          balance.computeIfPresent(str(a,"memberId"),(k,v)->v-covered);reserved+=covered;
          var member=byMember.getOrDefault(str(a,"memberId"),Map.of());
          if(external(member)){support+=hours-covered;}else{core+=hours-covered;hoursByRole.merge(role(str(member,"teamRole")),hours-covered,Double::sum);}
        }
        double estimate=assignments.isEmpty()?num(task,"estimatedHours"):assigned;
        if(assignments.isEmpty()){core=estimate;hoursByRole.merge(role(str(task,"taskCategory")),estimate,Double::sum);}
        if(List.of("done","undone").contains(str(task,"status")))continue;
        var b=byBacklog.getOrDefault(str(task,"backlogId"),Map.of());
        boolean unknown=estimate<=0||assignments.stream().anyMatch(a->!Boolean.TRUE.equals(a.get("supportOnly"))&&DefectReserve.hours(a)<=0);
        items.add(new Work(str(task,"backlogId"),str(task,"name"),str(task,"taskCategory"),str(b,"roadmapId"),str(b,"roadmapTitle"),"PLANNED",str(sprint,"id"),str(sprint,"name"),round(estimate),round(core),round(support),round(reserved),unknown,assigned>0?"ASSIGNMENTS":"TASK_ESTIMATE",roleRows(hoursByRole)));
      }
    }
    var periodIds=new HashSet<String>();periods.forEach(p->periodIds.add(p.sprintId()));
    if(items.stream().anyMatch(i->i.source().equals("PLANNED")&&!periodIds.contains(i.sprintId())))warnings.add("Bazı planlanan işler seçili dönemlerin dışında. Toplam yüke dahildir; senaryoda başka bir sprinte taşınmaz.");
    if(items.stream().anyMatch(Work::unestimated))warnings.add("Tahmini eksik işler var. Yük ve doluluk bilinen saatlerin alt sınırıdır.");
    return new Report(clock.instant().toString(),today.toString(),from.toString(),weeks,bauDays,periods,items,new ArrayList<>(warnings));
  }

  private List<Window> windows(LocalDate start,int count,int weeks,Map<String,Map<String,Object>> planned,Set<String> warnings){
    var result=new ArrayList<Window>();LocalDate cursor=start;int scenario=0;
    var actual=planned.values().stream().filter(s->!LocalDate.parse(str(s,"end")).isBefore(start)).toList();int index=0;
    while(result.size()<count){
      while(index<actual.size()&&LocalDate.parse(str(actual.get(index),"end")).isBefore(cursor)){warnings.add("Çakışan sprint tarihleri var; aynı günün kapasitesi iki kez sayılmadı.");index++;}
      var next=index<actual.size()?actual.get(index):null;
      if(next!=null&&!LocalDate.parse(str(next,"start")).isAfter(cursor)){
        LocalDate original=LocalDate.parse(str(next,"start")),end=LocalDate.parse(str(next,"end"));
        if(end.isAfter(start.plusYears(2)))throw new IllegalArgumentException("Planlanan sprint tarihlerini kontrol edin: dönem iki yılı aşıyor.");
        if(original.isBefore(cursor))warnings.add("Başlangıcı geçmiş veya çakışan sprintlerde yalnız kalan benzersiz günler kapasiteye dahil. Açık işler, kayıtlı BAU ve planlı mesai bütçeleri tam alınır; günlere dağılım bilinmiyor.");
        result.add(new Window(str(next,"id"),str(next,"id"),str(next,"name"),cursor,end,original,end));cursor=end.plusDays(1);index++;
      }else{
        LocalDate end=cursor.plusWeeks(weeks).minusDays(1);
        if(next!=null){LocalDate boundary=LocalDate.parse(str(next,"start")).minusDays(1);if(end.isAfter(boundary))end=boundary;}
        if(cursor.datesUntil(end.plusDays(1)).noneMatch(d->schedules.at(d).works(d))){cursor=end.plusDays(1);continue;}
        result.add(new Window("forecast-"+(++scenario),"","Senaryo "+scenario,cursor,end,cursor,end));cursor=end.plusDays(1);
      }
    }return result;
  }

  private Period capacity(Window window,Map<String,Object> sprint,List<Map<String,Object>> members,List<Map<String,Object>> calendar,List<Map<String,Object>> leaves,Map<String,List<ParticipationService.Period>> presences,double bauDays,int weeks,Set<String> warnings){
    var budget=new HashMap<String,Double>();double unassignedBau=0;boolean recordedBau=false;
    if(sprint!=null)for(var task:tasks(sprint))if(BauPolicy.isBau(task)&&!"LEAVE".equals(str(task,"workKind"))&&!"LEAVE".equals(str(task,"taskSubtype"))){
      recordedBau=true;double assigned=0;
      for(var a:DefectReserve.assignments(task)){double h=DefectReserve.hours(a);assigned+=h;budget.merge(str(a,"memberId"),h,Double::sum);}
      if(DefectReserve.assignments(task).isEmpty())unassignedBau+=num(task,"estimatedHours");
    }
    var coreMembers=members.stream().filter(m->!external(m)).toList();
    var roles=new LinkedHashMap<String,Double>();double nominal=0,off=0,leave=0,overtime=0,bau=0,bauOver=0,capacity=0;
    var preliminary=new ArrayList<double[]>();var eligibleMembers=new ArrayList<Map<String,Object>>();
    for(var member:coreMembers){
      String id=str(member,"id");var presence=presences.getOrDefault(id,List.of());
      var work=sprint==null?null:schedules.forSprint(window.sprintId());
      var dailyHours=new HashMap<LocalDate,Double>();
      var rawDailyHours=new HashMap<LocalDate,Double>();
      var capturedPolicy=work==null?null:memberCapacity.forSprint(window.sprintId(),id,work.hoursPerDay());
      java.util.function.Function<LocalDate,Double> hours=d->dailyHours.computeIfAbsent(d,date->{var wp=work==null?schedules.at(date):work;if(!wp.works(date)||presence.stream().noneMatch(p->ParticipationService.includes(p,date)))return 0d;var policy=capturedPolicy==null?memberCapacity.at(id,date,wp.hoursPerDay()):capturedPolicy;rawDailyHours.put(date,policy.hoursPerDay());return policy.planningHours();});
      java.util.function.Predicate<LocalDate> dayOff=d->calendar.stream().anyMatch(c->d.toString().equals(c.get("date"))&&(str(c,"memberId").isEmpty()||id.equals(c.get("memberId"))));
      var leaveFractions=new HashMap<LocalDate,Double>();double undated=0;
      for(var record:leaves)if(id.equals(record.get("memberId"))){
        String a=str(record,"start"),b=str(record,"end");
        if(a.isEmpty()||b.isEmpty()){if(window.sprintId().equals(record.get("sprintId"))){undated+=num(record,"days");warnings.add("Tarihsiz sprint izinleri bağlı sprintin kalan kapasitesinden düşülür; gün bazındaki dağılım kesin değildir.");}continue;}
        LocalDate begin=LocalDate.parse(a),end=LocalDate.parse(b);if(end.isBefore(window.start())||begin.isAfter(window.end()))continue;
        var eligible=begin.datesUntil(end.plusDays(1)).filter(d->hours.apply(d)>0&&!dayOff.test(d)).toList();
        double fraction=Math.min(1,num(record,"days")/Math.max(1,eligible.size()));
        for(var d:eligible)leaveFractions.merge(d,fraction,Math::max);
      }
      double gross=0,offH=0,leaveH=0,workDays=0,totalDaily=0,totalRawDaily=0;
      for(LocalDate d=window.start();!d.isAfter(window.end());d=d.plusDays(1)){
        double h=hours.apply(d);gross+=h;double raw=rawDailyHours.getOrDefault(d,0d);if(raw>0){workDays++;totalDaily+=h;totalRawDaily+=raw;}
        if(dayOff.test(d)){offH+=h;continue;}leaveH+=h*leaveFractions.getOrDefault(d,0d);
      }
      if(workDays==0)continue;
      double average=totalDaily/workDays;leaveH=Math.min(Math.max(0,gross-offH),leaveH+undated*average);
      double ot=sprint==null?0:db.queryForObject("SELECT COALESCE(SUM(planned_hours),0) FROM overtime_entry WHERE sprint_id=? AND member_id=? AND include_in_capacity=true",Double.class,window.sprintId(),id);
      double net=Math.max(0,gross-offH-leaveH)+ot;
      preliminary.add(new double[]{gross,offH,leaveH,ot,net,average,workDays,totalRawDaily/workDays});eligibleMembers.add(member);
    }
    double totalNet=preliminary.stream().mapToDouble(a->a[4]).sum();
    for(int i=0;i<preliminary.size();i++){
      var a=preliminary.get(i);var member=eligibleMembers.get(i);
      // Actual BAU allocations take precedence. Virtual periods use configurable days per person.
      double scenarioFraction=sprint==null?Math.min(1,(java.time.temporal.ChronoUnit.DAYS.between(window.start(),window.end())+1d)/(weeks*7)):1;
      // BAU days use actual daily hours, just like sprint BAU creation; focus must not shrink that budget.
      double requested=recordedBau?budget.getOrDefault(str(member,"id"),0d)+(totalNet>0?unassignedBau*a[4]/totalNet:0):bauDays*a[7]*scenarioFraction;
      double deduction=Math.min(a[4],requested),available=Math.max(0,a[4]-requested);
      nominal+=a[0];off+=a[1];leave+=a[2];overtime+=a[3];bau+=deduction;bauOver+=Math.max(0,requested-a[4]);capacity+=available;
      roles.merge(role(str(member,"teamRole")),available,Double::sum);
    }
    if(bauOver>0)warnings.add("Bazı dönemlerde BAU bütçesi net kişi kapasitesini aşıyor; teslimat kapasitesi sıfırın altına indirilmedi.");
    return new Period(window.id(),window.sprintId(),window.label(),window.start().toString(),window.end().toString(),sprint==null,round(nominal),round(off),round(leave),round(overtime),round(bau),round(bauOver),round(capacity),roleRows(roles),recordedBau?"PLANNED":"TEMPLATE");
  }
}
