-- 000003_seed_demo_accounts.down.sql
-- Remove the per-role demo accounts. admin@wit.id belongs to 000001 and stays.
--
-- Guarded: a down migration has to tolerate its table being absent. These run
-- newest-first, and a reset that failed partway can leave the database in a
-- state where the table this touches is already gone. A bare DELETE fails at
-- analysis time, before execution, so no IF EXISTS on the statement can save
-- it — whether the table is there has to be asked first.
DO $$
BEGIN
    IF to_regclass('public.users') IS NULL THEN
        RETURN;
    END IF;

    DELETE FROM users WHERE email IN ('editor@wit.id', 'viewer@wit.id');
END $$;
