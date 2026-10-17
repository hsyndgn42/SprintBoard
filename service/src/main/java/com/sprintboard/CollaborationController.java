package com.sprintboard;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api")
public class CollaborationController {
 private final CollaborationService service;
 public CollaborationController(CollaborationService service){this.service=service;}
 @PutMapping("/admin/users/{username}/member") public Object link(@PathVariable String username,@RequestBody Map<String,String> body){service.link(username,body);return Map.of("saved",true);}
 @PatchMapping("/self/tasks/{id}/status") public Object status(@PathVariable String id,@RequestBody Map<String,Object> body){return service.status(id,body);}
 @PutMapping("/self/tasks/{id}/blocker") public Object blocker(@PathVariable String id,@RequestBody Map<String,Object> body){return service.blocker(id,body);}
 @PostMapping("/self/tasks/{id}/notes") public Object note(@PathVariable String id,@RequestBody Map<String,Object> body){return service.note(id,body);}
 @GetMapping("/sprints/{id}/journal") public Object journal(@PathVariable String id){return service.journal(id);}
 @GetMapping("/self/leave-requests") public Object leaveRequests(){return service.leaveRequests();}
 @PostMapping("/self/leave-requests") public Object requestLeave(@RequestBody Map<String,Object> body){return service.requestLeave(body);}
 @PostMapping("/admin/leave-requests/{id}/decision") public Object decideLeave(@PathVariable String id,@RequestBody Map<String,Object> body){return service.decideLeave(id,body);}
 @GetMapping("/self/overtime-requests") public Object requests(){return service.requests();}
 @PostMapping("/self/overtime-requests") public Object request(@RequestBody Map<String,Object> body){return service.request(body);}
 @PostMapping("/admin/overtime-requests/{id}/decision") public Object decide(@PathVariable String id,@RequestBody Map<String,Object> body){return service.decide(id,body);}
}
