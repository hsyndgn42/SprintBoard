ALTER TABLE backlog_item ADD COLUMN task_category VARCHAR(24);
ALTER TABLE backlog_item ADD COLUMN task_subtype VARCHAR(32);
ALTER TABLE sprint_task ADD COLUMN task_category VARCHAR(24);
ALTER TABLE sprint_task ADD COLUMN task_subtype VARCHAR(32);

ALTER TABLE backlog_item ADD CONSTRAINT chk_backlog_task_category CHECK (task_category IS NULL OR task_category IN ('DEV','DESIGN','ANALYZE','TEST','DEFECT','BAU','OTHER'));
ALTER TABLE sprint_task ADD CONSTRAINT chk_sprint_task_category CHECK (task_category IS NULL OR task_category IN ('DEV','DESIGN','ANALYZE','TEST','DEFECT','BAU','OTHER'));
ALTER TABLE backlog_item ADD CONSTRAINT chk_backlog_task_subtype CHECK (task_subtype IS NULL OR task_subtype IN ('SUPPORT','MEETING','TRAINING','LEAVE','OTHER_BAU','FUNCTIONAL_TEST','E2E_TEST','REGRESSION_TEST','PERFORMANCE_TEST','GENERAL_TEST','TEST_DEFECT','PROD_DEFECT'));
ALTER TABLE sprint_task ADD CONSTRAINT chk_sprint_task_subtype CHECK (task_subtype IS NULL OR task_subtype IN ('SUPPORT','MEETING','TRAINING','LEAVE','OTHER_BAU','FUNCTIONAL_TEST','E2E_TEST','REGRESSION_TEST','PERFORMANCE_TEST','GENERAL_TEST','TEST_DEFECT','PROD_DEFECT'));

UPDATE backlog_item SET task_category=CASE
  WHEN type='BAU' OR work_kind IN ('SUPPORT','MEETING','TRAINING','LEAVE') THEN 'BAU'
  WHEN work_kind='DEVELOPMENT' THEN 'DEV'
  WHEN work_kind='DESIGN' THEN 'DESIGN'
  WHEN work_kind='ANALYSIS' THEN 'ANALYZE'
  WHEN work_kind='TEST' THEN 'TEST'
  ELSE 'OTHER'
END;
UPDATE sprint_task SET task_category=CASE
  WHEN type='BAU' OR work_kind IN ('SUPPORT','MEETING','TRAINING','LEAVE') THEN 'BAU'
  WHEN work_kind='DEVELOPMENT' THEN 'DEV'
  WHEN work_kind='DESIGN' THEN 'DESIGN'
  WHEN work_kind='ANALYSIS' THEN 'ANALYZE'
  WHEN work_kind='TEST' THEN 'TEST'
  ELSE 'OTHER'
END;

UPDATE backlog_item SET task_subtype=CASE
  WHEN task_category='BAU' AND work_kind='SUPPORT' THEN 'SUPPORT'
  WHEN task_category='BAU' AND work_kind='MEETING' THEN 'MEETING'
  WHEN task_category='BAU' AND work_kind='TRAINING' THEN 'TRAINING'
  WHEN task_category='BAU' AND work_kind='LEAVE' THEN 'LEAVE'
  WHEN task_category='BAU' THEN 'OTHER_BAU'
  WHEN task_category='TEST' AND UPPER(title) LIKE '%E2E%' THEN 'E2E_TEST'
  WHEN task_category='TEST' AND (UPPER(title) LIKE '%REGRESSION%' OR UPPER(title) LIKE '%REGRESYON%') THEN 'REGRESSION_TEST'
  WHEN task_category='TEST' AND UPPER(title) LIKE '%PERFORMANCE%' THEN 'PERFORMANCE_TEST'
  WHEN task_category='TEST' AND (UPPER(title) LIKE '%FUNCTIONAL%' OR UPPER(title) LIKE '%FONKSIYON%') THEN 'FUNCTIONAL_TEST'
  WHEN task_category='TEST' THEN 'GENERAL_TEST'
  ELSE NULL
END;
UPDATE sprint_task SET task_subtype=CASE
  WHEN task_category='BAU' AND work_kind='SUPPORT' THEN 'SUPPORT'
  WHEN task_category='BAU' AND work_kind='MEETING' THEN 'MEETING'
  WHEN task_category='BAU' AND work_kind='TRAINING' THEN 'TRAINING'
  WHEN task_category='BAU' AND work_kind='LEAVE' THEN 'LEAVE'
  WHEN task_category='BAU' THEN 'OTHER_BAU'
  WHEN task_category='TEST' AND UPPER(title) LIKE '%E2E%' THEN 'E2E_TEST'
  WHEN task_category='TEST' AND (UPPER(title) LIKE '%REGRESSION%' OR UPPER(title) LIKE '%REGRESYON%') THEN 'REGRESSION_TEST'
  WHEN task_category='TEST' AND UPPER(title) LIKE '%PERFORMANCE%' THEN 'PERFORMANCE_TEST'
  WHEN task_category='TEST' AND (UPPER(title) LIKE '%FUNCTIONAL%' OR UPPER(title) LIKE '%FONKSIYON%') THEN 'FUNCTIONAL_TEST'
  WHEN task_category='TEST' THEN 'GENERAL_TEST'
  ELSE NULL
END;

ALTER TABLE backlog_item ALTER COLUMN task_category SET NOT NULL;
ALTER TABLE sprint_task ALTER COLUMN task_category SET NOT NULL;
ALTER TABLE backlog_item ADD CONSTRAINT chk_backlog_taxonomy_pair CHECK (
  (task_category='TEST' AND task_subtype IN ('FUNCTIONAL_TEST','E2E_TEST','REGRESSION_TEST','PERFORMANCE_TEST','GENERAL_TEST')) OR
  (task_category='DEFECT' AND task_subtype IN ('TEST_DEFECT','PROD_DEFECT')) OR
  (task_category='BAU' AND task_subtype IN ('SUPPORT','MEETING','TRAINING','LEAVE','OTHER_BAU')) OR
  (task_category IN ('DEV','DESIGN','ANALYZE','OTHER') AND task_subtype IS NULL)
);
ALTER TABLE sprint_task ADD CONSTRAINT chk_sprint_taxonomy_pair CHECK (
  (task_category='TEST' AND task_subtype IN ('FUNCTIONAL_TEST','E2E_TEST','REGRESSION_TEST','PERFORMANCE_TEST','GENERAL_TEST')) OR
  (task_category='DEFECT' AND task_subtype IN ('TEST_DEFECT','PROD_DEFECT')) OR
  (task_category='BAU' AND task_subtype IN ('SUPPORT','MEETING','TRAINING','LEAVE','OTHER_BAU')) OR
  (task_category IN ('DEV','DESIGN','ANALYZE','OTHER') AND task_subtype IS NULL)
);
CREATE INDEX idx_backlog_task_taxonomy ON backlog_item(task_category,task_subtype);
CREATE INDEX idx_sprint_task_taxonomy ON sprint_task(task_category,task_subtype);
