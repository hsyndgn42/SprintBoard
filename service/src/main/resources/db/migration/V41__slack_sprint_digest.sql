CREATE TABLE slack_digest_config (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled BOOLEAN NOT NULL DEFAULT FALSE,
 channel_id VARCHAR(40) NOT NULL, send_time VARCHAR(5) NOT NULL DEFAULT '08:00',
 weekends BOOLEAN NOT NULL DEFAULT TRUE, version INTEGER NOT NULL DEFAULT 1
);
INSERT INTO slack_digest_config(id,channel_id) VALUES(1,'C0CA4QFAU49');
CREATE TABLE slack_digest_run (
 id VARCHAR(80) PRIMARY KEY, source VARCHAR(12) NOT NULL, sprint_id VARCHAR(160),
 sprint_name VARCHAR(300), channel_id VARCHAR(40) NOT NULL, team_id VARCHAR(40) NOT NULL,
 state VARCHAR(20) NOT NULL, created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL,
 actor VARCHAR(160) NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, message VARCHAR(500) NOT NULL DEFAULT ''
);
CREATE INDEX slack_digest_run_recent ON slack_digest_run(created_at);
