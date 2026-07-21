-- 000002_seed_catalog.up.sql
-- Populate a browsable, backend-primary catalog whose category/industry ids
-- match the React frontend's taxonomy (company-profile, iconic, design,
-- engineering, strategy, keynotes; industries tech/finance/media/…).
--
-- Sources are external (backend-primary: no native slide content is stored).
-- The keynote decks use real YouTube URLs, which embed reliably; the rest use
-- placeholder gslides/embed links whose covers render fine but whose players
-- are best-effort — an accepted trade-off of the source-based seed.

-- 1) Re-home the 000001 seed decks onto the frontend taxonomy so they surface
--    in the right rows instead of orphaned categories.
UPDATE decks SET category = 'engineering', industry = 'tech'
  WHERE title = 'The State of AI 2024';
UPDATE decks SET category = 'iconic', industry = 'finance'
  WHERE title = 'Series A Pitch Deck Teardown';
UPDATE decks SET category = 'design', industry = 'tech'
  WHERE title = 'Designing for Accessibility';
UPDATE decks SET category = 'engineering', industry = 'tech'
  WHERE title = 'Go Concurrency Patterns';

-- 2) Seed the catalog.
INSERT INTO decks
  (title, subtitle, author, year, category, industry, tags, source_type, source_value, description, featured, view_count)
VALUES
  -- ── Company Profiles ──────────────────────────────────────────────────────
  ('Apple Inc.', 'Designed in California', 'Apple', 2024, 'company-profile', 'tech',
   ARRAY['hardware','consumer','design'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-apple/pub',
   'Company profile: products, ecosystem, retail, and services across a $383B business.', false, 412),

  ('Stripe', 'Internet payments infrastructure', 'Stripe', 2024, 'company-profile', 'finance',
   ARRAY['payments','api','developer-platform'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-stripe/pub',
   'Payments, billing, and the building blocks of internet commerce.', false, 280),

  ('Spotify', 'Audio for everyone', 'Spotify', 2024, 'company-profile', 'media',
   ARRAY['audio','streaming','music'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-spotify/pub',
   'How a two-sided audio marketplace scaled to hundreds of millions of listeners.', false, 245),

  ('Notion', 'The connected workspace', 'Notion Labs', 2024, 'company-profile', 'enterprise',
   ARRAY['productivity','saas','collaboration'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-notion/pub',
   'Docs, wikis, and projects in one flexible, block-based workspace.', false, 190),

  ('Nubank', 'Reimagining banking for Latin America', 'Nu Holdings', 2024, 'company-profile', 'finance',
   ARRAY['fintech','banking','latam'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-nubank/pub',
   'The digital bank that reached 90M+ customers by rethinking financial services.', false, 160),

  -- ── Iconic Pitch Decks ────────────────────────────────────────────────────
  ('AirBed & Breakfast', 'The original Airbnb pitch deck', 'Brian Chesky, Joe Gebbia, Nathan Blecharczyk', 2009, 'iconic', 'mobility',
   ARRAY['marketplace','travel','seed'], 'embed',
   'https://www.slideshare.net/slideshow/embed_code/key/airbnb-pitch-deck',
   'The seed deck that launched a category — book rooms with locals, a $30B market.', true, 350),

  ('UberCab', 'Next-generation car service', 'Garrett Camp, Travis Kalanick', 2008, 'iconic', 'mobility',
   ARRAY['rideshare','marketplace','logistics'], 'embed',
   'https://www.slideshare.net/slideshow/embed_code/key/uber-pitch-deck',
   'The original Uber concept deck: push-a-button, get-a-ride.', false, 175),

  ('LinkedIn Series B', 'A 21st century network for business', 'Reid Hoffman', 2004, 'iconic', 'enterprise',
   ARRAY['network','professional','marketplace'], 'embed',
   'https://www.slideshare.net/slideshow/embed_code/key/linkedin-series-b',
   'The pitch that framed the professional graph as a defensible network.', false, 140),

  ('Front Series A', 'A shared inbox for teams', 'Mathilde Collin', 2016, 'iconic', 'enterprise',
   ARRAY['saas','email','collaboration'], 'embed',
   'https://www.slideshare.net/slideshow/embed_code/key/front-series-a',
   'A masterclass in clarity — the Series A deck that raised $10M.', false, 95),

  -- ── Design & Brand ────────────────────────────────────────────────────────
  ('Refactoring UI', 'Design tips for developers', 'Adam Wathan & Steve Schoger', 2018, 'design', 'tech',
   ARRAY['ui','css','design-systems'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-refactoring-ui/pub',
   'Practical, tactical visual design advice for people who build software.', true, 240),

  ('Material Design', 'Bold, graphic, intentional', 'Google Design', 2014, 'design', 'tech',
   ARRAY['design-systems','guidelines','android'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-material/pub',
   'The design language and system that unified Google''s products.', false, 180),

  ('The Design of Everyday Things', 'Lessons from Don Norman', 'Don Norman', 1988, 'design', 'tech',
   ARRAY['ux','psychology','usability'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-doet/pub',
   'Affordances, signifiers, and the timeless principles of usable design.', false, 165),

  -- ── Engineering & AI ──────────────────────────────────────────────────────
  ('Attention Is All You Need', 'The Transformer architecture', 'Vaswani et al.', 2017, 'engineering', 'tech',
   ARRAY['ai','ml','transformers'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-transformer/pub',
   'The paper that reshaped machine learning — self-attention, no recurrence.', false, 312),

  ('The Twelve-Factor App', 'Best practices for SaaS', 'Adam Wiggins', 2011, 'engineering', 'tech',
   ARRAY['backend','devops','architecture'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-12factor/pub',
   'Twelve principles for building portable, resilient cloud-native services.', false, 220),

  ('SOLID Principles', 'Object-oriented design that lasts', 'Robert C. Martin', 2000, 'engineering', 'tech',
   ARRAY['oop','architecture','clean-code'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-solid/pub',
   'Five principles for code that stays soft — easy to change over time.', false, 175),

  -- ── Startup Strategy ──────────────────────────────────────────────────────
  ('Netflix Culture', 'Freedom & Responsibility', 'Reed Hastings', 2009, 'strategy', 'media',
   ARRAY['culture','management','scaling'], 'embed',
   'https://www.slideshare.net/slideshow/embed_code/key/netflix-culture',
   'The 125-slide deck Sheryl Sandberg called the most important to come out of Silicon Valley.', true, 400),

  ('Zero to One', 'Notes on startups, or how to build the future', 'Peter Thiel', 2014, 'strategy', 'tech',
   ARRAY['startups','monopoly','strategy'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-zero-to-one/pub',
   'Why competition is for losers and every great business is built on a secret.', false, 260),

  ('Blitzscaling', 'The lightning-fast path to building massive companies', 'Reid Hoffman', 2018, 'strategy', 'enterprise',
   ARRAY['scaling','growth','startups'], 'gslides',
   'https://docs.google.com/presentation/d/e/sample-blitzscaling/pub',
   'Prioritizing speed over efficiency in an environment of uncertainty.', false, 180),

  -- ── Talks & Keynotes (real, embeddable YouTube) ───────────────────────────
  ('Stay Hungry. Stay Foolish.', 'Stanford Commencement Address', 'Steve Jobs', 2005, 'keynotes', 'tech',
   ARRAY['inspiration','apple','life'], 'video',
   'https://www.youtube.com/watch?v=UF8uR6Z6KLc',
   'Three stories about connecting the dots, love and loss, and death.', false, 420),

  ('The Puzzle of Motivation', 'What science knows that business doesn''t', 'Dan Pink', 2009, 'keynotes', 'enterprise',
   ARRAY['motivation','management','ted'], 'video',
   'https://www.youtube.com/watch?v=rrkrvAUbU9Y',
   'Autonomy, mastery, and purpose beat carrots and sticks for creative work.', false, 210),

  ('Inside the Mind of a Master Procrastinator', 'The rational vs. the instant-gratification brain', 'Tim Urban', 2016, 'keynotes', 'education',
   ARRAY['productivity','psychology','ted'], 'video',
   'https://www.youtube.com/watch?v=arj7oStGLkU',
   'A hilarious, honest map of what actually happens inside a procrastinator''s head.', false, 300),

  ('Your Body Language May Shape Who You Are', 'Power posing and presence', 'Amy Cuddy', 2012, 'keynotes', 'education',
   ARRAY['psychology','confidence','ted'], 'video',
   'https://www.youtube.com/watch?v=Ks-_Mh1QhMc',
   'How small tweaks to body language can change how others — and we — see us.', false, 250),

  -- Inserted last + bumped created_at below so it becomes the billboard Hero,
  -- and its real YouTube source means "Open Deck" actually plays.
  ('How Great Leaders Inspire Action', 'Start with why', 'Simon Sinek', 2009, 'keynotes', 'enterprise',
   ARRAY['leadership','motivation','ted'], 'video',
   'https://www.youtube.com/watch?v=qp0HIF3SfI4',
   'The Golden Circle: why the world''s most influential leaders all think, act, and communicate starting with why.', true, 480);

-- Make the Simon Sinek keynote the newest featured deck so the frontend's
-- "first featured" billboard resolves to it deterministically.
UPDATE decks SET created_at = now() + interval '1 hour'
  WHERE title = 'How Great Leaders Inspire Action';

-- 3) Seed a small team directory so the Settings page isn't near-empty.
--    All reuse the admin bcrypt hash of "admin1234" so they can actually log in.
INSERT INTO users (name, email, role, status, password_hash)
VALUES
  ('Ada Lovelace',     'ada@wit.id',     'editor', 'active',    '$2a$10$YlnJDhRjdzrNi9kSy8ODD.9uU87l9w5Q2fxfiis1frZmgIZ4FmvRC'),
  ('Alan Turing',      'alan@wit.id',    'editor', 'active',    '$2a$10$YlnJDhRjdzrNi9kSy8ODD.9uU87l9w5Q2fxfiis1frZmgIZ4FmvRC'),
  ('Grace Hopper',     'grace@wit.id',   'editor', 'active',    '$2a$10$YlnJDhRjdzrNi9kSy8ODD.9uU87l9w5Q2fxfiis1frZmgIZ4FmvRC'),
  ('Linus Torvalds',   'linus@wit.id',   'viewer', 'invited',   '$2a$10$YlnJDhRjdzrNi9kSy8ODD.9uU87l9w5Q2fxfiis1frZmgIZ4FmvRC'),
  ('Margaret Hamilton','margaret@wit.id','admin',  'active',    '$2a$10$YlnJDhRjdzrNi9kSy8ODD.9uU87l9w5Q2fxfiis1frZmgIZ4FmvRC'),
  ('Katherine Johnson','katherine@wit.id','viewer','suspended', '$2a$10$YlnJDhRjdzrNi9kSy8ODD.9uU87l9w5Q2fxfiis1frZmgIZ4FmvRC')
ON CONFLICT DO NOTHING;
