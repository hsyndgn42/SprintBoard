package com.sprintboard;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService implements UserDetailsService {
  private final JdbcTemplate jdbc;
  private final PasswordEncoder encoder;
  private final ObjectMapper mapper;

  public AccountService(JdbcTemplate jdbc, PasswordEncoder encoder, ObjectMapper mapper) {
    this.jdbc = jdbc;
    this.encoder = encoder;
    this.mapper = mapper;
  }

  public boolean setupRequired() {
    return jdbc.queryForObject("SELECT COUNT(*) FROM app_user", Integer.class) == 0;
  }

  private String username(Map<String, String> input) {
    String value = java.util.Objects.toString(input.get("username"), "").trim().toLowerCase(Locale.ROOT);
    if (!value.matches("[a-z0-9._-]{3,80}"))
      throw new IllegalArgumentException("Kullanıcı adı 3–80 karakter olmalı; harf, rakam, nokta, tire ve alt çizgi kullanılabilir.");
    return value;
  }

  private String password(Map<String, String> input) {
    return PasswordPolicy.validate(input.get("password"));
  }

  @Transactional
  public void changeOwnPassword(AccountPrincipal principal, Map<String, String> input) {
    String next = password(input);
    if (!next.equals(input.get("confirmation"))) throw new IllegalArgumentException("Yeni şifreler eşleşmiyor.");
    String current = java.util.Objects.toString(input.get("currentPassword"), "");
    var rows = jdbc.query("SELECT password_hash,session_version,active FROM app_user WHERE username=? FOR UPDATE",
        (rs,row) -> new Object[]{rs.getString(1),rs.getLong(2),rs.getBoolean(3)}, principal.getUsername());
    if (rows.isEmpty() || !(boolean)rows.getFirst()[2] || (long)rows.getFirst()[1] != principal.sessionVersion())
      throw new IllegalStateException("Oturum geçersizleşti. Yeniden giriş yapın.");
    String hash = (String)rows.getFirst()[0];
    if (current.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72 || !encoder.matches(current, hash))
      throw new IllegalArgumentException("Mevcut şifre doğrulanamadı.");
    if (encoder.matches(next, hash)) throw new IllegalArgumentException("Yeni şifre mevcut şifreden farklı olmalı.");
    jdbc.update("UPDATE app_user SET password_hash=?,session_version=session_version+1 WHERE username=?", encoder.encode(next), principal.getUsername());
    audit(principal.getUsername(), "PASSWORD_CHANGED");
  }

  @Transactional
  public synchronized Map<String, Object> setupAdmin(Map<String, String> input) {
    if (!setupRequired()) throw new IllegalStateException("İlk yönetici zaten oluşturulmuş.");
    String name = username(input);
    jdbc.update("INSERT INTO app_user(username,password_hash,role) VALUES (?,?,?)", name, encoder.encode(password(input)), "ADMIN");
    audit(name, "ADMIN_CREATED");
    return Map.of("username", name, "role", "ADMIN");
  }

  @Transactional
  public Map<String, Object> createUser(Map<String, String> input) {
    String name = username(input);
    if (jdbc.queryForObject("SELECT COUNT(*) FROM app_user WHERE username=?", Integer.class, name) != 0)
      throw new IllegalArgumentException("Bu kullanıcı adı zaten var.");
    jdbc.update("INSERT INTO app_user(username,password_hash,role) VALUES (?,?,?)", name, encoder.encode(password(input)), "USER");
    audit(name, "USER_CREATED");
    return Map.of("username", name, "role", "USER", "active", true);
  }

  public List<Map<String, Object>> users() {
    return jdbc.query("SELECT username,role,active,created_at,member_id FROM app_user ORDER BY role,username",
        (rs, row) -> Map.of("username", rs.getString("username"), "role", rs.getString("role"),
            "memberId", java.util.Objects.toString(rs.getString("member_id"),""), "active", rs.getBoolean("active"), "createdAt", rs.getTimestamp("created_at").toInstant().toString()));
  }

  public boolean sessionValid(AccountPrincipal principal) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM app_user WHERE username=? AND active=TRUE AND session_version=?",
        Integer.class, principal.getUsername(), principal.sessionVersion()) == 1;
  }

  private void lockViewer(String name) {
    var roles = jdbc.queryForList("SELECT role FROM app_user WHERE username=? FOR UPDATE", String.class, name);
    if (roles.isEmpty()) throw new IllegalArgumentException("Kullanıcı bulunamadı.");
    if (!roles.getFirst().equals("USER"))
      throw new IllegalArgumentException("Yönetici hesabı bu işlemle değiştirilemez.");
  }

  @Transactional
  public void setActive(String name, Boolean active) {
    if (active == null) throw new IllegalArgumentException("Hesap durumu zorunlu.");
    lockViewer(name);
    int changed = jdbc.update("UPDATE app_user SET active=?,session_version=session_version+1 WHERE username=? AND active<>?", active, name, active);
    if (changed > 0) audit(name, active ? "USER_ENABLED" : "USER_DISABLED");
  }

  @Transactional
  public void resetPassword(String name, Map<String, String> input) {
    String encoded = encoder.encode(password(input));
    lockViewer(name);
    jdbc.update("UPDATE app_user SET password_hash=?,session_version=session_version+1 WHERE username=?", encoded, name);
    audit(name, "PASSWORD_RESET");
  }

  private void audit(String target, String action) {
    var auth = SecurityContextHolder.getContext().getAuthentication();
    String actor = auth == null || auth.getName().equals("anonymousUser") ? "initial-setup" : auth.getName();
    try {
      // Never serialize requests or password hashes into the audit trail.
      jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(CURRENT_TIMESTAMP,'account',?,?,?)",
          target, action, mapper.writeValueAsString(Map.of("actor", actor)));
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException("Hesap işlem kaydı oluşturulamadı.");
    }
  }

  public List<Map<String, Object>> events() {
    return jdbc.query("SELECT id,occurred_at,entity_id,action,detail_json FROM audit_event WHERE entity_type='account' ORDER BY id DESC LIMIT 100",
        (rs, row) -> {
          String actor;
          try { actor = mapper.readTree(rs.getString("detail_json")).path("actor").asText(); }
          catch (com.fasterxml.jackson.core.JsonProcessingException e) { actor = "Bilinmiyor"; }
          return Map.of("id", rs.getLong("id"), "occurredAt", rs.getTimestamp("occurred_at").toInstant().toString(),
              "username", rs.getString("entity_id"), "action", rs.getString("action"), "actor", actor);
        });
  }

  @Override
  public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
    String normalized = username.trim().toLowerCase(Locale.ROOT);
    List<UserDetails> users = jdbc.query("SELECT username,password_hash,role,active,session_version FROM app_user WHERE username=?",
        (rs, row) -> new AccountPrincipal(rs.getString("username"), rs.getString("password_hash"),
            rs.getString("role"), rs.getBoolean("active"), rs.getLong("session_version")), normalized);
    if (users.isEmpty()) throw new UsernameNotFoundException("Kullanıcı bulunamadı.");
    return users.getFirst();
  }
}
