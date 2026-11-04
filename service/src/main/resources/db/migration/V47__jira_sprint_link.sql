-- Starting a sprint here opens the matching sprint in Jira, so work that arrives
-- later already knows which sprint its PBI belongs to.
ALTER TABLE sprint ADD COLUMN jira_sprint_id BIGINT;
ALTER TABLE sprint ADD COLUMN jira_sprint_name VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE sprint ADD COLUMN jira_sprint_state VARCHAR(20);
ALTER TABLE sprint ADD COLUMN jira_sprint_error VARCHAR(1000) NOT NULL DEFAULT '';
ALTER TABLE sprint ADD COLUMN jira_sprint_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE sprint ADD COLUMN jira_sprint_retry_at VARCHAR(40);

-- Which PBIs already reached the Jira sprint. Without this a retry would resend
-- every key on the board each tick, and a task moved out of the sprint by hand
-- in Jira would be dragged back.
CREATE TABLE jira_sprint_issue (
 sprint_id VARCHAR(100) NOT NULL REFERENCES sprint(id),
 backlog_id VARCHAR(100) NOT NULL REFERENCES backlog_item(id),
 jira_issue_key VARCHAR(40) NOT NULL,
 placed_at VARCHAR(40) NOT NULL,
 PRIMARY KEY (sprint_id, backlog_id)
);
