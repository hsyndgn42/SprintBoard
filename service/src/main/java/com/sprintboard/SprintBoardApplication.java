package com.sprintboard;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class SprintBoardApplication {
  public static void main(String[] args) {
    if (java.util.Arrays.stream(args).anyMatch(arg -> arg.startsWith("--recover-admin"))) {
      System.exit(LocalAdminRecovery.run(args));
      return;
    }
    SpringApplication.run(SprintBoardApplication.class, args);
  }
}
