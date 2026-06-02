-- 000001_init.down.sql
-- Reverse of 000001_init.up.sql.

DROP TABLE IF EXISTS decks;
DROP TABLE IF EXISTS users;

-- Note: we intentionally do NOT drop the pgcrypto extension here, as other
-- objects in the database may depend on it.
