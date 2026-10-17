CREATE TABLE leave_request (
 id VARCHAR(100) PRIMARY KEY,
 member_id VARCHAR(100) NOT NULL REFERENCES member(id),
 sprint_id VARCHAR(100) NOT NULL REFERENCES sprint(id),
 requester VARCHAR(80) NOT NULL,
 start_on DATE NOT NULL,
 end_on DATE NOT NULL,
 days DOUBLE PRECISION NOT NULL CHECK(days>0 AND days<=100),
 leave_type VARCHAR(30) NOT NULL CHECK(leave_type IN ('ANNUAL','OVERTIME')),
 reason VARCHAR(1000) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 created_at VARCHAR(40) NOT NULL,
 decided_at VARCHAR(40),
 decided_by VARCHAR(80),
 decision_note VARCHAR(1000) NOT NULL DEFAULT '',
 entry_id VARCHAR(100) UNIQUE REFERENCES leave_record(id),
 CHECK(end_on>=start_on)
);
CREATE INDEX idx_leave_request_member ON leave_request(member_id,status);
