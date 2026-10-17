ALTER TABLE roadmap_item DROP CONSTRAINT roadmap_kind_check;
ALTER TABLE roadmap_item ADD CONSTRAINT roadmap_kind_check CHECK (item_kind IN ('PROJECT','FEATURE_SET','GENERAL','UNSPECIFIED'));
