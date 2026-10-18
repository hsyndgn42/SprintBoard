-- Operational outbox: kept in full DB backups, not portable business-data JSON exports.
CREATE TABLE slack_receipt_reaction (
 source_key VARCHAR(160) PRIMARY KEY,
 team_id VARCHAR(40) NOT NULL, channel_id VARCHAR(40) NOT NULL, message_ts VARCHAR(40) NOT NULL,
 state VARCHAR(12) NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt BIGINT NOT NULL DEFAULT 0, created_at VARCHAR(40) NOT NULL,
 sent_at VARCHAR(40), last_error VARCHAR(500) NOT NULL DEFAULT ''
);
CREATE INDEX slack_receipt_pending ON slack_receipt_reaction(state, next_attempt);
