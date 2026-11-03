-- 000023_user_activity.up.sql
-- When each account last signed in, and when it was last seen using the site.
--
-- Two columns because they answer different questions. A token lasts a day
-- and "Remember me" keeps it, so somebody can use the site every morning for a
-- week and sign in once: last_login_at alone would say they had not been here
-- since Monday.
--
-- The full history of sign-ins is not kept here. Every successful sign-in is
-- already a row in audit_log, with its time and address; these are the two
-- numbers the user list shows without reading that table once per row.
--
-- Both start empty. Nothing recorded who signed in before this — the audit
-- rows for /auth/login were written without an account — so there is nothing
-- honest to backfill them from.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ;
