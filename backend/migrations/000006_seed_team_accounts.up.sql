-- 000006_seed_team_accounts.up.sql
-- One additional account per role, alongside the demo accounts in 000003.
--
--   lead-admin@wit.id  / wit-admin-1234   → full access, including user management
--   lead-editor@wit.id / wit-editor-1234  → add & remove decks, cannot manage users
--   lead-viewer@wit.id / wit-viewer-1234  → read-only browsing, own favourites
--
-- All 'active': Authenticate rejects suspended accounts, and an 'invited' one
-- could not sign in either.
--
-- Hashes generated with: make hash PASS=<password>
--
-- ON CONFLICT DO NOTHING covers users_email_lower_uidx, the unique index on
-- lower(email) — verified, an expression index does trigger the bare form. This
-- makes the migration re-runnable against a database that already has them.

INSERT INTO users (name, email, role, status, password_hash)
VALUES
  ('Lead Admin', 'lead-admin@wit.id', 'admin', 'active',
   '$2a$10$vAUGwaZbb4klI8gFqzXV0uUr0ovdd7k19zNXmFoJIxINA5h9E8Uxi'),
  ('Lead Editor', 'lead-editor@wit.id', 'editor', 'active',
   '$2a$10$oSnaAVLHq73vTQIwq55ll.7k3aK2sdENy/KGON6DfpqIaFp/xlQ.m'),
  ('Lead Viewer', 'lead-viewer@wit.id', 'viewer', 'active',
   '$2a$10$A2hbTUxIR7QFnT68L19bWOgabVOfkfnwUx3pP1My7Pyz/HOq2jEy6')
ON CONFLICT DO NOTHING;
