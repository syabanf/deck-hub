-- 000023_user_activity.down.sql
ALTER TABLE IF EXISTS users
    DROP COLUMN IF EXISTS last_seen_at,
    DROP COLUMN IF EXISTS last_login_at;
