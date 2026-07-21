-- 000003_seed_demo_accounts.down.sql
-- Remove the per-role demo accounts. admin@wit.id belongs to 000001 and stays.

DELETE FROM users WHERE email IN ('editor@wit.id', 'viewer@wit.id');
