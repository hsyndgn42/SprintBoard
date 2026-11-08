package com.sprintboard;
import java.util.Map;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/confluence/backlog")
public class ConfluenceBacklogController {
 private final ConfluenceBacklogService service;
 public ConfluenceBacklogController(ConfluenceBacklogService service){this.service=service;}
 private ResponseEntity<?> response(Object data){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(data);}
 @GetMapping public ResponseEntity<?> status(){return response(service.status());}
 @PostMapping("/preview") public ResponseEntity<?> preview(@RequestBody Map<String,Object> input){return response(service.preview(input));}
 @PostMapping public ResponseEntity<?> publish(@RequestBody Map<String,Object> input){return response(service.publish(input));}
}
