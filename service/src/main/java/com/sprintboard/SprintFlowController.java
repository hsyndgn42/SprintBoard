package com.sprintboard;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/tasks")
public class SprintFlowController {
 private final SprintFlowService flow;
 public SprintFlowController(SprintFlowService flow){this.flow=flow;}
 @PutMapping("/{id}/blocker") public ResponseEntity<?> blocker(@PathVariable String id,@RequestBody Map<String,Object> input){var result=flow.setBlocker(id,input);return result==null?ResponseEntity.notFound().build():ResponseEntity.ok(result);}
}
