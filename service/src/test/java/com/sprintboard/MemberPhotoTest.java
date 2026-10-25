package com.sprintboard;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.*;
import java.io.*;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
@org.junit.jupiter.api.Tag("historical")
@org.springframework.test.context.ActiveProfiles("historical-tests")
@SpringBootTest(properties="spring.datasource.url=jdbc:h2:mem:member-photo;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc @Transactional
class MemberPhotoTest {
 @Autowired WorkspaceService w;@Autowired BackupService b;@Autowired ObjectMapper m;@Autowired MockMvc mvc;
 String png(int width,int height)throws Exception{var bytes=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(width,height,BufferedImage.TYPE_INT_RGB),"png",bytes);return "data:image/png;base64,"+Base64.getEncoder().encodeToString(bytes.toByteArray());}
 @Test void uploadReplaceRemoveAndBackupRoundTrip()throws Exception{
  String id=w.createMember(Map.of("name","Photo QA")).get("id").toString();var before=m.valueToTree(b.exportData()).path("tables");
  String photo=png(16,16);w.saveMemberPhoto(id,Map.of("photoDataUrl",photo));assertTrue(w.team().stream().filter(r->id.equals(r.get("id"))).findFirst().orElseThrow().get("photoDataUrl").toString().startsWith("data:image/png;base64,"));
  var export=m.valueToTree(b.exportData());assertEquals(41, export.path("schemaVersion").asInt());assertNotNull(b.preview(export));
  before.properties().forEach(e->{if(!e.getKey().equals("member_photo"))assertEquals(e.getValue(),export.path("tables").path(e.getKey()),e.getKey());});
  w.saveMemberPhoto(id,Map.of("photoDataUrl",png(32,32)));w.saveMemberPhoto(id,Map.of("photoDataUrl",""));assertNull(w.team().stream().filter(r->id.equals(r.get("id"))).findFirst().orElseThrow().get("photoDataUrl"));
  var p=b.preview(export);b.restore(m.valueToTree(Map.of("backup",export,"confirmation","GERİ YÜKLE","currentFingerprint",p.get("currentFingerprint"),"backupFingerprint",p.get("backupFingerprint"))));assertNotNull(w.team().stream().filter(r->id.equals(r.get("id"))).findFirst().orElseThrow().get("photoDataUrl"));
 }
 @Test void rejectsScriptsExternalLinksHugeDimensionsAndCorruptRaster()throws Exception{
  for(String value:List.of("https://example.invalid/a.png","data:image/svg+xml;base64,PHN2Zz4=","data:image/png;base64,SGVsbG8=","data:image/jpeg;base64,"+"A".repeat(360001)))assertThrows(IllegalArgumentException.class,()->MemberPhoto.normalize(value));
  String large=png(1025,1);assertThrows(IllegalArgumentException.class,()->MemberPhoto.normalize(large));
 }
 @Test void reviewIncludesCoreAndArchitectureButNotOtherSupport()throws Exception{
  String core=w.createMember(Map.of("name","Core QA","teamRole","DEVELOPER")).get("id").toString();
  String arch=w.createMember(Map.of("name","Arch QA","teamRole","ARCHITECT","engagement","SUPPORT")).get("id").toString();
  String support=w.createMember(Map.of("name","Support QA","teamRole","DESIGNER","engagement","SUPPORT")).get("id").toString();
  for(String id:List.of(core,arch,support))w.saveMemberPhoto(id,Map.of("photoDataUrl",png(8,8)));
  String sprint=w.createSprint(Map.of("name","Photo sprint","start","2027-06-07","end","2027-06-25")).get("id").toString();
  var people=w.reviewTeam(sprint);assertTrue(people.stream().anyMatch(p->core.equals(p.get("id"))));assertTrue(people.stream().anyMatch(p->arch.equals(p.get("id"))));assertFalse(people.stream().anyMatch(p->support.equals(p.get("id"))));assertTrue(people.stream().filter(p->List.of(core,arch).contains(p.get("id"))).allMatch(p->p.get("photoDataUrl")!=null));
 }
 @Test void oldBackupsRestoreWithoutInventingPhotos(){ObjectNode old=m.valueToTree(b.exportData());old.put("schemaVersion",29);BackupFixtureV41.removeMatching(old);((ObjectNode)old.path("tables")).remove(java.util.List.of("task_activity","overtime_request","leave_request","defect_reserve_link"));((ObjectNode)old.path("tables")).remove("member_photo");assertNotNull(b.preview(old));}
 @Test void photoMutationRequiresAdminAndCsrf()throws Exception{
  String body=m.writeValueAsString(Map.of("photoDataUrl",png(8,8)));
  mvc.perform(put("/api/team/legacy-member-isa/photo").with(user("reader").roles("USER")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(put("/api/team/legacy-member-isa/photo").with(user("admin").roles("ADMIN")).contentType("application/json").content(body)).andExpect(status().isForbidden());
  mvc.perform(put("/api/team/legacy-member-isa/photo").with(user("admin").roles("ADMIN")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isOk());
 }
}
