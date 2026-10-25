-- Jira integration: configuration, outbound issue links and inbound defect inbox.
CREATE TABLE jira_config (
 id INT PRIMARY KEY CHECK(id=1),
 base_url VARCHAR(300) NOT NULL DEFAULT '',
 project_key VARCHAR(40) NOT NULL DEFAULT '',
 board_id VARCHAR(40) NOT NULL DEFAULT '',
 pat_secret VARCHAR(4096) NOT NULL DEFAULT '',
 defect_jql CLOB NOT NULL,
 field_defaults CLOB NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 version INT NOT NULL DEFAULT 0
);

-- Keeps the numeric issue id as the durable identity; the key changes when an issue moves project.
CREATE TABLE jira_issue_link (
 id VARCHAR(100) PRIMARY KEY,
 local_kind VARCHAR(20) NOT NULL CHECK(local_kind IN ('backlog','roadmap')),
 local_id VARCHAR(100) NOT NULL,
 jira_issue_id BIGINT,
 jira_issue_key VARCHAR(40),
 state VARCHAR(20) NOT NULL CHECK(state IN ('PENDING','SENT','FAILED','BLOCKED')),
 attempts INT NOT NULL DEFAULT 0,
 last_error VARCHAR(1000) NOT NULL DEFAULT '',
 next_attempt_at VARCHAR(40),
 created_at VARCHAR(40) NOT NULL,
 updated_at VARCHAR(40) NOT NULL,
 CONSTRAINT uq_jira_issue_link UNIQUE(local_kind,local_id)
);
CREATE INDEX idx_jira_issue_link_state ON jira_issue_link(state,next_attempt_at);

CREATE TABLE jira_defect_inbox (
 id VARCHAR(100) PRIMARY KEY,
 jira_key VARCHAR(40) NOT NULL UNIQUE,
 jira_issue_id BIGINT NOT NULL,
 summary VARCHAR(500) NOT NULL,
 description CLOB NOT NULL,
 tc_task_id VARCHAR(60) NOT NULL DEFAULT '',
 case_found_in VARCHAR(80) NOT NULL DEFAULT '',
 jira_status VARCHAR(60) NOT NULL DEFAULT '',
 jira_priority VARCHAR(40) NOT NULL DEFAULT '',
 fetched_at VARCHAR(40) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 decided_at VARCHAR(40),
 decided_by VARCHAR(100),
 decision_note VARCHAR(1000) NOT NULL DEFAULT '',
 backlog_id VARCHAR(100)
);
CREATE INDEX idx_jira_defect_inbox_status ON jira_defect_inbox(status,fetched_at);

-- reference_id already carries an unrelated TC number, so the epic key needs its own column.
ALTER TABLE roadmap_item ADD COLUMN jira_epic_key VARCHAR(40);
