-- Historical overtime has no known task allocation; never guess one.
ALTER TABLE overtime_entry ADD COLUMN task_id VARCHAR(100);
ALTER TABLE overtime_entry ADD COLUMN task_title VARCHAR(500);
ALTER TABLE overtime_entry ADD COLUMN roadmap_id VARCHAR(100);
ALTER TABLE overtime_entry ADD COLUMN roadmap_title VARCHAR(500);
ALTER TABLE overtime_request ADD COLUMN task_id VARCHAR(100);
ALTER TABLE overtime_request ADD COLUMN task_title VARCHAR(500);
