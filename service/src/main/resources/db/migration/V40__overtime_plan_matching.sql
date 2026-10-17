ALTER TABLE overtime_entry ADD COLUMN plan_classification VARCHAR(16) NOT NULL DEFAULT 'LEGACY';
ALTER TABLE overtime_entry ADD CONSTRAINT ck_overtime_classification CHECK (plan_classification IN ('LEGACY','UNPLANNED','PLANNED'));
CREATE TABLE overtime_plan_link (
  entry_id VARCHAR(100) PRIMARY KEY REFERENCES overtime_entry(id),
  plan_id VARCHAR(100) NOT NULL REFERENCES overtime_entry(id),
  CONSTRAINT ck_overtime_plan_distinct CHECK (entry_id <> plan_id)
);
CREATE INDEX ix_overtime_plan_link_plan ON overtime_plan_link(plan_id);
