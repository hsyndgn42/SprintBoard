package com.sprintboard;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.Set;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Mapped under /api/admin so the existing ADMIN rule covers the Jira token. */
@RestController
@RequestMapping("/api/admin/jira")
public class JiraController {
  private final JiraSettingsService settings; private final JiraEpicService epics; private final JiraOutbox outbox;
  public JiraController(JiraSettingsService settings,JiraEpicService epics,JiraOutbox outbox){this.settings=settings;this.epics=epics;this.outbox=outbox;}
  private ResponseEntity<?> response(Object data){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(data);}
  /** A personal access token must not cross a plaintext connection. */
  private void secure(HttpServletRequest request){if(!request.isSecure()&&!Set.of("127.0.0.1","::1","0:0:0:0:0:0:0:1").contains(request.getRemoteAddr()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Token girişi için HTTPS veya localhost kullanın.");}
  @GetMapping public ResponseEntity<?> status(){return response(settings.status());}
  @PutMapping public ResponseEntity<?> save(@RequestBody Map<String,Object> input,HttpServletRequest request){secure(request);return response(settings.save(input));}
  @PostMapping("/test") public ResponseEntity<?> test(){return response(settings.test());}
  @PostMapping("/roadmap/{id}/epic") public ResponseEntity<?> createEpic(@PathVariable String id){return response(epics.create(id));}
  @PutMapping("/roadmap/{id}/epic") public ResponseEntity<?> linkEpic(@PathVariable String id,@RequestBody Map<String,Object> input){return response(epics.link(id,String.valueOf(input.getOrDefault("epicKey",""))));}
  @DeleteMapping("/roadmap/{id}/epic") public ResponseEntity<?> unlinkEpic(@PathVariable String id){return response(epics.unlink(id));}
  @PostMapping("/backlog/{id}/pbi") public ResponseEntity<?> retryPbi(@PathVariable String id){outbox.retry(id);return response(Map.of("backlogId",id,"queued",true));}
  @DeleteMapping("/credentials") public ResponseEntity<?> forget(){return response(settings.forget());}
}
