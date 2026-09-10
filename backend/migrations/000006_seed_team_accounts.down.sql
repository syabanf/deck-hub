-- 000006_seed_team_accounts.down.sql
-- Remove the per-role team accounts. Matched by email so a manually-created
-- account with the same role is left alone.
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

    DELETE FROM users
    WHERE email IN ('lead-admin@wit.id', 'lead-editor@wit.id', 'lead-viewer@wit.id');
END $$;
