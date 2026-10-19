package com.sprintboard;

import java.util.Map;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/slack")
public class SlackPreviewController {
  private final SlackPreviewService service;private final SlackInboxService inbox;private final SlackReporterService reporters;private final SlackOvertimeService overtime;private final SlackReceiptService receipts;
  private final SlackMessageCorrectionService corrections;
  private final SlackBacklogService backlog;
  public SlackPreviewController(SlackPreviewService service,SlackInboxService inbox,SlackReporterService reporters,SlackOvertimeService overtime,SlackReceiptService receipts,SlackBacklogService backlog,SlackMessageCorrectionService corrections){this.corrections=corrections;this.service=service;this.inbox=inbox;this.reporters=reporters;this.overtime=overtime;this.receipts=receipts;this.backlog=backlog;}
  private ResponseEntity<?> response(Object data){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(data);}
  @GetMapping public ResponseEntity<?> status(){var status=new java.util.LinkedHashMap<String,Object>(service.status());status.putAll(reporters.status());status.putAll(receipts.status());return response(status);}
  private void secure(HttpServletRequest request){if(!request.isSecure()&&!java.util.Set.of("127.0.0.1","::1","0:0:0:0:0:0:0:1").contains(request.getRemoteAddr()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Token girişi için HTTPS veya localhost kullanın.");}
  @PutMapping public ResponseEntity<?> save(@RequestBody Map<String,Object> input,HttpServletRequest request){secure(request);return response(service.save(input));}
  @PostMapping("/reporter-names/retry") public Object retryNames(){reporters.retry();return response(Map.of("queued",true));}
  @GetMapping("/inbox") public ResponseEntity<?> inbox(@RequestParam(defaultValue="WAITING") String filter,@RequestParam(defaultValue="0") int page){return response(inbox.list(filter,page));}
  @GetMapping("/backlog-inbox") public ResponseEntity<?> backlogInbox(@RequestParam(defaultValue="WAITING") String filter,@RequestParam(defaultValue="0") int page){return response(backlog.list(filter,page));}
  @PostMapping("/backlog-inbox/{id}/decision") public ResponseEntity<?> backlogDecision(@PathVariable String id,@RequestBody Map<String,Object> input,java.security.Principal principal){return response(backlog.decide(id,input,principal.getName()));}
  @PostMapping("/inbox/{id}/decision") public ResponseEntity<?> decision(@PathVariable String id,@RequestBody Map<String,Object> input,java.security.Principal principal){return response(inbox.decide(id,input,principal.getName()));}
  @GetMapping("/overtime-inbox") public ResponseEntity<?> overtimeInbox(@RequestParam(defaultValue="WAITING") String filter,@RequestParam(defaultValue="0") int page){return response(overtime.list(filter,page));}
  @PostMapping("/overtime-inbox/{id}/decision") public ResponseEntity<?> overtimeDecision(@PathVariable String id,@RequestBody Map<String,Object> input,java.security.Principal principal){return response(overtime.decide(id,input,principal.getName()));}
  @PostMapping("/overtime-inbox/{id}/correction") public ResponseEntity<?> overtimeCorrection(@PathVariable String id,@RequestBody Map<String,Object> input,java.security.Principal principal){return response(overtime.correct(id,input,principal.getName()));}
  @PostMapping("/inbox/{id}/correction") public ResponseEntity<?> defectCorrection(@PathVariable String id,@RequestBody Map<String,Object> input,java.security.Principal principal){return response(corrections.correct(false,id,input,principal.getName()));}
  @PostMapping("/backlog-inbox/{id}/correction") public ResponseEntity<?> backlogCorrection(@PathVariable String id,@RequestBody Map<String,Object> input,java.security.Principal principal){return response(corrections.correct(true,id,input,principal.getName()));}
  @PostMapping("/start") public ResponseEntity<?> start(@RequestBody Map<String,Object> input,HttpServletRequest request){
    if(!request.isSecure()&&!java.util.Set.of("127.0.0.1","::1","0:0:0:0:0:0:0:1").contains(request.getRemoteAddr()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Token girişi için HTTPS veya localhost kullanın.");
    return response(service.start(input));
  }
  @PostMapping("/stop") public ResponseEntity<?> stop(){return response(service.stop(false));}
  @DeleteMapping("/credentials") public ResponseEntity<?> forget(){return response(service.stop(true));}
  @PostMapping("/parse") public ResponseEntity<?> parse(@RequestBody Map<String,Object> input){
    if(!(input.get("text") instanceof String text)||text.length()>12000)throw new IllegalArgumentException("Mesaj en fazla 12.000 karakter olmalı.");return response(service.parse(text));
  }
}
