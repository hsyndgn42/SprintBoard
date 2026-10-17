-- Preserve unknown historical classifications; never charge imported leave automatically.
ALTER TABLE leave_record ADD COLUMN leave_kind VARCHAR(30) NOT NULL DEFAULT 'UNSPECIFIED';
UPDATE leave_record SET leave_kind=leave_type;
ALTER TABLE leave_record DROP COLUMN leave_type;
ALTER TABLE leave_record RENAME COLUMN leave_kind TO leave_type;
ALTER TABLE leave_record ADD CONSTRAINT ck_leave_kind CHECK (leave_type IN ('UNSPECIFIED','COMPANY_GRANTED','ANNUAL','OVERTIME'));
ALTER TABLE leave_record ADD COLUMN overtime_hours DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE leave_record ADD COLUMN overtime_accounting VARCHAR(20) NOT NULL DEFAULT 'NONE';
ALTER TABLE leave_record ADD CONSTRAINT ck_leave_entitlement CHECK (
 (leave_type='OVERTIME' AND overtime_hours>0 AND overtime_accounting IN ('DEBIT','IN_SNAPSHOT')) OR
 (leave_type<>'OVERTIME' AND overtime_hours=0 AND overtime_accounting='NONE'));
