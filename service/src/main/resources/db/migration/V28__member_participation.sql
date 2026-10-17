CREATE TABLE member_participation (
 id VARCHAR(100) PRIMARY KEY,
 member_id VARCHAR(100) NOT NULL REFERENCES member(id),
 joined_on DATE,
 left_on DATE,
 closed BOOLEAN NOT NULL,
 CHECK (joined_on IS NULL OR left_on IS NULL OR left_on >= joined_on),
 CHECK (closed OR left_on IS NULL)
);
-- Legacy departure dates are the last included day. Unknown dates remain unknown.
INSERT INTO member_participation SELECT 'participation-' || id,id,joined_on,left_on,
 CASE WHEN active=false OR left_on IS NOT NULL THEN true ELSE false END FROM member;
CREATE TABLE sprint_member_presence (
 sprint_id VARCHAR(100) NOT NULL REFERENCES sprint(id),
 member_id VARCHAR(100) NOT NULL REFERENCES member(id),
 days_json CLOB NOT NULL,
 PRIMARY KEY(sprint_id,member_id)
);
