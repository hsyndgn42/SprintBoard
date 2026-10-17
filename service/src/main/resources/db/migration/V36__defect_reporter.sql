-- Reporter is the Slack sender, never the administrator approving intake.
ALTER TABLE defect_detail ADD COLUMN reporter_id VARCHAR(100);
ALTER TABLE defect_detail ADD COLUMN reporter_team_id VARCHAR(40);
ALTER TABLE defect_detail ADD COLUMN source_url VARCHAR(300);
UPDATE defect_detail d SET reporter_id=(SELECT i.user_id FROM slack_inbox i WHERE i.backlog_id=d.backlog_id AND i.status='APPROVED' ORDER BY i.received_at LIMIT 1),
 reporter_team_id=(SELECT i.team_id FROM slack_inbox i WHERE i.backlog_id=d.backlog_id AND i.status='APPROVED' ORDER BY i.received_at LIMIT 1),
 source_url=(SELECT i.source_url FROM slack_inbox i WHERE i.backlog_id=d.backlog_id AND i.status='APPROVED' ORDER BY i.received_at LIMIT 1)
WHERE EXISTS(SELECT 1 FROM slack_inbox i WHERE i.backlog_id=d.backlog_id AND i.status='APPROVED');
