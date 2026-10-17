CREATE TABLE sprint_flow (
 sprint_id VARCHAR(100) PRIMARY KEY REFERENCES sprint(id),
 origin VARCHAR(20) NOT NULL CHECK(origin IN ('START','OBSERVED')),
 tracked_at VARCHAR(40) NOT NULL,
 baseline_json CLOB NOT NULL,
 wip_limit INTEGER CHECK(wip_limit BETWEEN 1 AND 1000),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0)
);
CREATE TABLE task_blocker (
 task_id VARCHAR(100) PRIMARY KEY REFERENCES sprint_task(id),
 blocked BOOLEAN NOT NULL,
 reason VARCHAR(2000) NOT NULL,
 updated_at VARCHAR(40) NOT NULL,
 version INTEGER NOT NULL CHECK(version > 0)
);
CREATE TABLE sprint_scope_event (
 id VARCHAR(100) PRIMARY KEY,
 sprint_id VARCHAR(100) NOT NULL REFERENCES sprint_flow(sprint_id),
 sequence_no INTEGER NOT NULL CHECK(sequence_no > 0),
 action VARCHAR(10) NOT NULL CHECK(action IN ('ADDED','REMOVED')),
 occurred_at VARCHAR(40) NOT NULL,
 reason VARCHAR(2000) NOT NULL CHECK(CHAR_LENGTH(TRIM(reason)) > 0),
 task_json CLOB NOT NULL,
 UNIQUE(sprint_id,sequence_no)
);
