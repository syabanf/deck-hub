-- 000022_deck_slug.down.sql
DROP TABLE IF EXISTS deck_slugs;
DROP INDEX IF EXISTS decks_slug_key;
ALTER TABLE IF EXISTS decks DROP COLUMN IF EXISTS slug;
