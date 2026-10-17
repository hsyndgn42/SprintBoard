-- Account-only change. Product JSON backup format remains V19 and excludes accounts.
ALTER TABLE app_user ADD COLUMN session_version BIGINT NOT NULL DEFAULT 0;
