-- Account linkage remains local security configuration, not part of portable product backups.
ALTER TABLE app_user ADD COLUMN member_id VARCHAR(100);
CREATE UNIQUE INDEX uq_account_member ON app_user(member_id);

-- Task identity/title snapshots deliberately survive task removal from a sprint.
CREATE TABLE task_activity (
 id VARCHAR(100) PRIMARY KEY,
 sprint_id VARCHAR(100) NOT NULL REFERENCES sprint(id),
 task_id VARCHAR(100) NOT NULL,
 task_title VARCHAR(300) NOT NULL,
 actor VARCHAR(80) NOT NULL,
 member_name VARCHAR(150) NOT NULL,
 entry_date DATE NOT NULL,
 occurred_at VARCHAR(40) NOT NULL,
 kind VARCHAR(60) NOT NULL,
 message VARCHAR(2000) NOT NULL,
 detail_json CLOB NOT NULL
);
CREATE INDEX idx_task_activity_sprint ON task_activity(sprint_id,entry_date,occurred_at);

CREATE TABLE overtime_request (
 id VARCHAR(100) PRIMARY KEY,
 member_id VARCHAR(100) NOT NULL REFERENCES member(id),
 sprint_id VARCHAR(100) NOT NULL REFERENCES sprint(id),
 requester VARCHAR(80) NOT NULL,
 work_date DATE NOT NULL,
 hours DOUBLE PRECISION NOT NULL CHECK(hours>0 AND hours<=24),
 reason VARCHAR(1000) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 created_at VARCHAR(40) NOT NULL,
 decided_at VARCHAR(40),
 decided_by VARCHAR(80),
 decision_note VARCHAR(1000) NOT NULL DEFAULT '',
 entry_id VARCHAR(100) UNIQUE REFERENCES overtime_entry(id)
);
CREATE INDEX idx_overtime_request_member ON overtime_request(member_id,status);
