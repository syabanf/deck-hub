-- 000019_api_keys.up.sql
-- Keys that let a machine outside this company read one endpoint.
--
-- Stored as a SHA-256 hash, not bcrypt. bcrypt is deliberately slow because a
-- password is short and guessable; an API key is 32 random bytes, so there is
-- nothing to slow an attacker down *for* — and it is presented on every single
-- request, where 60ms of hashing would be the endpoint's whole cost. A hash
-- lookup on an indexed column is O(1) and the key is still never at rest in
-- readable form.
--
-- `prefix` is the first few characters, kept in clear so the admin screen can
-- tell one key from another after the full value has been shown once and never
-- again.
CREATE TABLE IF NOT EXISTS api_keys (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Who this key was issued to. Free text: it names a team or a system, and
    -- it is what somebody reads when deciding whether a key is still needed.
    name        TEXT        NOT NULL CHECK (name <> ''),

    key_hash    TEXT        NOT NULL UNIQUE,
    prefix      TEXT        NOT NULL,

    -- Revoking keeps the row. Deleting it would erase the answer to "what was
    -- that key, and who made it" at exactly the moment somebody is asking.
    revoked_at  TIMESTAMPTZ,

    -- Answers "is anyone still using this?" before a key is revoked, and
    -- "when did this start being used?" after a leak.
    last_used_at TIMESTAMPTZ,

    created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every authenticated call looks a key up by its hash.
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys (key_hash);
