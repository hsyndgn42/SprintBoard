package com.sprintboard;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.nio.file.Path;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:backupsecurity;DB_CLOSE_DELAY=-1","sprintboard.slack.bot-token=","sprintboard.slack.app-token="})
@AutoConfigureMockMvc
class DatabaseBackupSecurityTest {
 @Autowired MockMvc mvc;@MockitoBean DatabaseBackupScheduler backups;
 @Test void backupStatusIsAdminOnly()throws Exception{
  mvc.perform(get("/api/admin/backups/status")).andExpect(status().isUnauthorized());
  mvc.perform(get("/api/admin/backups/status").with(user("member").roles("USER"))).andExpect(status().isForbidden());
  when(backups.status()).thenReturn(java.util.Map.of("result","FAILED","lastSuccessAt","2026-10-17T16:00:00Z","nextScheduledAt","2026-10-17T21:00:00Z"));
  mvc.perform(get("/api/admin/backups/status").with(user("admin").roles("ADMIN"))).andExpect(status().isOk()).andExpect(jsonPath("$.result").value("FAILED")).andExpect(jsonPath("$.lastSuccessAt").value("2026-10-17T16:00:00Z")).andExpect(header().string("Cache-Control","no-store"));
 }
 @Test void onlyAdminWithCsrfCanCreateBackup()throws Exception{
  mvc.perform(post("/api/admin/backups/full").with(csrf())).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/admin/backups/full").with(user("member").roles("USER")).with(csrf())).andExpect(status().isForbidden());
  mvc.perform(post("/api/admin/backups/full").with(user("admin").roles("ADMIN"))).andExpect(status().isForbidden());
  verify(backups,never()).create(any());
  when(backups.create(any())).thenReturn(Path.of("private/path/backup.zip"));
  mvc.perform(post("/api/admin/backups/full").with(user("admin").roles("ADMIN")).with(csrf())).andExpect(status().isOk()).andExpect(jsonPath("$.filename").value("backup.zip")).andExpect(header().string("Cache-Control","no-store"));
  verify(backups,times(1)).create(any());
 }
}
