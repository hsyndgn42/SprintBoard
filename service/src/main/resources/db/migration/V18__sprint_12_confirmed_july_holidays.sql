-- Sprint 12 PDF lists three shared July holidays. The owner confirmed July 15-17, 2026.
-- These are shared non-working days, not personal leave or BAU effort.
-- Existing global holiday entries and personal calendar entries are preserved.
INSERT INTO non_working_day(id,day_date,title,member_id)
SELECT d.id,d.day_date,'Temmuz Tatili',NULL
FROM (VALUES
  ('legacy-holiday-20260715',DATE '2026-07-15'),
  ('legacy-holiday-20260716',DATE '2026-07-16'),
  ('legacy-holiday-20260717',DATE '2026-07-17')
) d(id,day_date)
WHERE EXISTS (SELECT 1 FROM sprint WHERE id='legacy-sprint-12' AND number=12)
  AND NOT EXISTS (SELECT 1 FROM non_working_day n WHERE n.day_date=d.day_date AND n.member_id IS NULL)
  AND NOT EXISTS (SELECT 1 FROM non_working_day n WHERE n.id=d.id);

INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json)
SELECT CURRENT_TIMESTAMP,'calendar',n.id,'confirmed-holiday-imported',
  '{"source":"Sprint 12 PDF; dates confirmed by product owner","shared":true}'
FROM non_working_day n
WHERE n.id IN ('legacy-holiday-20260715','legacy-holiday-20260716','legacy-holiday-20260717')
  AND NOT EXISTS (SELECT 1 FROM audit_event a WHERE a.entity_id=n.id AND a.action='confirmed-holiday-imported');
