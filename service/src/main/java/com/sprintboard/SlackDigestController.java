package com.sprintboard;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/admin/slack/digest")
public class SlackDigestController {
 private final SlackDigestService service;
 public SlackDigestController(SlackDigestService service){this.service=service;}
 private ResponseEntity<?> response(Object data){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(data);}
 @GetMapping public ResponseEntity<?> status(){return response(service.status());}
 @PutMapping public ResponseEntity<?> save(@RequestBody Map<String,Object> input){return response(service.save(input));}
 @PostMapping("/send") public ResponseEntity<?> send(@RequestBody Map<String,Object> input,java.security.Principal principal){return response(service.manual(Objects.toString(input.get("sprintId"),""),Objects.toString(input.get("requestId"),""),principal.getName(),Objects.toString(input.get("channelId"),"")));}
 @GetMapping("/preview") public ResponseEntity<?> preview(@RequestParam(defaultValue="") String sprintId){var snapshot=service.preview(sprintId);if(snapshot==null)throw new IllegalArgumentException("Aktif sprint bulunamadı.");return response(Map.of("html",snapshot.html(),"summary",snapshot.summary(),"filename","sprint-"+snapshot.number()+"-review.html"));}
}
