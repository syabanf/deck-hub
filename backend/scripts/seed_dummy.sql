-- seed_dummy.sql
-- Reversible dummy/test data for the WIT catalog, kept OUT of the migration
-- chain on purpose (migrations hold the real baseline; this is throwaway volume
-- for demos and load-testing the UI).
--
-- Everything here is tagged for trivial cleanup:
--   * decks carry the 'sample' tag
--   * users use the @example.test email domain
--
-- Re-running is safe: it clears prior dummy rows first (idempotent). Remove with
-- scripts/unseed_dummy.sql  (or `make unseed-dummy`).

BEGIN;

-- Clear any previous dummy rows so this script is idempotent.
DELETE FROM decks WHERE 'sample' = ANY(tags);
DELETE FROM users WHERE email LIKE '%@example.test';

-- 42 dummy decks — 7 per category, spread across industries, mixed source
-- types, varied view counts and years. Video decks use a real, embeddable
-- placeholder so the player has something to show.
INSERT INTO decks
  (title, subtitle, author, year, category, industry, tags, source_type, source_value, description, featured, view_count)
SELECT
  (ARRAY['Quarterly Business Review','Product Strategy','Go-To-Market Plan','Annual Report',
         'Brand Guidelines','Platform Architecture','Growth Playbook','Culture Handbook',
         'Series B Deck','Design System Overview','Market Analysis','Roadmap'])[1 + (g % 12)]
    || ' ' || (2018 + (g % 8))::text,
  'Sample subtitle #' || g,
  (ARRAY['Acme Corp','Globex','Initech','Umbrella Co','Hooli','Soylent',
         'Vandelay Industries','Wonka Industries','Stark Labs','Wayne Enterprises',
         'Pied Piper','Massive Dynamic'])[1 + (g % 12)],
  2018 + (g % 8),
  (ARRAY['company-profile','iconic','design','engineering','strategy','keynotes'])[1 + (g % 6)],
  (ARRAY['tech','finance','healthcare','retail','media','mobility',
         'education','enterprise','energy','logistics'])[1 + (g % 10)],
  ARRAY['sample','demo', (ARRAY['q4','growth','ai','ops','launch','review'])[1 + (g % 6)]],
  (ARRAY['gslides','url','video','embed'])[1 + (g % 4)],
  CASE WHEN (g % 4) = 2
       THEN 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
       ELSE 'https://docs.google.com/presentation/d/e/2PACX-sample-' || g || '/pub'
  END,
  'Placeholder deck seeded for demo and load testing — not real content.',
  false,
  (37 * g) % 350
FROM generate_series(1, 42) AS g;

-- 12 dummy users on the @example.test domain. They reuse the admin bcrypt hash
-- of "admin1234" so they can sign in if needed.
INSERT INTO users (name, email, role, status, password_hash)
SELECT
  (ARRAY['Sam','Jordan','Taylor','Casey','Riley','Morgan',
         'Avery','Quinn','Reese','Skyler','Rowan','Emerson'])[g]
    || ' ' ||
  (ARRAY['Tester','Sample','Demo','Placeholder','Example','Mock',
         'Fixture','Stub','Draft','Proxy','Trial','Beta'])[g],
  'user' || g || '@example.test',
  (ARRAY['viewer','editor','viewer','viewer','editor','viewer'])[1 + (g % 6)],
  (ARRAY['active','invited','active','suspended','active','active'])[1 + (g % 6)],
  '$2a$10$YlnJDhRjdzrNi9kSy8ODD.9uU87l9w5Q2fxfiis1frZmgIZ4FmvRC'
FROM generate_series(1, 12) AS g
ON CONFLICT DO NOTHING;

COMMIT;

-- Summary of what now exists.
SELECT 'decks' AS kind, count(*) AS total, count(*) FILTER (WHERE 'sample' = ANY(tags)) AS dummy FROM decks
UNION ALL
SELECT 'users', count(*), count(*) FILTER (WHERE email LIKE '%@example.test') FROM users;
