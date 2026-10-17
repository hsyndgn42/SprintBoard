package com.sprintboard;

import java.security.Principal;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/sprints/{sprint}/review-notes")
public class ReviewNoteController {
  private final ReviewNoteService notes;
  public ReviewNoteController(ReviewNoteService notes){this.notes=notes;}
  @GetMapping public ResponseEntity<?> get(@PathVariable String sprint){var result=notes.get(sprint);return result==null?ResponseEntity.notFound().build():ResponseEntity.ok(result);}
  @PutMapping public ResponseEntity<?> save(@PathVariable String sprint,@RequestBody Map<String,Object> input,Principal principal){var result=notes.save(sprint,input,principal.getName());return result==null?ResponseEntity.notFound().build():ResponseEntity.ok(result);}
}
