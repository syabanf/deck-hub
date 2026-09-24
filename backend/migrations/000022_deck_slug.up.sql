-- 000022_deck_slug.up.sql
-- Readable share links: paparan.reddie.id/d/company-profile-2026
--
-- A deck was only ever addressable by its UUID, so every link anybody sent a
-- client was 36 characters of hexadecimal. The slug is a second name for the
-- same deck, chosen by whoever adds it.
--
-- Two tables' worth of idea in one column and one table:
--
--   decks.slug   the current name, the one new links are built from
--   deck_slugs   every name this deck has ever had, the current one included
--
-- The second exists so renaming is not a way to break a link that has already
-- been sent. Change a deck's slug and the old one stays in deck_slugs pointing
-- at the same deck, so the link in a client's inbox from three months ago
-- still opens. This is why the uniqueness that matters lives on deck_slugs and
-- not only on decks.slug: a retired name is still taken.
--
-- Existing decks get no slug. They are reachable by id, every link already
-- sent keeps working, and a slug can be filled in later from the edit screen.
-- Backfilling one from the title would mint a public URL for 23 decks that
-- nobody asked for and nobody could predict.

ALTER TABLE decks ADD COLUMN IF NOT EXISTS slug TEXT;

-- NULL is "no slug", and several decks may have none. A plain UNIQUE is right
-- here: Postgres does not consider two NULLs equal, so they do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS decks_slug_key ON decks (slug);

CREATE TABLE IF NOT EXISTS deck_slugs (
    -- The name itself is the key. Lowercase, digits and hyphens only, which
    -- the application normalises before it ever reaches here; the CHECK is the
    -- backstop that keeps a hand-written INSERT from creating a URL that has
    -- to be percent-encoded to be typed.
    slug       TEXT        PRIMARY KEY CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    deck_id    UUID        NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "What has this deck been called" — read when a slug is released on rename,
-- and when a deck is deleted.
CREATE INDEX IF NOT EXISTS deck_slugs_deck_idx ON deck_slugs (deck_id);
