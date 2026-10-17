CREATE TABLE sprint_closure (
  sprint_id VARCHAR(100) PRIMARY KEY REFERENCES sprint(id),
  closed_at VARCHAR(40) NOT NULL,
  payload_json CLOB NOT NULL
);
