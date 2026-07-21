-- 000002_seed_catalog.down.sql
-- Remove the catalog decks seeded by the up migration. The 000001 re-home
-- UPDATEs are left as-is (harmless; 000001 down drops the table entirely).

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
