package com.sprintboard;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/reports/future-workload")
public class FutureWorkloadController {
 private final FutureWorkloadService service;
 public FutureWorkloadController(FutureWorkloadService service){this.service=service;}
 @GetMapping public FutureWorkloadService.Report report(@RequestParam(required=false) String from,@RequestParam(defaultValue="6") int periods,@RequestParam(defaultValue="3") int weeks,@RequestParam(required=false) Double bauDays){return service.report(from,periods,weeks,bauDays);}
}
