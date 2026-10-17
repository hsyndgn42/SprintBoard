package com.sprintboard;

import java.util.List;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;

/** Immutable login-time version; changing an account revokes every earlier session. */
public final class AccountPrincipal extends User {
  private final long sessionVersion;

  public AccountPrincipal(String username, String password, String role, boolean active, long sessionVersion) {
    super(username, password, active, true, true, true, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
    this.sessionVersion = sessionVersion;
  }

  public long sessionVersion() { return sessionVersion; }
}
