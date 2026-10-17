CREATE TABLE bau_template (
  id VARCHAR(80) PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  work_kind VARCHAR(40) NOT NULL,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('CORE', 'MANUAL', 'LEAVE')),
  days_per_member DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (days_per_member >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL
);

INSERT INTO bau_template(id,title,work_kind,mode,days_per_member,active,sort_order) VALUES
  ('bau-leave','On Leave','LEAVE','LEAVE',0,TRUE,10),
  ('bau-meeting','Team Meeting','MEETING','CORE',2,TRUE,20),
  ('bau-support','Team Support','SUPPORT','CORE',2,TRUE,30),
  ('bau-training','Training','TRAINING','MANUAL',0,TRUE,40);
