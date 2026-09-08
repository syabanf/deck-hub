-- 000012_deck_cover_image.down.sql
-- Dropping this loses the association between decks and their uploaded cover
-- files. The files themselves stay in UPLOAD_DIR; nothing will reference them.
ALTER TABLE decks DROP COLUMN IF EXISTS cover_image;
