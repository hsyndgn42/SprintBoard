ALTER TABLE confluence_config ADD COLUMN backlog_page_id VARCHAR(40) NOT NULL DEFAULT '';

CREATE TABLE confluence_backlog_publish (
 id INT PRIMARY KEY CHECK(id=1),
 base_url VARCHAR(300) NOT NULL,
 page_id VARCHAR(40) NOT NULL,
 page_version INT NOT NULL,
 published_at VARCHAR(40) NOT NULL,
 published_by VARCHAR(100) NOT NULL DEFAULT '',
 item_count INT NOT NULL,
 scope_label VARCHAR(2000) NOT NULL
);
