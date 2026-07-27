-- 000008_viewing_progress.up.sql
-- Per-user resume position, so "Continue watching" follows the account instead
-- of the browser.
--
-- This is deliberately separate from decks.view_count. That column is a global
-- popularity signal incremented by anyone, including signed-out visitors; this
-- table is private per-user progress. Folding them together would either leak
-- one person's history into a public counter or make the counter unusable for
-- ranking.

CREATE TABLE IF NOT EXISTS viewing_progress (
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deck_id       UUID        NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    -- Zero-based, matching the player's slide index.
    current_slide INTEGER     NOT NULL DEFAULT 0 CHECK (current_slide >= 0),
    -- What the client believed the deck length was. Stored rather than derived
    -- because a PDF's page count is only known once it has been opened, and an
    -- embed never reports one at all.
    total_slides  INTEGER     NOT NULL DEFAULT 0 CHECK (total_slides >= 0),
    viewed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, deck_id)
);

-- The only read is "this user's rows, most recent first".
CREATE INDEX IF NOT EXISTS viewing_progress_user_idx
    ON viewing_progress (user_id, viewed_at DESC);
