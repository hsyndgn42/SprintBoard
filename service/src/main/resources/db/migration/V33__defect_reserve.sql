INSERT INTO task_subtype(code,category,label,active,system_type) VALUES ('DEFECT_SUPPORT','BAU','Defect Support',true,true);
INSERT INTO bau_template(id,title,work_kind,mode,days_per_member,active,sort_order) VALUES ('bau-defect-support','Defect Support','DEFECT_SUPPORT','MANUAL',0,true,50);
CREATE TABLE defect_reserve_link (
 task_id VARCHAR(100) PRIMARY KEY REFERENCES sprint_task(id) ON DELETE CASCADE,
 reserve_task_id VARCHAR(100) NOT NULL REFERENCES sprint_task(id),
 CHECK(task_id<>reserve_task_id)
);
