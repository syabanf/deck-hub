-- 000018_demo_fields.down.sql
ALTER TABLE demos DROP COLUMN IF EXISTS status;
ALTER TABLE demos DROP COLUMN IF EXISTS environment;
ALTER TABLE demos RENAME COLUMN category TO product;
