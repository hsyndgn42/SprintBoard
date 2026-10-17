CREATE TABLE sprint_retro (
  sprint_id VARCHAR(100) PRIMARY KEY REFERENCES sprint(id),
  worked_well CLOB NOT NULL DEFAULT '',
  improve CLOB NOT NULL DEFAULT '',
  actions CLOB NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);
