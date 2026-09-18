-- 000021_deck_images.up.sql
-- The photos that make up a 'photos' deck.
--
-- Its own table rather than a JSON column on decks, because these are a list
-- with an order that people rearrange, and a list in a text column is a list
-- nothing can index, constrain, or cascade. A deck going away has to take its
-- photos with it, and a foreign key says that once instead of every delete
-- path saying it again.
--
-- Nothing here stores bytes. The files go through the existing upload endpoint
-- and land in the uploads volume exactly like a PDF or a cover image; this
-- keeps the order and the original filename, which is what a download needs.
CREATE TABLE IF NOT EXISTS deck_images (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id    UUID        NOT NULL REFERENCES decks(id) ON DELETE CASCADE,

    -- Server-relative, e.g. /uploads/<uuid>.jpg. Validated on write to be that
    -- or an http(s) URL — see normalizeLink.
    url        TEXT        NOT NULL CHECK (url <> ''),

    -- What the file was called when it was uploaded. The stored name is a UUID
    -- on purpose, so this is the only place a readable one survives.
    name       TEXT        NOT NULL DEFAULT '',

    -- Position in the deck. Ties break on id so a listing can never reorder
    -- itself between two requests.
    sort_order INTEGER     NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every read is "the photos of this deck, in order".
CREATE INDEX IF NOT EXISTS deck_images_deck_order_idx
    ON deck_images (deck_id, sort_order, id);
