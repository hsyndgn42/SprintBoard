package com.sprintboard;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Durable limiter for the supported single-instance, single-writer deployment. */
@Service
public class LoginSecurityService {
  public record Permit(boolean allowed, long retrySeconds, String accountKey, long expiresAt, long revision) {}
  private record Bucket(String key, int count, long expiresAt, long revision, boolean logged) {}
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final TransactionTemplate transactions;
  private final Clock clock;
  private final int accountLimit, sourceLimit;
  private final long windowMillis;

  public LoginSecurityService(JdbcTemplate jdbc, ObjectMapper mapper, PlatformTransactionManager manager, Clock clock,
      @Value("${sprintboard.security.login.account-limit:5}") int accountLimit,
      @Value("${sprintboard.security.login.source-limit:30}") int sourceLimit,
      @Value("${sprintboard.security.login.window-seconds:900}") long windowSeconds) {
    if (accountLimit < 1 || sourceLimit < accountLimit || windowSeconds < 1 || windowSeconds > 86400)
      throw new IllegalArgumentException("Giriş sınırları geçersiz.");
    this.jdbc=jdbc; this.mapper=mapper; this.transactions=new TransactionTemplate(manager); this.clock=clock;
    this.accountLimit=accountLimit; this.sourceLimit=sourceLimit; this.windowMillis=windowSeconds*1000;
  }

  static String normalized(String value) { return value == null ? "" : value.trim().toLowerCase(Locale.ROOT); }
  static String hash(String value) {
    try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
    catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
  }
  private Bucket bucket(String key, long now) {
    var rows = jdbc.query("SELECT * FROM login_throttle WHERE bucket_key=? FOR UPDATE",
        (rs,row)->new Bucket(key,rs.getInt("attempt_count"),rs.getLong("expires_at"),rs.getLong("revision"),rs.getBoolean("blocked_logged")), key);
    if (!rows.isEmpty()) return rows.getFirst();
    jdbc.update("INSERT INTO login_throttle(bucket_key,attempt_count,expires_at,revision) VALUES(?,0,?,0)",key,now+windowMillis);
    return new Bucket(key,0,now+windowMillis,0,false);
  }
  private Permit reject(Bucket bucket, String username, String source, long now) {
    if (!bucket.logged()) {
      jdbc.update("UPDATE login_throttle SET blocked_logged=TRUE WHERE bucket_key=?",bucket.key());
      audit(username, source, "LOGIN_BLOCKED");
    }
    return new Permit(false,Math.max(1,(bucket.expiresAt()-now+999)/1000),null,0,0);
  }

  // The monitor encloses transaction commit, so concurrent requests cannot reserve the same slot.
  public synchronized Permit reserve(String username, String source) {
    return transactions.execute(status -> {
      long now=clock.millis();
      jdbc.update("DELETE FROM login_throttle WHERE expires_at<=?",now);
      Bucket origin=bucket("S:"+hash(source),now);
      if (origin.count()>=sourceLimit) return reject(origin,username,source,now);
      // Even account-blocked requests consume the source budget; rotating names does not evade it.
      jdbc.update("UPDATE login_throttle SET attempt_count=attempt_count+1,revision=revision+1 WHERE bucket_key=?",origin.key());
      Bucket account=bucket("A:"+hash(normalized(username)),now);
      if (account.count()>=accountLimit) return reject(account,username,source,now);
      jdbc.update("UPDATE login_throttle SET attempt_count=attempt_count+1,revision=revision+1 WHERE bucket_key=?",account.key());
      return new Permit(true,0,account.key(),account.expiresAt(),account.revision()+1);
    });
  }

  public synchronized void success(Permit permit, String username, String source) {
    transactions.executeWithoutResult(status -> {
      if (permit != null) {
        // A late success must not erase attempts reserved after it or a newer window.
        jdbc.update("DELETE FROM login_throttle WHERE bucket_key=? AND expires_at=? AND revision=?",
            permit.accountKey(),permit.expiresAt(),permit.revision());
      }
      audit(username,source,"LOGIN_SUCCESS");
    });
  }
  public synchronized void failure(String username, String source) {
    transactions.executeWithoutResult(status -> audit(username,source,"LOGIN_FAILURE"));
  }

  // Separate budget: a successful login cannot erase current-password guesses from a stolen session.
  public synchronized Permit reservePasswordChange(String username, String source) {
    return transactions.execute(status -> {
      long now=clock.millis();
      jdbc.update("DELETE FROM login_throttle WHERE expires_at<=?",now);
      Bucket account=bucket("P:"+hash(normalized(username)),now);
      if (account.count()>=accountLimit) {
        if (!account.logged()) {
          jdbc.update("UPDATE login_throttle SET blocked_logged=TRUE WHERE bucket_key=?",account.key());
          audit(username,source,"PASSWORD_CHANGE_BLOCKED");
        }
        return new Permit(false,Math.max(1,(account.expiresAt()-now+999)/1000),null,0,0);
      }
      jdbc.update("UPDATE login_throttle SET attempt_count=attempt_count+1,revision=revision+1 WHERE bucket_key=?",account.key());
      return new Permit(true,0,account.key(),account.expiresAt(),account.revision()+1);
    });
  }

  public synchronized void passwordChangeFailure(String username, String source) {
    transactions.executeWithoutResult(status -> audit(username,source,"PASSWORD_CHANGE_FAILURE"));
  }

  private void audit(String username, String source, String action) {
    String safeName=normalized(username);
    if (!safeName.matches("[a-z0-9._-]{3,80}")) safeName="(geçersiz kullanıcı adı)";
    try {
      jdbc.update("INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json) VALUES(?,'authentication',?,?,?)",
          java.sql.Timestamp.from(clock.instant()), safeName, action,
          mapper.writeValueAsString(Map.of("sourceId",hash(source).substring(0,16))));
      // Bound storage independently of the number of unknown usernames or source addresses.
      jdbc.update("DELETE FROM audit_event WHERE entity_type='authentication' AND occurred_at<?",
          java.sql.Timestamp.from(clock.instant().minusSeconds(30L*86400)));
      jdbc.update("DELETE FROM audit_event WHERE entity_type='authentication' AND id NOT IN (SELECT id FROM audit_event WHERE entity_type='authentication' ORDER BY id DESC FETCH FIRST 2000 ROWS ONLY)");
    } catch (JsonProcessingException e) { throw new IllegalStateException("Giriş işlem kaydı oluşturulamadı."); }
  }

  public List<Map<String,Object>> events() {
    return jdbc.query("SELECT id,occurred_at,entity_id,action,detail_json FROM audit_event WHERE entity_type='authentication' AND occurred_at>=? ORDER BY id DESC LIMIT 100",
        (rs,row)-> {
          String source;
          try { source=mapper.readTree(rs.getString("detail_json")).path("sourceId").asText(); }
          catch(JsonProcessingException e) { source="Bilinmiyor"; }
          return Map.of("id",rs.getLong("id"),"occurredAt",rs.getTimestamp("occurred_at").toInstant().toString(),
              "username",rs.getString("entity_id"),"action",rs.getString("action"),"sourceId",source);
        },java.sql.Timestamp.from(clock.instant().minusSeconds(30L*86400)));
  }
}
