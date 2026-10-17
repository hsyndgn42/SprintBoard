package com.sprintboard;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiErrors {
  @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
  public ResponseEntity<Map<String,String>> denied(org.springframework.web.server.ResponseStatusException error){
    return ResponseEntity.status(error.getStatusCode()).body(Map.of("error",java.util.Objects.toString(error.getReason(),"İşlem reddedildi.")));
  }
  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<Map<String, String>> invalid(IllegalArgumentException error) {
    return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", error.getMessage()));
  }
  @ExceptionHandler(IllegalStateException.class)
  public ResponseEntity<Map<String, String>> conflict(IllegalStateException error) {
    return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", error.getMessage()));
  }
}
