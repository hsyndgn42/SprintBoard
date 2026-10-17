-- Security state is deliberately excluded from product JSON backup/restore.
CREATE TABLE login_throttle (
  bucket_key VARCHAR(66) PRIMARY KEY,
  attempt_count INT NOT NULL,
  expires_at BIGINT NOT NULL,
  revision BIGINT NOT NULL,
  blocked_logged BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_login_throttle_expiry ON login_throttle(expires_at);
