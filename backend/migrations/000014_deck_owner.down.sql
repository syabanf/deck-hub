-- 000014_deck_owner.down.sql
DROP INDEX IF EXISTS decks_created_by_idx;
ALTER TABLE IF EXISTS decks DROP CONSTRAINT IF EXISTS decks_created_by_fkey;
ALTER TABLE IF EXISTS decks DROP COLUMN IF EXISTS created_by;
