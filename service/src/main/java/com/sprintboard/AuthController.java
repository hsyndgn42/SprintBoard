package com.sprintboard;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class AuthController {
  private final CollaborationService collaboration;
  private final AccountService accounts;
  private final LoginSecurityService loginSecurity;
  public AuthController(AccountService accounts, LoginSecurityService loginSecurity, CollaborationService collaboration) { this.collaboration=collaboration; this.accounts = accounts; this.loginSecurity=loginSecurity; }

  @GetMapping("/auth/session")
  public Map<String, Object> session(Authentication authentication, CsrfToken csrf) {
    boolean signedIn = authentication != null && authentication.isAuthenticated()
        && !(authentication instanceof AnonymousAuthenticationToken);
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("authenticated", signedIn);
    result.put("setupRequired", accounts.setupRequired());
    result.put("username", signedIn ? authentication.getName() : null);
    result.put("role", signedIn ? authentication.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority())) ? "ADMIN" : "USER" : null);
    if(signedIn)result.putAll(collaboration.identity(authentication.getName()));
    result.put("csrfToken", csrf.getToken());
    return result;
  }

  @PostMapping("/auth/setup")
  public ResponseEntity<?> setup(@RequestBody Map<String, String> input) {
    return ResponseEntity.status(201).body(accounts.setupAdmin(input));
  }

  @GetMapping("/admin/users") public Object users() { return accounts.users(); }
  @PostMapping("/auth/password")
  public ResponseEntity<?> changeOwnPassword(Authentication authentication, @RequestBody Map<String,String> input,
      jakarta.servlet.http.HttpServletRequest request, jakarta.servlet.http.HttpServletResponse response) {
    if (!(authentication.getPrincipal() instanceof AccountPrincipal principal))
      return ResponseEntity.status(401).build();
    var permit = loginSecurity.reservePasswordChange(principal.getUsername(), request.getRemoteAddr());
    if (!permit.allowed()) return ResponseEntity.status(429).header("Retry-After",Long.toString(permit.retrySeconds()))
        .body(Map.of("error","Şifre değiştirme sınırına ulaşıldı. " + permit.retrySeconds() + " saniye sonra yeniden deneyin."));
    try { accounts.changeOwnPassword(principal,input); }
    catch (IllegalArgumentException | IllegalStateException error) {
      loginSecurity.passwordChangeFailure(principal.getUsername(),request.getRemoteAddr());
      throw error;
    }
    new org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler().logout(request,response,authentication);
    return ResponseEntity.noContent().build();
  }
  @PostMapping("/admin/users") public ResponseEntity<?> addUser(@RequestBody Map<String, String> input) {
    return ResponseEntity.status(201).body(accounts.createUser(input));
  }

  public record AccountStatus(Boolean active) {}
  @PutMapping("/admin/users/{username}/status")
  public ResponseEntity<Void> status(@PathVariable String username, @RequestBody AccountStatus input) {
    accounts.setActive(username, input.active());
    return ResponseEntity.noContent().build();
  }
  @PostMapping("/admin/users/{username}/password")
  public ResponseEntity<Void> resetPassword(@PathVariable String username, @RequestBody Map<String, String> input) {
    accounts.resetPassword(username, input);
    return ResponseEntity.noContent().build();
  }
  @GetMapping("/admin/account-events") public Object accountEvents() { return accounts.events(); }
  @GetMapping("/admin/login-events") public Object loginEvents() { return loginSecurity.events(); }
}
