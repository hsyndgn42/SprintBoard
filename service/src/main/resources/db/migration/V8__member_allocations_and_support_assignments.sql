ALTER TABLE assignment ADD COLUMN support_only BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE sprint_member_allocation (
  sprint_id VARCHAR(100) NOT NULL REFERENCES sprint(id),
  member_id VARCHAR(100) NOT NULL REFERENCES member(id),
  allocated_days DOUBLE PRECISION NOT NULL CHECK (allocated_days >= 0),
  PRIMARY KEY (sprint_id, member_id)
);
