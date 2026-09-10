-- 000020_taxonomy_description.down.sql
ALTER TABLE IF EXISTS taxonomy_terms DROP COLUMN IF EXISTS description;
