ALTER TABLE leave_record ADD COLUMN start_on DATE;
ALTER TABLE leave_record ADD COLUMN end_on DATE;

CREATE TABLE non_working_day (
  id VARCHAR(100) PRIMARY KEY,
  day_date DATE NOT NULL,
  title VARCHAR(180) NOT NULL,
  member_id VARCHAR(100) REFERENCES member(id)
);
CREATE INDEX idx_non_working_day_date ON non_working_day(day_date);
