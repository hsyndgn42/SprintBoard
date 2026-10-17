package com.sprintboard;

import java.nio.charset.StandardCharsets;

final class PasswordPolicy {
  private PasswordPolicy() {}
  static String validate(String value) {
    if (value == null || value.length() < 12 || value.getBytes(StandardCharsets.UTF_8).length > 72)
      throw new IllegalArgumentException("Şifre en az 12 karakter, UTF-8 olarak en fazla 72 bayt olmalı.");
    return value;
  }
}
