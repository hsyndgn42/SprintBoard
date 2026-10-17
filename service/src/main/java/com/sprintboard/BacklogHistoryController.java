package com.sprintboard;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
@RestController
public class BacklogHistoryController {
  private final BacklogHistoryService history;
  public BacklogHistoryController(BacklogHistoryService history){this.history=history;}
  @GetMapping("/api/backlog/{id}/history") public ResponseEntity<?> read(@PathVariable String id){
    var result=history.read(id);return result==null?ResponseEntity.notFound().build():ResponseEntity.ok(result);
  }
}
