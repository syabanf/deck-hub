-- 000004_favorites.up.sql
-- Per-user favorites ("My Library"): a many-to-many between users and decks.
-- ON DELETE CASCADE on both sides means removing a user or a deck cleans up
-- their favorite rows automatically.

CREATE TABLE IF NOT EXISTS favorites (
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deck_id    UUID        NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, deck_id)
);

-- Listing a user's favorites is the hot path.
CREATE INDEX IF NOT EXISTS favorites_user_idx ON favorites (user_id, created_at DESC);
