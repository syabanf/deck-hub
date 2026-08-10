-- 000009_remove_demo_accounts.up.sql
--
-- Removes the demo accounts that 000003 and 000006 seeded.
--
-- Those migrations put six accounts with hardcoded passwords into every
-- database the migration chain touches — including production, where all six
-- were found live and two of them were admins. The passwords are published in
-- the repository, so anyone who could read it could sign in and manage the
-- catalog and the users.
--
-- Demo data does not belong in the schema chain. It is now opt-in:
--
--   make seed-demo     -- re-inserts these accounts for local development
--
-- The bootstrap admin from 000001 is deliberately left alone: deleting it here
-- would lock an existing deployment out of its own admin screen. Its password
-- is rotated instead, from BOOTSTRAP_ADMIN_PASSWORD at startup — see
-- cmd/api/main.go. A deployment that sets nothing keeps the old credentials and
-- is warned about it on every boot.

DELETE FROM users
WHERE lower(email) IN (
    'editor@wit.id',
    'viewer@wit.id',
    'lead-admin@wit.id',
    'lead-editor@wit.id',
    'lead-viewer@wit.id'
);
