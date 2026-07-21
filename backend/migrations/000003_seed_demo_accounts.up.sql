-- 000003_seed_demo_accounts.up.sql
-- Purpose-built demo accounts, one per role, so the login screen can offer
-- one-click sign-in and reviewers can feel the role gating immediately.
--
-- The admin demo reuses the existing admin@wit.id seeded in 000001.
--
--   editor@wit.id / editor1234   → can add & remove decks, cannot manage users
--   viewer@wit.id / viewer1234   → read-only browsing
--
-- Both are 'active' because Authenticate rejects suspended accounts.
-- Hashes generated with: make hash PASS=<password>

INSERT INTO users (name, email, role, status, password_hash)
VALUES
  ('Demo Editor', 'editor@wit.id', 'editor', 'active',
   '$2a$10$U8XK8VZQnwFevdyiM7gLD.W9htZseVxQMpf9vvVqeQnT8lacfXPZm'),
  ('Demo Viewer', 'viewer@wit.id', 'viewer', 'active',
   '$2a$10$.Ccb5tTRXPE0RYo0gMtX0utr61IUzSPJbZHtQHY0KLr5zz5z6fwDS')
ON CONFLICT DO NOTHING;
