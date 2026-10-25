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
  private final JiraSettingsService settings;
  public JiraController(JiraSettingsService settings){this.settings=settings;}
  private ResponseEntity<?> response(Object data){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(data);}
  /** A personal access token must not cross a plaintext connection. */
  private void secure(HttpServletRequest request){if(!request.isSecure()&&!Set.of("127.0.0.1","::1","0:0:0:0:0:0:0:1").contains(request.getRemoteAddr()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Token girişi için HTTPS veya localhost kullanın.");}
  @GetMapping public ResponseEntity<?> status(){return response(settings.status());}
  @PutMapping public ResponseEntity<?> save(@RequestBody Map<String,Object> input,HttpServletRequest request){secure(request);return response(settings.save(input));}
  @PostMapping("/test") public ResponseEntity<?> test(){return response(settings.test());}
  @DeleteMapping("/credentials") public ResponseEntity<?> forget(){return response(settings.forget());}
}
