CREATE TABLE member_capacity_policy (
 id VARCHAR(100) PRIMARY KEY,
 member_id VARCHAR(100) NOT NULL REFERENCES member(id),
 effective_from DATE NOT NULL,
 hours_per_day DOUBLE PRECISION,
 focus_percent INTEGER NOT NULL CHECK (focus_percent BETWEEN 0 AND 100),
 CHECK (hours_per_day IS NULL OR (hours_per_day BETWEEN 1 AND 24 AND MOD(hours_per_day*2,1)=0)),
 UNIQUE(member_id,effective_from)
);
CREATE TABLE sprint_member_policy (
 sprint_id VARCHAR(100) NOT NULL REFERENCES sprint(id),
 member_id VARCHAR(100) NOT NULL REFERENCES member(id),
 hours_per_day DOUBLE PRECISION NOT NULL CHECK (hours_per_day BETWEEN 1 AND 24 AND MOD(hours_per_day*2,1)=0),
 focus_percent INTEGER NOT NULL CHECK (focus_percent BETWEEN 0 AND 100),
 PRIMARY KEY(sprint_id,member_id)
);
