CREATE TABLE retro_action (
 id VARCHAR(100) PRIMARY KEY,
 sprint_id VARCHAR(100) NOT NULL REFERENCES sprint(id),
 title VARCHAR(300) NOT NULL CHECK(CHAR_LENGTH(TRIM(title)) > 0),
 description VARCHAR(10000) NOT NULL DEFAULT '',
 owner_id VARCHAR(100) REFERENCES member(id),
 due_date DATE,
 status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','DONE','CANCELLED')),
 backlog_id VARCHAR(100) REFERENCES backlog_item(id),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
 created_at TIMESTAMP WITH TIME ZONE NOT NULL,
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_retro_action_sprint ON retro_action(sprint_id,status);
