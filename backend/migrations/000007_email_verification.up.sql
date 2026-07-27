-- 000007_email_verification.up.sql
-- Self-service registration with email verification.

-- Verification is its own axis, not another `status` value. `status` is
-- admin-managed (active / invited / suspended); whether someone proved they own
-- an address is a separate fact, and folding the two together would mean an
-- admin suspending an account also destroys its verification.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Everyone who already exists was provisioned deliberately by an admin or a
-- seed, so they count as verified. Without this backfill the login gate added
-- in this change would lock out every existing account, including the seeded
-- admin.
UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL;

-- ---------------------------------------------------------------------------
-- email_verification_tokens
-- ---------------------------------------------------------------------------
-- The token is stored as a SHA-256 hash, never in clear. Anyone who can read
-- this table (a backup, a log, an injection) would otherwise be able to verify
-- and take over any pending account. The plaintext exists only in the email.
--
-- No UNIQUE on user_id: a resend issues a new token, and the old ones stay
-- valid until they expire so a slow mail relay doesn't strand the user.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    token_hash TEXT        PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deleting a user's remaining tokens after a successful verification, and
-- rate-limiting resends, both look up by user.
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
    ON email_verification_tokens (user_id, created_at DESC);

-- Sweeping expired tokens.
CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_idx
    ON email_verification_tokens (expires_at);
