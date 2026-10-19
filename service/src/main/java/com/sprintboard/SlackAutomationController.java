package com.sprintboard;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/admin/slack")
public class SlackAutomationController {
 private final SlackHistoryService history;private final SlackWeeklyService weekly;
 public SlackAutomationController(SlackHistoryService history,SlackWeeklyService weekly){this.history=history;this.weekly=weekly;}
 private ResponseEntity<?> response(Object value){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);}
 @GetMapping("/history") public ResponseEntity<?> history(){return response(history.status());}
 @PostMapping("/history/scan") public ResponseEntity<?> scan(@RequestBody Map<String,Object> input,java.security.Principal actor){return response(history.scan(input,actor.getName()));}
 @GetMapping("/weekly") public ResponseEntity<?> weekly(){return response(weekly.status());}
 @PutMapping("/weekly") public ResponseEntity<?> save(@RequestBody Map<String,Object> input){return response(weekly.save(input));}
 @GetMapping("/weekly/preview") public ResponseEntity<?> preview(){return response(weekly.preview());}
 @PostMapping("/weekly/send") public ResponseEntity<?> send(@RequestBody Map<String,Object> input,java.security.Principal actor){return response(weekly.manual(input,actor.getName()));}
}
