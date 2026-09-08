-- 000014_deck_owner.up.sql
-- Who added a deck.
--
-- `author` has always been free text — the name printed on the card, often a
-- company rather than a person — so there was no way to answer "how many decks
-- has this account added". This is the account, and it is separate from the
-- author for that reason.
--
-- Nullable, and it stays nullable: every deck that exists today was created
-- before anything recorded this, and inventing an owner for them would be a
-- guess presented as a fact. They read as "unknown", which is true.
ALTER TABLE decks ADD COLUMN IF NOT EXISTS created_by UUID;

-- ON DELETE SET NULL rather than CASCADE: removing someone from the team must
-- not delete the catalog they built.
DO $$
BEGIN
    ALTER TABLE decks
        ADD CONSTRAINT decks_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS decks_created_by_idx ON decks (created_by);
