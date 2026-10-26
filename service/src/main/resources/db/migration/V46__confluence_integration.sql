-- Confluence integration: publishes a planned sprint as a wiki page.
CREATE TABLE confluence_config (
 id INT PRIMARY KEY CHECK(id=1),
 base_url VARCHAR(300) NOT NULL DEFAULT '',
 space_key VARCHAR(60) NOT NULL DEFAULT '',
 parent_page_id VARCHAR(40) NOT NULL DEFAULT '',
 pat_secret VARCHAR(4096) NOT NULL DEFAULT '',
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 version INT NOT NULL DEFAULT 0
);

-- Remembering the page id is what turns a second publish into an update instead of a duplicate.
CREATE TABLE confluence_page_link (
 sprint_id VARCHAR(100) PRIMARY KEY,
 page_id VARCHAR(40) NOT NULL,
 page_url VARCHAR(600) NOT NULL DEFAULT '',
 page_version INT NOT NULL DEFAULT 1,
 published_at VARCHAR(40) NOT NULL,
 published_by VARCHAR(100) NOT NULL DEFAULT ''
);
