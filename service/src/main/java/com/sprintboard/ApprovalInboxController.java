package com.sprintboard;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Mapped under /api/admin so the existing ADMIN rule covers it: approval
 *  counts describe queues only administrators can act on. */
@RestController
@RequestMapping("/api/admin/approvals")
public class ApprovalInboxController {
  private final ApprovalInboxService service;

  public ApprovalInboxController(ApprovalInboxService service) { this.service = service; }

  /** Polled by the notification bell, so it must never be cached. */
  @GetMapping
  public ResponseEntity<?> summary() {
    return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.summary());
  }
}
