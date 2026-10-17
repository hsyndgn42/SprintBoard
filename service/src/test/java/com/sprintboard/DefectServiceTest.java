package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:defecttest;DB_CLOSE_DELAY=-1")
@Transactional
@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
class DefectServiceTest {
  @Autowired WorkspaceService workspace;
  @Autowired DefectService defects;
  @Autowired SprintClosureStore closures;
  private Map<String,Object> details(){return new HashMap<>(Map.of("severity","HIGH","environment","UAT","verification","PENDING","verificationNote","Reproduce","verifierId","legacy-member-yasin"));}
  private String create(){return workspace.createBacklog(Map.of("title","QA Defect","size","SMALL","taskCategory","DEFECT","taskSubtype","TEST_DEFECT","defect",details())).get("id").toString();}
  private String add(String id){var check=(Map<?,?>)workspace.readiness(id).get("readiness");return workspace.addTask("legacy-sprint-14",Map.of("backlogId",id,"reason","Test planı","readinessAcknowledged",true,"readinessFingerprint",check.get("fingerprint"))).get("id").toString();}
  @Test void metadataDoesNotChangeStatusAndIsIncludedInReportsAndSnapshots(){
    String id=create(),task=add(id);var d=details();d.put("verification","PASSED");defects.save(id,d);
    var item=workspace.readiness(id);assertEquals("todo",item.get("taskStatus"));assertNotNull(defects.all().get(id).get("verifiedAt"));
    assertTrue(workspace.defectReports().stream().anyMatch(r->id.equals(r.get("id"))));
    var preview=workspace.closurePreview("legacy-sprint-14");d.put("environment","PROD");defects.save(id,d);
    assertThrows(IllegalArgumentException.class,()->workspace.completeSprint("legacy-sprint-14",Map.of("confirmed",true,"fingerprint",preview.get("fingerprint"),"carryTaskIds",List.of())));
    var fresh=workspace.closurePreview("legacy-sprint-14");workspace.completeSprint("legacy-sprint-14",Map.of("confirmed",true,"fingerprint",fresh.get("fingerprint"),"carryTaskIds",List.of()));
    assertThrows(IllegalArgumentException.class,()->defects.save(id,d));
    var tasks=(List<Map<String,Object>>)workspace.sprint("legacy-sprint-14").get("items");assertEquals("PASSED",((Map<?,?>)tasks.stream().filter(t->task.equals(t.get("id"))).findFirst().orElseThrow().get("defect")).get("verification"));
  }
  @Test void repeatedDefectResetsVerificationAndTaxonomyChangeInvalidatesOldResult(){
    String id=create(),task=add(id);var d=details();d.put("verification","FAILED");defects.save(id,d);
    String copy=workspace.repeatBacklog(id).get("id").toString();var next=defects.all().get(copy);
    assertEquals("HIGH",next.get("severity"));assertEquals("UAT",next.get("environment"));assertEquals("NOT_CHECKED",next.get("verification"));assertNull(next.get("verifierId"));assertNull(next.get("verifiedAt"));
    workspace.updateTask(task,Map.of("taskCategory","DEFECT","taskSubtype","PROD_DEFECT"));assertEquals("NOT_CHECKED",defects.all().get(id).get("verification"));
  }
  @Test void rejectsInvalidMetadataAndDoesNotInventHistoricalResults(){
    assertTrue(defects.all().isEmpty());String id=create();var d=details();d.put("severity","INVALID");assertThrows(IllegalArgumentException.class,()->defects.save(id,d));
    d.put("severity","HIGH");d.put("relatedId",id);assertThrows(IllegalArgumentException.class,()->defects.save(id,d));
    d.put("relatedId","missing");assertThrows(IllegalArgumentException.class,()->defects.save(id,d));
    d.remove("relatedId");d.put("verifierId","missing");assertThrows(IllegalArgumentException.class,()->defects.save(id,d));
    String dev=workspace.createBacklog(Map.of("title","Dev","size","SMALL")).get("id").toString();assertThrows(IllegalArgumentException.class,()->defects.save(dev,details()));
    d.put("verifierId","legacy-member-yasin");d.put("relatedId",dev);defects.save(id,d);assertEquals("Dev",defects.all().get(id).get("relatedTitle"));
  }
}
