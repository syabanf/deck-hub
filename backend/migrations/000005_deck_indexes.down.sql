-- 000005_deck_indexes.down.sql
-- Drops the indexes added in 000005. pg_trgm itself is left installed: other
-- objects may come to depend on it, and an extension is cheap to keep.

DROP INDEX IF EXISTS decks_description_trgm_idx;
DROP INDEX IF EXISTS decks_author_trgm_idx;
DROP INDEX IF EXISTS decks_subtitle_trgm_idx;
DROP INDEX IF EXISTS decks_title_trgm_idx;
DROP INDEX IF EXISTS decks_created_at_idx;
