-- 000017_demo_pin.down.sql
-- Removing the hash leaves the Demo Center with no PIN configured. The API
-- refuses to serve demos in that state rather than serving them ungated.
--
-- Guarded: a down migration has to tolerate its table being absent. These run
-- newest-first, and a reset that failed partway can leave the database in a
-- state where the table this touches is already gone. A bare DELETE fails at
-- analysis time, before execution, so no IF EXISTS on the statement can save
-- it — whether the table is there has to be asked first.
DO $$
BEGIN
    IF to_regclass('public.app_settings') IS NULL THEN
        RETURN;
    END IF;

    DELETE FROM app_settings WHERE key = 'demo_pin_hash';
END $$;
