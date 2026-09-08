-- 000007_email_verification.down.sql

DROP TABLE IF EXISTS email_verification_tokens;
-- IF EXISTS on the table, not only on the column. DROP COLUMN IF EXISTS
-- guards the column; without the first one, running this against a database
-- that has no `users` table at all fails with "relation does not exist".
--
-- Which is exactly what the e2e and stress suites do: they reset the schema by
-- running these down files first, and on a machine where a previous run left
-- the tables behind that always worked. On a genuinely empty database — CI, or
-- a new laptop — it stopped at this line.
ALTER TABLE IF EXISTS users DROP COLUMN IF EXISTS email_verified_at;
