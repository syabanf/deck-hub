-- unseed_dummy.sql
-- Remove all dummy/test data seeded by scripts/seed_dummy.sql. Leaves the real
-- migration-seeded catalog and team directory untouched.

DELETE FROM decks WHERE 'sample' = ANY(tags);
DELETE FROM users WHERE email LIKE '%@example.test';

SELECT 'decks' AS kind, count(*) AS remaining FROM decks
UNION ALL
SELECT 'users', count(*) FROM users;
