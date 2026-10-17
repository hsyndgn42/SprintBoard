package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
class DefectTrendTest {
 @Test void usesSprintSnapshotsGroupsFiltersAndDoesNotLeakDetails(){
  var service=mock(WorkspaceService.class,CALLS_REAL_METHODS);
  doReturn(List.of(Map.of("id","old"),Map.of("id","new"))).when(service).sprints();
  var defect=Map.of("taskCategory","DEFECT","taskSubtype","TEST_DEFECT","status","undone","name","private title","defect",Map.of("severity","HIGH","environment","SAT","reporterName","private person"));
  doReturn(Map.of("items",List.of(defect,defect,Map.of("taskCategory","BAU")))).when(service).sprint("old");
  doReturn(Map.of("items",List.of(Map.of("taskCategory","DEFECT","taskSubtype","PROD_DEFECT","status","done")))).when(service).sprint("new");
  var rows=service.defectTrend();
  assertEquals(2,rows.size());assertEquals(2,rows.getFirst().get("count"));
  assertEquals("undone",rows.getFirst().get("status"));assertEquals("SAT",rows.getFirst().get("environment"));
  assertEquals("",rows.getLast().get("severity"));assertEquals("done",rows.getLast().get("status"));
  assertFalse(rows.toString().contains("private"));verify(service,never()).backlog();
 }
}
