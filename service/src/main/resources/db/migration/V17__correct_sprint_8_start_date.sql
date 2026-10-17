-- Product owner confirmed the PDF month typo on 2026-09-16.
-- Correct only the original imported interval; never overwrite a later manual correction.
-- BAU one-day holiday exceptions, assignments, leave and overtime are deliberately unchanged.
INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json)
SELECT CURRENT_TIMESTAMP,'sprint',id,'source-date-corrected',
  '{"previousStart":"2026-03-14","start":"2026-04-14","end":"2026-05-04","reason":"Product owner confirmed source month typo"}'
FROM sprint
WHERE id='legacy-sprint-08' AND number=8
  AND start_date=DATE '2026-03-14' AND end_date=DATE '2026-05-04'
  AND NOT EXISTS (SELECT 1 FROM sprint_closure WHERE sprint_id=sprint.id);

UPDATE sprint SET start_date=DATE '2026-04-14'
WHERE id='legacy-sprint-08' AND number=8
  AND start_date=DATE '2026-03-14' AND end_date=DATE '2026-05-04'
  AND NOT EXISTS (SELECT 1 FROM sprint_closure WHERE sprint_id=sprint.id);
