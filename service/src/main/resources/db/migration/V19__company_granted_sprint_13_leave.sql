-- Company-granted leave reduces capacity, never annual-leave or overtime entitlement.
-- Existing leave entitlement effects remain unspecified; do not reinterpret historical records.
ALTER TABLE leave_record ADD COLUMN leave_type VARCHAR(30) NOT NULL DEFAULT 'UNSPECIFIED'
  CHECK (leave_type IN ('UNSPECIFIED','COMPANY_GRANTED'));

-- Five days are marked for these seven people in the Sprint 13 source matrix.
-- Exact dates were not confirmed. Support-only Sakir and Ali Firat are not inferred participants.
INSERT INTO leave_record(id,member_id,sprint_id,days,precision_label,status,start_on,end_on,leave_type)
SELECT 'company-leave-13-' || m.id,m.id,'legacy-sprint-13',5,'sprint-level','used',NULL,NULL,'COMPANY_GRANTED'
FROM member m
WHERE m.id IN ('legacy-member-huseyin','legacy-member-elcim','legacy-member-isa','legacy-member-cemil',
  'legacy-member-umran','legacy-member-gorkem','legacy-member-akin')
  AND EXISTS (SELECT 1 FROM sprint WHERE id='legacy-sprint-13' AND number=13)
  AND NOT EXISTS (SELECT 1 FROM leave_record l WHERE l.member_id=m.id AND l.sprint_id='legacy-sprint-13' AND l.leave_type='COMPANY_GRANTED');

INSERT INTO audit_event(occurred_at,entity_type,entity_id,action,detail_json)
SELECT CURRENT_TIMESTAMP,'leave',id,'company-leave-confirmed',
  '{"sprint":"legacy-sprint-13","days":5,"entitlementEffect":"NONE","datePrecision":"sprint-level","source":"Owner confirmation of Sprint 13 matrix"}'
FROM leave_record WHERE id LIKE 'company-leave-13-%' AND leave_type='COMPANY_GRANTED';
