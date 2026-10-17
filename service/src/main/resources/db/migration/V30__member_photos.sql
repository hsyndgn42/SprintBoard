CREATE TABLE member_photo (
 member_id VARCHAR(100) PRIMARY KEY REFERENCES member(id),
 image_data CLOB NOT NULL
);
