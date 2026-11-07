-- X-Small joins the size scale so the team can separate configuration-level work from a real Small.
ALTER TABLE backlog_item DROP CONSTRAINT chk_backlog_size;
ALTER TABLE backlog_item ADD CONSTRAINT chk_backlog_size CHECK (size_code IS NULL OR size_code IN ('X-SMALL','SMALL','MEDIUM','LARGE','X-LARGE'));
ALTER TABLE sprint_task DROP CONSTRAINT chk_task_size;
ALTER TABLE sprint_task ADD CONSTRAINT chk_task_size CHECK (size_code IS NULL OR size_code IN ('X-SMALL','SMALL','MEDIUM','LARGE','X-LARGE'));

-- Stored Jira defaults win over the built-in ones, so an untouched config would keep the old
-- one-step-too-low point scale. Only the pristine default block is rewritten; an edited config is left alone.
UPDATE jira_config SET field_defaults = REPLACE(field_defaults,
  '"sizePoints":{"SMALL":1,"MEDIUM":3,"LARGE":5,"X-LARGE":8}',
  '"sizePoints":{"X-SMALL":1,"SMALL":3,"MEDIUM":5,"LARGE":8,"X-LARGE":13}')
WHERE field_defaults LIKE '%"sizePoints":{"SMALL":1,"MEDIUM":3,"LARGE":5,"X-LARGE":8}%';

UPDATE jira_config SET field_defaults = REPLACE(field_defaults,
  '"businessValueByPriority":{"CRITICAL":"30013","HIGH":"30013","NORMAL":"30013","LOW":"30013","UNSET":"30013"}',
  '"businessValueBySize":{"X-SMALL":"30013","SMALL":"30013","MEDIUM":"30013","LARGE":"30013","X-LARGE":"30013","UNSET":"30013"}')
WHERE field_defaults LIKE '%"businessValueByPriority"%';
