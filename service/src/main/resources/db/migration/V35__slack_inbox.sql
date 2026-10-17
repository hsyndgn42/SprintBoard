-- Local integration state is excluded from portable product JSON backups, like accounts.
CREATE TABLE slack_config (
 id INT PRIMARY KEY CHECK(id=1), team_id VARCHAR(40) NOT NULL, channel_id VARCHAR(40) NOT NULL,
 template CLOB NOT NULL, bot_secret VARCHAR(4096) NOT NULL DEFAULT '', app_secret VARCHAR(4096) NOT NULL DEFAULT '',
 enabled BOOLEAN NOT NULL DEFAULT FALSE, version INT NOT NULL DEFAULT 0
);
CREATE TABLE slack_inbox (
 id VARCHAR(100) PRIMARY KEY, source_key VARCHAR(150) NOT NULL UNIQUE,
 team_id VARCHAR(40) NOT NULL, channel_id VARCHAR(40) NOT NULL, message_ts VARCHAR(40) NOT NULL,
 user_id VARCHAR(40) NOT NULL, source_url VARCHAR(300) NOT NULL, raw_text CLOB NOT NULL,
 parsed_json CLOB NOT NULL, config_version INT NOT NULL, received_at VARCHAR(40) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING','INVALID','APPROVED','REJECTED')),
 decided_at VARCHAR(40), decided_by VARCHAR(100), decision_note VARCHAR(1000) NOT NULL DEFAULT '',
 backlog_id VARCHAR(100), task_id VARCHAR(100), sprint_id VARCHAR(100)
);
CREATE INDEX idx_slack_inbox_status ON slack_inbox(status,received_at);
