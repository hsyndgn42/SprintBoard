package com.sprintboard;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class JiraSettingsTest {
 @TempDir Path folder;
 JdbcTemplate db; JiraConfigStore configs; JiraTransport transport; JiraSettingsService settings;
 ObjectMapper mapper=new ObjectMapper();
 Clock clock=Clock.fixed(Instant.parse("2026-10-26T09:00:00Z"),ZoneOffset.UTC);

 @BeforeEach void setup(){
  var ds=new DriverManagerDataSource("jdbc:h2:mem:jira-"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1","sa","");
  Flyway.configure().dataSource(ds).load().migrate();
  db=new JdbcTemplate(ds);
  configs=new JiraConfigStore(db,new JiraSecretVault("",folder.resolve("key").toString()));
  transport=mock(JiraTransport.class);
  settings=new JiraSettingsService(configs,transport,db,mapper,clock);
 }

 Map<String,Object> form(String pat,boolean enabled,int version){
  var input=new LinkedHashMap<String,Object>();
  input.put("baseUrl","https://itjira.example.local");input.put("projectKey","vbcrf");input.put("boardId","19233");
  input.put("defectJql","");input.put("fieldDefaults","");input.put("enabled",enabled);input.put("version",version);input.put("pat",pat);
  return input;
 }

 /** A pasted address often ends with a slash, which would turn every link into a double slash. */
 @Test void storesTheAddressWithoutATrailingSlash(){
  var input=form("pat-token",true,0);
  input.put("baseUrl","https://itjira.example.local//");
  settings.save(input);
  assertEquals("https://itjira.example.local",configs.load().baseUrl());
 }

 @Test void rejectsPlainHttpAndForeignPaths(){
  assertThrows(IllegalArgumentException.class,()->JiraTransport.endpoint("http://jira.local","/rest/api/2/myself",Map.of()));
  assertThrows(IllegalArgumentException.class,()->JiraTransport.endpoint("https://jira.local","/secure/Dashboard.jspa",Map.of()));
  assertThrows(IllegalArgumentException.class,()->JiraTransport.endpoint("https://jira.local","/rest/api/2/../../admin",Map.of()));
  assertThrows(IllegalArgumentException.class,()->JiraTransport.endpoint("https://user:pw@jira.local","/rest/api/2/myself",Map.of()));
 }

 @Test void buildsEncodedQueryAndTrimsTrailingSlash(){
  var uri=JiraTransport.endpoint("https://jira.local/","/rest/api/2/search",new LinkedHashMap<>(Map.of("jql","project = TDEF")));
  assertEquals("https://jira.local/rest/api/2/search?jql=project+%3D+TDEF",uri.toString());
 }

 @Test void reportsFieldErrorsBecauseThatIsWhatMakesA400Fixable()throws Exception{
  var body=mapper.readTree("{\"errorMessages\":[\"please add parent of Epic\"],\"errors\":{\"customfield_32981\":\"expected Object\"}}");
  var detail=JiraTransport.detail(body);
  assertTrue(detail.contains("please add parent of Epic"));
  assertTrue(detail.contains("customfield_32981"));
 }

 @Test void storesTokenWithoutEverReturningIt(){
  settings.save(form("secret-pat",true,0));
  var status=settings.status();
  assertEquals(true,status.get("patConfigured"));
  assertFalse(status.toString().contains("secret-pat"));
  assertEquals("VBCRF",status.get("projectKey"));
  assertEquals(JiraConfigStore.DEFAULT_DEFECT_JQL,status.get("defectJql"));
  assertEquals("secret-pat",configs.token());
 }

 @Test void keepsStoredTokenWhenTheFormSendsAnEmptyOne(){
  int version=(int)settings.save(form("secret-pat",true,0)).get("version");
  var again=form("",true,version);
  again.put("boardId","42");
  settings.save(again);
  assertEquals("secret-pat",configs.token());
  assertEquals("42",settings.status().get("boardId"));
 }

 @Test void refusesToEnableWithoutATokenOrWithAnInvalidKey(){
  assertThrows(IllegalArgumentException.class,()->settings.save(form("",true,0)));
  var bad=form("secret-pat",true,0);bad.put("projectKey","vb-crf!");
  assertThrows(IllegalArgumentException.class,()->settings.save(bad));
  var insecure=form("secret-pat",true,0);insecure.put("baseUrl","http://jira.local");
  assertThrows(IllegalArgumentException.class,()->settings.save(insecure));
 }

 @Test void forgettingClearsTheTokenAndDisablesTheIntegration(){
  settings.save(form("secret-pat",true,0));
  var status=settings.forget();
  assertEquals(false,status.get("patConfigured"));
  assertEquals(false,status.get("enabled"));
  assertThrows(IllegalArgumentException.class,()->configs.token());
 }

 @Test void connectionTestReportsIdentityAndProjectReach()throws Exception{
  settings.save(form("secret-pat",true,0));
  when(transport.get(anyString(),eq("secret-pat"),eq("/rest/api/2/myself"),anyMap())).thenReturn(mapper.readTree("{\"displayName\":\"Huseyin Dogan\",\"name\":\"huseyin.dogan\"}"));
  when(transport.get(anyString(),eq("secret-pat"),eq("/rest/api/2/project/VBCRF"),anyMap())).thenReturn(mapper.readTree("{\"name\":\"VibeCraft\"}"));
  var result=settings.test();
  assertEquals("Huseyin Dogan",result.get("user"));
  assertEquals("VibeCraft",result.get("project"));
  assertEquals(true,result.get("projectReachable"));
 }

 @Test void connectionTestKeepsIdentityWhenTheProjectIsNotReachable()throws Exception{
  settings.save(form("secret-pat",true,0));
  when(transport.get(anyString(),eq("secret-pat"),eq("/rest/api/2/myself"),anyMap())).thenReturn(mapper.readTree("{\"displayName\":\"Huseyin Dogan\"}"));
  when(transport.get(anyString(),eq("secret-pat"),eq("/rest/api/2/project/VBCRF"),anyMap())).thenThrow(new IllegalStateException("Jira kaydı bulunamadı ya da görme yetkiniz yok."));
  var result=settings.test();
  assertEquals(true,result.get("connected"));
  assertEquals(false,result.get("projectReachable"));
 }

 @Test void rejectsFieldDefaultsThatAreNotJson(){
  var input=form("secret-pat",false,0);
  input.put("fieldDefaults","{sizePoints:");
  assertThrows(IllegalArgumentException.class,()->settings.save(input));
 }

 @Test void writesAnAuditTrailWithoutTheToken(){
  settings.save(form("secret-pat",true,0));
  var rows=db.queryForList("SELECT action, detail_json FROM audit_event WHERE entity_type='jira'");
  assertEquals(1,rows.size());
  assertEquals("settings-saved",rows.getFirst().get("action"));
  assertFalse(String.valueOf(rows.getFirst().get("detail_json")).contains("secret-pat"));
 }
}
