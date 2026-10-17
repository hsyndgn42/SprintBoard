CREATE TABLE product_setting (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value VARCHAR(160) NOT NULL
);
INSERT INTO product_setting(setting_key, setting_value) VALUES ('estimation_mode', 'HOURS_ONLY');
