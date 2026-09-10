-- 000002_seed_catalog.down.sql
-- Remove the catalog decks seeded by the up migration. The 000001 re-home
-- UPDATEs are left as-is (harmless; 000001 down drops the table entirely).
--
-- Guarded: a down migration has to tolerate its table being absent. These run
-- newest-first, and a reset that failed partway can leave the database in a
-- state where the table this touches is already gone. A bare DELETE fails at
-- analysis time, before execution, so no IF EXISTS on the statement can save
-- it — whether the table is there has to be asked first.
DO $$
BEGIN
    IF to_regclass('public.decks') IS NULL OR to_regclass('public.users') IS NULL THEN
        RETURN;
    END IF;

    DELETE FROM decks WHERE title IN (
      'Apple Inc.',
      'Stripe',
      'Spotify',
      'Notion',
      'Nubank',
      'AirBed & Breakfast',
      'UberCab',
      'LinkedIn Series B',
      'Front Series A',
      'Refactoring UI',
      'Material Design',
      'The Design of Everyday Things',
      'Attention Is All You Need',
      'The Twelve-Factor App',
      'SOLID Principles',
      'Netflix Culture',
      'Zero to One',
      'Blitzscaling',
      'Stay Hungry. Stay Foolish.',
      'The Puzzle of Motivation',
      'Inside the Mind of a Master Procrastinator',
      'Your Body Language May Shape Who You Are',
      'How Great Leaders Inspire Action'
    );

    DELETE FROM users WHERE email IN (
      'ada@wit.id', 'alan@wit.id', 'grace@wit.id',
      'linus@wit.id', 'margaret@wit.id', 'katherine@wit.id'
    );
END $$;
