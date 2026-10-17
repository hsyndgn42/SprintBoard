CREATE TABLE task_subtype (
 code VARCHAR(32) PRIMARY KEY,
 category VARCHAR(24) NOT NULL CHECK(category IN ('DEV','DESIGN','ANALYZE','TEST','DEFECT','BAU','OTHER')),
 label VARCHAR(80) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 system_type BOOLEAN NOT NULL DEFAULT FALSE,
 UNIQUE(category,code), UNIQUE(category,label)
);
INSERT INTO task_subtype(code,category,label,system_type) VALUES
('FUNCTIONAL_TEST','TEST','Fonksiyonel Test',TRUE),('E2E_TEST','TEST','E2E Test',TRUE),
('REGRESSION_TEST','TEST','Regresyon Testi',TRUE),('PERFORMANCE_TEST','TEST','Performance Test',TRUE),('GENERAL_TEST','TEST','Genel Test',TRUE),
('TEST_DEFECT','DEFECT','Test Defect',TRUE),('PROD_DEFECT','DEFECT','Prod Defect',TRUE),
('SUPPORT','BAU','Support',TRUE),('MEETING','BAU','Meeting',TRUE),('TRAINING','BAU','Training',TRUE),('LEAVE','BAU','Leave',TRUE),('OTHER_BAU','BAU','Diğer BAU',TRUE);
ALTER TABLE backlog_item DROP CONSTRAINT chk_backlog_task_subtype;
ALTER TABLE sprint_task DROP CONSTRAINT chk_sprint_task_subtype;
ALTER TABLE backlog_item DROP CONSTRAINT chk_backlog_taxonomy_pair;
ALTER TABLE sprint_task DROP CONSTRAINT chk_sprint_taxonomy_pair;
ALTER TABLE backlog_item ADD CONSTRAINT chk_backlog_subtype_required CHECK(task_category NOT IN ('TEST','DEFECT','BAU') OR task_subtype IS NOT NULL);
ALTER TABLE sprint_task ADD CONSTRAINT chk_task_subtype_required CHECK(task_category NOT IN ('TEST','DEFECT','BAU') OR task_subtype IS NOT NULL);
ALTER TABLE backlog_item ADD CONSTRAINT fk_backlog_subtype FOREIGN KEY(task_category,task_subtype) REFERENCES task_subtype(category,code);
ALTER TABLE sprint_task ADD CONSTRAINT fk_task_subtype FOREIGN KEY(task_category,task_subtype) REFERENCES task_subtype(category,code);
