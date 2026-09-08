-- 000014_deck_owner.down.sql
DROP INDEX IF EXISTS decks_created_by_idx;
ALTER TABLE decks DROP CONSTRAINT IF EXISTS decks_created_by_fkey;
ALTER TABLE decks DROP COLUMN IF EXISTS created_by;
