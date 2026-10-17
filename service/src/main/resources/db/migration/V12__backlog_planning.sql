ALTER TABLE backlog_item ADD COLUMN priority VARCHAR(16) NOT NULL DEFAULT 'UNSET';
ALTER TABLE backlog_item ADD CONSTRAINT chk_backlog_priority CHECK (priority IN ('UNSET','URGENT','HIGH','NORMAL','LOW'));
ALTER TABLE backlog_item ADD COLUMN owner_id VARCHAR(100) REFERENCES member(id);
CREATE TABLE backlog_dependency (
  backlog_id VARCHAR(100) NOT NULL REFERENCES backlog_item(id),
  depends_on_id VARCHAR(100) NOT NULL REFERENCES backlog_item(id),
  PRIMARY KEY (backlog_id, depends_on_id),
  CHECK (backlog_id <> depends_on_id)
);
CREATE INDEX idx_backlog_owner ON backlog_item(owner_id);
