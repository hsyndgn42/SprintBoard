-- Local Slack state remains outside portable product backups.
ALTER TABLE slack_config ADD COLUMN overtime_channel_id VARCHAR(40) NOT NULL DEFAULT '';
CREATE TABLE slack_member_link (
 team_id VARCHAR(40) NOT NULL, user_id VARCHAR(40) NOT NULL,
 member_id VARCHAR(100) NOT NULL, updated_by VARCHAR(100) NOT NULL,
 PRIMARY KEY(team_id,user_id)
);
CREATE TABLE slack_overtime_inbox (
 id VARCHAR(100) PRIMARY KEY, source_key VARCHAR(150) NOT NULL UNIQUE,
 team_id VARCHAR(40) NOT NULL, channel_id VARCHAR(40) NOT NULL, message_ts VARCHAR(40) NOT NULL,
 user_id VARCHAR(40) NOT NULL, reporter_name VARCHAR(300), source_url VARCHAR(300) NOT NULL,
 raw_text CLOB NOT NULL, parsed_json CLOB NOT NULL, config_version INT NOT NULL, received_at VARCHAR(40) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING','INVALID','APPROVED','REJECTED')),
 decided_at VARCHAR(40), decided_by VARCHAR(100), decision_note VARCHAR(1000) NOT NULL DEFAULT '',
 member_id VARCHAR(100), sprint_id VARCHAR(100), request_id VARCHAR(100)
);
CREATE INDEX idx_slack_overtime_status ON slack_overtime_inbox(status,received_at);
