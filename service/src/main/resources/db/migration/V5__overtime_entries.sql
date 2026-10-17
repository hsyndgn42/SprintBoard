CREATE TABLE overtime_entry (
  id VARCHAR(100) PRIMARY KEY,
  member_id VARCHAR(100) NOT NULL REFERENCES member(id),
  sprint_id VARCHAR(100) NOT NULL REFERENCES sprint(id),
  earned_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  used_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  planned_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  include_in_capacity BOOLEAN NOT NULL DEFAULT FALSE,
  note VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX idx_overtime_entry_sprint ON overtime_entry(sprint_id,member_id);
