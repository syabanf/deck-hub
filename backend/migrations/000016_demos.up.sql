-- 000016_demos.up.sql
-- Demo Center: the credentials for WIT's own product demos.
--
-- The password is stored as it was typed, not hashed. That is not an oversight
-- and it is not the same kind of secret as a user password: nobody
-- authenticates against this column, and a hash cannot be copied into a login
-- form. Reversible storage is what a shared credential is.
--
-- The consequences follow from that and are worth stating plainly: anyone who
-- can open the page can read them, anyone who can read the database can read
-- them, and a database backup carries them. They belong to demo environments
-- for that reason — nothing here should be a credential to anything real.
CREATE TABLE IF NOT EXISTS demos (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    name        TEXT        NOT NULL CHECK (name <> ''),
    -- Which product the demo is for. Free text on purpose: the list of WIT
    -- products is not the deck taxonomy and does not want a master list of its
    -- own until somebody asks for one.
    product     TEXT        NOT NULL DEFAULT '',

    url         TEXT        NOT NULL DEFAULT '',
    username    TEXT        NOT NULL DEFAULT '',
    password    TEXT        NOT NULL DEFAULT '',
    notes       TEXT        NOT NULL DEFAULT '',

    sort_order  INTEGER     NOT NULL DEFAULT 0,
    -- Retired rather than deleted, the same as a taxonomy term: a demo that is
    -- temporarily down should stop being offered without losing its details.
    active      BOOLEAN     NOT NULL DEFAULT true,

    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS demos_order_idx ON demos (sort_order, name);
