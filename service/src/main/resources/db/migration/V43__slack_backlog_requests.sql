ALTER TABLE slack_config ADD COLUMN backlog_channel_id VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE slack_config ADD COLUMN backlog_template CLOB NOT NULL DEFAULT '';
-- Integration inbox is local operational state, included in full database backups.
CREATE TABLE slack_backlog_inbox (
 id VARCHAR(100) PRIMARY KEY, source_key VARCHAR(150) NOT NULL UNIQUE,
 team_id VARCHAR(40) NOT NULL, channel_id VARCHAR(40) NOT NULL, message_ts VARCHAR(40) NOT NULL,
 user_id VARCHAR(40) NOT NULL, reporter_name VARCHAR(300), source_url VARCHAR(300) NOT NULL,
 raw_text CLOB NOT NULL, parsed_json CLOB NOT NULL, config_version INT NOT NULL,
 received_at VARCHAR(40) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING','INVALID','APPROVED','REJECTED')),
 decided_at VARCHAR(40), decided_by VARCHAR(100), decision_note VARCHAR(1000) NOT NULL DEFAULT '',
 backlog_id VARCHAR(100)
);
CREATE INDEX slack_backlog_inbox_status ON slack_backlog_inbox(status,received_at);
