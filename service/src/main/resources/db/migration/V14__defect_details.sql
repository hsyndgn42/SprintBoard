CREATE TABLE defect_detail (
  backlog_id VARCHAR(100) PRIMARY KEY REFERENCES backlog_item(id),
  severity VARCHAR(20) NOT NULL DEFAULT 'UNSET' CHECK(severity IN ('UNSET','CRITICAL','HIGH','MEDIUM','LOW')),
  environment VARCHAR(20) NOT NULL DEFAULT 'UNSET' CHECK(environment IN ('UNSET','DEV','SIT','UAT','PREPROD','PROD','OTHER')),
  related_id VARCHAR(100) REFERENCES backlog_item(id),
  verification VARCHAR(20) NOT NULL DEFAULT 'NOT_CHECKED' CHECK(verification IN ('NOT_CHECKED','PENDING','PASSED','FAILED')),
  verifier_id VARCHAR(100) REFERENCES member(id),
  verification_note VARCHAR(2000) NOT NULL DEFAULT '',
  verified_at VARCHAR(40),
  CHECK(related_id IS NULL OR related_id <> backlog_id)
);
