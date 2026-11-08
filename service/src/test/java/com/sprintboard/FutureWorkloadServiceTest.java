package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

class FutureWorkloadServiceTest {
  final WorkspaceService workspace=mock(WorkspaceService.class);
  final JdbcTemplate db=mock(JdbcTemplate.class);
  final WorkScheduleService schedules=mock(WorkScheduleService.class);
  final MemberCapacityService policies=mock(MemberCapacityService.class);
  final ParticipationService presence=mock(ParticipationService.class);
  final FutureWorkloadService service=new FutureWorkloadService(workspace,db,schedules,policies,presence,Clock.fixed(Instant.parse("2030-01-07T07:00:00Z"),ZoneOffset.UTC));
  static Map<String,Object> row(Object... pairs){var out=new LinkedHashMap<String,Object>();for(int i=0;i<pairs.length;i+=2)out.put((String)pairs[i],pairs[i+1]);return out;}
  static Map<String,Object> member(String id,String role,String engagement){return row("id",id,"name",id,"teamRole",role,"engagement",engagement);}
  static Map<String,Object> assignment(String member,double hours){return row("memberId",member,"estimatedHours",hours,"supportOnly",false);}
  static Map<String,Object> task(String id,String category,double hours,List<Map<String,Object>> assignments){return row("id",id,"backlogId",id,"name",id,"taskCategory",category,"status","todo","estimatedHours",hours,"assignments",assignments);}
  static Map<String,Object> pool(String id,String category,double hours){return row("id",id,"title",id,"taskCategory",category,"state","Ready","estimatedHours",hours);}
  static Map<String,Object> leave(String start,String end,double days){return row("memberId","dev","sprintId","s1","start",start,"end",end,"days",days);}
  Map<String,Object> sprint(String id,String start,String end,List<Map<String,Object>> tasks){return row("id",id,"name",id,"status","planned","start",start,"end",end,"items",tasks);}
  @BeforeEach void setup(){
    when(workspace.team()).thenReturn(List.of(member("dev","DEVELOPER","CORE")));
    when(workspace.sprints()).thenReturn(List.of());when(workspace.backlog()).thenReturn(List.of());when(workspace.calendar()).thenReturn(List.of());when(workspace.leaves()).thenReturn(List.of());
    when(workspace.sprint(anyString())).thenAnswer(call->workspace.sprints().stream().filter(s->s.get("id").equals(call.getArgument(0))).findFirst().orElseThrow());
    when(workspace.bauTemplates()).thenReturn(List.of(row("mode","CORE","active",true,"workKind","SUPPORT","daysPerMember",1)));
    when(schedules.at(any())).thenReturn(WorkScheduleService.legacy());when(schedules.forSprint(anyString())).thenReturn(WorkScheduleService.legacy());
    when(policies.at(anyString(),any(),anyDouble())).thenReturn(new MemberCapacityService.Policy(8,100));when(policies.forSprint(anyString(),anyString(),anyDouble())).thenReturn(new MemberCapacityService.Policy(8,100));
    when(presence.periods(anyString())).thenReturn(List.of(new ParticipationService.Period(null,null,false)));
    when(db.queryForObject(anyString(),eq(Double.class),anyString(),anyString())).thenReturn(0d);
  }
  FutureWorkloadService.Report report(){return service.report("2030-01-07",1,1,null);}

  @Test void subtractsBauHolidayAndLeaveOnceAndExcludesSupport(){
    when(workspace.team()).thenReturn(List.of(member("dev","DEVELOPER","CORE"),member("external","DESIGNER","SUPPORT"),member("arch","ARCHITECT","CORE")));
    when(workspace.calendar()).thenReturn(List.of(row("date","2030-01-08"),row("date","2030-01-08","memberId","dev")));
    when(workspace.leaves()).thenReturn(List.of(leave("2030-01-08","2030-01-09",1)));
    var p=report().periods().getFirst();assertEquals(40,p.nominalHours());assertEquals(8,p.offHours());assertEquals(8,p.leaveHours());assertEquals(8,p.bauHours());assertEquals(16,p.capacityHours());
  }
  @Test void halfDayAndOverlappingLeaveDoesNotDoubleDeduct(){
    when(workspace.leaves()).thenReturn(List.of(leave("2030-01-09","2030-01-09",0.5),leave("2030-01-09","2030-01-09",0.5)));
    assertEquals(4,report().periods().getFirst().leaveHours());
  }
  @Test void futureParticipationAndDatedFocusPolicyAreApplied(){
    when(presence.periods("dev")).thenReturn(List.of(new ParticipationService.Period("2030-01-09","2030-01-10",true)));
    when(policies.at(eq("dev"),any(),anyDouble())).thenReturn(new MemberCapacityService.Policy(8,50));
    var p=service.report("2030-01-07",1,1,0d).periods().getFirst();assertEquals(8,p.nominalHours());assertEquals(8,p.capacityHours());
  }
  @Test void actualBauAssignmentsAndOnlyIncludedPlannedOvertimeTakePrecedence(){
    var bau=task("bau","BAU",999,List.of(assignment("dev",16)));bau.put("taskSubtype","SUPPORT");
    when(workspace.sprints()).thenReturn(List.of(sprint("s1","2030-01-07","2030-01-11",List.of(bau))));
    when(db.queryForObject(contains("include_in_capacity=true"),eq(Double.class),eq("s1"),eq("dev"))).thenReturn(4d);
    var p=report().periods().getFirst();assertEquals(16,p.bauHours());assertEquals(4,p.overtimeHours());assertEquals(28,p.capacityHours());assertEquals("PLANNED",p.bauSource());assertTrue(report().items().isEmpty());
  }
  @Test void focusReducesCapacityButDoesNotShrinkBauDayBudget(){
    when(policies.at(anyString(),any(),anyDouble())).thenReturn(new MemberCapacityService.Policy(8,50));
    var p=report().periods().getFirst();assertEquals(20,p.nominalHours());assertEquals(8,p.bauHours());assertEquals(12,p.capacityHours());
  }
  @Test void preservesUnknownsAndExcludesActiveDoneAndBauDemand(){
    var p=pool("pending","DEV",20);var bau=pool("bau","BAU",100);var leave=pool("leave","BAU",8);leave.put("taskSubtype","LEAVE");var done=pool("done","DEV",50);done.put("state","Done");var active=pool("active","DEV",40);active.put("sprintId","active-sprint");
    when(workspace.backlog()).thenReturn(List.of(p,bau,leave,done,active,pool("unknown","DESIGN",0)));
    var r=report();assertEquals(2,r.items().size());assertEquals(20,r.items().stream().mapToDouble(FutureWorkloadService.Work::coreHours).sum());assertTrue(r.items().get(1).unestimated());assertFalse(r.warnings().isEmpty());
  }
  @Test void assignedHoursOverrideEstimateAndExternalHoursStaySeparate(){
    when(workspace.team()).thenReturn(List.of(member("dev","DEVELOPER","CORE"),member("ext","DESIGNER","SUPPORT")));
    var t=task("work","DESIGN",999,List.of(assignment("dev",8),assignment("ext",16)));
    when(workspace.sprints()).thenReturn(List.of(sprint("s1","2030-01-07","2030-01-11",List.of(t))));
    var i=report().items().getFirst();assertEquals(24,i.estimatedHours());assertEquals(8,i.coreHours());assertEquals(16,i.supportHours());assertEquals("DEV",i.roles().getFirst().role());
  }
  @Test void unestimatedAssignmentAndXNeverTurnIntoInventedHours(){
    var x=assignment("dev",0);x.put("supportOnly",true);
    var t=task("unknown","DEV",99,List.of(assignment("dev",0),x));
    when(workspace.sprints()).thenReturn(List.of(sprint("s1","2030-01-07","2030-01-11",List.of(t))));
    var i=report().items().getFirst();assertTrue(i.unestimated());assertEquals(0,i.coreHours());
  }
  @Test void reserveIsDeductedAsBauAndLinkedDefectsOnlyAddExcess(){
    var reserve=task("reserve","BAU",0,List.of(assignment("dev",8)));reserve.put("taskSubtype","DEFECT_SUPPORT");
    var closed=task("a-closed","DEFECT",0,List.of(assignment("dev",2)));closed.put("reserveTaskId","reserve");closed.put("status","done");
    var open=task("b-open","DEFECT",0,List.of(assignment("dev",10)));open.put("reserveTaskId","reserve");
    when(workspace.sprints()).thenReturn(List.of(sprint("s1","2030-01-07","2030-01-11",List.of(open,reserve,closed))));
    var r=report();assertEquals(1,r.items().size());var i=r.items().getFirst();assertEquals(6,i.reserveHours());assertEquals(4,i.coreHours());assertEquals(8,r.periods().getFirst().bauHours());assertEquals(32,r.periods().getFirst().capacityHours());
    assertFalse(open.containsKey("planningHours"),"Read-only report must not mutate source tasks");
  }
  @Test void undatedLeaveOnlyReducesItsLinkedSprint(){
    when(workspace.leaves()).thenReturn(List.of(leave("","",2)));
    when(workspace.sprints()).thenReturn(List.of(sprint("s1","2030-01-07","2030-01-11",List.of())));
    var r=service.report("2030-01-07",2,1,0d);assertEquals(16,r.periods().getFirst().leaveHours());assertEquals(0,r.periods().get(1).leaveHours());assertFalse(r.warnings().isEmpty());
  }
  @Test void overlappingSprintsNeverDuplicateCalendarCapacityAndKeepOutsideDemand(){
    when(workspace.sprints()).thenReturn(List.of(sprint("s1","2030-01-07","2030-01-11",List.of()),sprint("s2","2030-01-10","2030-01-16",List.of(task("later","DEV",10,List.of())))));
    var r=service.report("2030-01-07",2,1,0d);assertEquals("2030-01-12",r.periods().get(1).start());assertEquals(64,r.periods().stream().mapToDouble(FutureWorkloadService.Period::capacityHours).sum());assertFalse(r.warnings().isEmpty());
    var shortReport=report();assertEquals(1,shortReport.items().size());assertTrue(shortReport.warnings().stream().anyMatch(w->w.contains("dışında")));
  }
  @Test void weekendOnlyGapDoesNotConsumeForecastPeriod(){
    when(workspace.sprints()).thenReturn(List.of(sprint("s1","2030-01-07","2030-01-11",List.of()),sprint("s2","2030-01-14","2030-01-18",List.of())));
    var r=service.report("2030-01-07",2,1,0d);assertEquals("s2",r.periods().get(1).sprintId());assertEquals(80,r.periods().stream().mapToDouble(FutureWorkloadService.Period::capacityHours).sum());
  }
  @Test void actualZeroBauIsNotReplacedAndBauOverflowIsExplicit(){
    when(workspace.sprints()).thenReturn(List.of(sprint("s1","2030-01-07","2030-01-11",List.of(task("bau","BAU",0,List.of(assignment("dev",0)))))));
    assertEquals(40,report().periods().getFirst().capacityHours());
    when(workspace.sprints()).thenReturn(List.of());var p=service.report("2030-01-07",1,1,6d).periods().getFirst();assertEquals(0,p.capacityHours());assertEquals(40,p.bauHours());assertEquals(8,p.bauOverHours());
  }
  @Test void defaultsAfterActiveSprintAndIgnoresLeaveTemplates(){
    when(workspace.sprints()).thenReturn(List.of(row("id","active","status","active","end","2030-01-11")));
    when(workspace.bauTemplates()).thenReturn(List.of(row("mode","CORE","active",true,"workKind","LEAVE","daysPerMember",10)));
    var r=service.report(null,1,1,null);assertEquals("2030-01-14",r.from());assertEquals(0,r.bauDays());
  }
  @Test void emptyTeamAndInvalidParametersAreHandled(){
    when(workspace.team()).thenReturn(List.of());assertEquals(0,report().periods().getFirst().capacityHours());
    assertThrows(IllegalArgumentException.class,()->service.report("invalid",1,1,0d));assertThrows(IllegalArgumentException.class,()->service.report("2029-01-07",1,1,0d));assertThrows(IllegalArgumentException.class,()->service.report(null,13,1,0d));assertThrows(IllegalArgumentException.class,()->service.report(null,1,1,Double.NaN));
  }
}
