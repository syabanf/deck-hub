-- 000010_taxonomy_terms.up.sql
-- Master data for the browse taxonomy: categories, industries, source types.
--
-- Until now these lived in src/data/decks.js and were compiled into the
-- frontend bundle. Adding one category meant a code change, a build and a
-- deploy; nobody outside the repository could do it at all.
--
-- One table with a `kind` discriminator rather than three near-identical ones.
-- The three behave the same way — a slug decks refer to, a title people read,
-- an order they appear in, and a switch to retire one — so three tables would
-- be three copies of the same repository, usecase, handler and spec. A fourth
-- kind later costs rows, not endpoints.

CREATE TABLE IF NOT EXISTS taxonomy_terms (
    kind       TEXT        NOT NULL
                           CHECK (kind IN ('category', 'industry', 'source_type')),

    -- The value decks actually store in decks.category / industry / source_type.
    -- Immutable by design: renaming it would silently orphan every deck that
    -- refers to it. The title is what changes when wording changes.
    slug       TEXT        NOT NULL CHECK (slug <> ''),

    title      TEXT        NOT NULL CHECK (title <> ''),

    -- Browse order. Ties break on slug so a listing can never reorder itself
    -- between two requests.
    sort_order INTEGER     NOT NULL DEFAULT 0,

    -- Retire a term without deleting it: decks keep working, the value stops
    -- being offered for new ones. Deleting is refused while decks still use it.
    active     BOOLEAN     NOT NULL DEFAULT true,

    -- Gradient for the industry cards. Empty for the other kinds, which have
    -- no colour of their own — a nullable pair of columns beats a JSON blob
    -- nobody can index or read in psql.
    accent     TEXT        NOT NULL DEFAULT '',
    secondary  TEXT        NOT NULL DEFAULT '',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (kind, slug)
);

CREATE INDEX IF NOT EXISTS taxonomy_terms_kind_order_idx
    ON taxonomy_terms (kind, sort_order, slug);

-- ---------------------------------------------------------------------------
-- Seed: exactly what src/data/decks.js carried, in the same order, so the
-- catalog looks identical the moment the frontend starts reading this instead.
-- ---------------------------------------------------------------------------

INSERT INTO taxonomy_terms (kind, slug, title, sort_order) VALUES
    ('category', 'company-profile', 'Company Profiles',  10),
    ('category', 'iconic',          'Iconic Pitch Decks', 20),
    ('category', 'design',          'Design & Brand',     30),
    ('category', 'engineering',     'Engineering & AI',   40),
    ('category', 'strategy',        'Startup Strategy',   50),
    ('category', 'keynotes',        'Talks & Keynotes',   60)
ON CONFLICT (kind, slug) DO NOTHING;

INSERT INTO taxonomy_terms (kind, slug, title, sort_order, accent, secondary) VALUES
    ('industry', 'tech',          'Technology',                  10, '#00c6fb', '#005bea'),
    ('industry', 'finance',       'Finance & Fintech',           20, '#11998e', '#38ef7d'),
    ('industry', 'healthcare',    'Healthcare',                  30, '#ff5f6d', '#ffc371'),
    ('industry', 'retail',        'Retail & E-commerce',         40, '#f7971e', '#ffd200'),
    ('industry', 'media',         'Media & Entertainment',       50, '#7f00ff', '#e100ff'),
    ('industry', 'mobility',      'Mobility & Travel',           60, '#fa709a', '#fee140'),
    ('industry', 'education',     'Education',                   70, '#43e97b', '#38f9d7'),
    ('industry', 'enterprise',    'Enterprise SaaS',             80, '#4e4376', '#2b5876'),
    ('industry', 'fnb',           'Food & Beverage',             90, '#ff6b6b', '#feca57'),
    ('industry', 'manufacturing', 'Manufacturing',              100, '#6c5ce7', '#a29bfe'),
    ('industry', 'energy',        'Energy & Utilities',         110, '#fdcb6e', '#e17055'),
    ('industry', 'agriculture',   'Agriculture',                120, '#55efc4', '#00b894'),
    ('industry', 'logistics',     'Logistics & Supply',         130, '#74b9ff', '#0984e3'),
    ('industry', 'realestate',    'Construction & Real Estate', 140, '#a29bfe', '#6c5ce7'),
    ('industry', 'telecom',       'Telecommunications',         150, '#fd79a8', '#e84393'),
    ('industry', 'public',        'Government & Public Sector', 160, '#636e72', '#2d3436')
ON CONFLICT (kind, slug) DO NOTHING;

-- Source types were never written down anywhere: the Add-deck form, the player,
-- the e2e fixtures and scripts/upload-deck.sh each decided independently what
-- was valid. Reading the catalog finds only four of these — 'url' appears in
-- none of the 28 seeded decks, yet the Add-deck form produces it for any deck
-- added as a link. That gap is the argument for this table.
INSERT INTO taxonomy_terms (kind, slug, title, sort_order) VALUES
    ('source_type', 'pdf',     'PDF document',   10),
    ('source_type', 'gslides', 'Google Slides',  20),
    ('source_type', 'url',     'Link',           30),
    ('source_type', 'video',   'Video',          40),
    ('source_type', 'embed',   'Embed / iframe', 50)
ON CONFLICT (kind, slug) DO NOTHING;

-- Anything the catalog already refers to but the seeds above do not name is
-- adopted as a retired term rather than left dangling. A deck pointing at a
-- category that does not exist is invisible to every filter, and there is one
-- such deck in the development catalog already (category 'mine'). Retired, so
-- it stops being offered for new decks while the existing one keeps working.
INSERT INTO taxonomy_terms (kind, slug, title, sort_order, active)
SELECT 'category', category, category, 900, false
  FROM decks
 WHERE category <> ''
 GROUP BY category
ON CONFLICT (kind, slug) DO NOTHING;

INSERT INTO taxonomy_terms (kind, slug, title, sort_order, active)
SELECT 'industry', industry, industry, 900, false
  FROM decks
 WHERE industry <> ''
 GROUP BY industry
ON CONFLICT (kind, slug) DO NOTHING;

INSERT INTO taxonomy_terms (kind, slug, title, sort_order, active)
SELECT 'source_type', source_type, source_type, 900, false
  FROM decks
 WHERE source_type <> ''
 GROUP BY source_type
ON CONFLICT (kind, slug) DO NOTHING;
