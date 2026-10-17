ALTER TABLE roadmap_item ADD COLUMN priority VARCHAR(20) NOT NULL DEFAULT 'UNSET';
ALTER TABLE roadmap_item ADD CONSTRAINT roadmap_priority_check CHECK (priority IN ('UNSET','LOW','NORMAL','HIGH','CRITICAL'));
ALTER TABLE roadmap_item ADD CONSTRAINT roadmap_status_check CHECK (status IN ('planned','active','on_hold','completed'));
