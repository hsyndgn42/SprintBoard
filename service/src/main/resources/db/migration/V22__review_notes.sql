CREATE TABLE sprint_review_note (
 sprint_id VARCHAR(100) PRIMARY KEY REFERENCES sprint(id),
 demo_notes VARCHAR(10000) NOT NULL DEFAULT '',
 stakeholder_feedback VARCHAR(10000) NOT NULL DEFAULT '',
 decisions VARCHAR(10000) NOT NULL DEFAULT '',
 next_steps VARCHAR(10000) NOT NULL DEFAULT '',
 version INTEGER NOT NULL CHECK(version > 0),
 updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
 updated_by VARCHAR(200) NOT NULL CHECK(CHAR_LENGTH(TRIM(updated_by)) > 0)
);
