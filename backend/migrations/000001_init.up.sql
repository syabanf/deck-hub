-- 000001_init.up.sql
-- Initial schema for the WIT deck catalog: users + decks.

-- pgcrypto provides gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL,
    email         TEXT        NOT NULL,
    role          TEXT        NOT NULL DEFAULT 'viewer'
                              CHECK (role IN ('admin', 'editor', 'viewer')),
    status        TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'invited', 'suspended')),
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive unique email.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (lower(email));

-- ---------------------------------------------------------------------------
-- decks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decks (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT        NOT NULL,
    subtitle     TEXT        NOT NULL DEFAULT '',
    author       TEXT        NOT NULL DEFAULT '',
    year         INTEGER     NOT NULL DEFAULT 0,
    category     TEXT        NOT NULL DEFAULT '',
    industry     TEXT        NOT NULL DEFAULT '',
    tags         TEXT[]      NOT NULL DEFAULT '{}',
    source_type  TEXT        NOT NULL DEFAULT '',
    source_value TEXT        NOT NULL DEFAULT '',
    description  TEXT        NOT NULL DEFAULT '',
    featured     BOOLEAN     NOT NULL DEFAULT false,
    view_count   INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decks_category_idx ON decks (category);
CREATE INDEX IF NOT EXISTS decks_industry_idx ON decks (industry);
CREATE INDEX IF NOT EXISTS decks_source_type_idx ON decks (source_type);
CREATE INDEX IF NOT EXISTS decks_featured_idx ON decks (featured);

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------
-- Admin user.
--   email:    admin@wit.id
--   password: admin1234   (plaintext)
--
-- The password_hash below is a bcrypt hash (cost 10) of "admin1234".
-- VERIFIED: this exact hash was confirmed to validate against "admin1234"
-- (admin login returns a JWT). bcrypt is salted, so many distinct hashes verify
-- against the same password.
--
-- To change the seed admin password, regenerate the hash and replace the value
-- below (keep the surrounding single quotes):
--   make hash PASS=<new-password>   # or: go run ./cmd/hashpw <new-password>
INSERT INTO users (name, email, role, status, password_hash)
VALUES (
    'WIT Admin',
    'admin@wit.id',
    'admin',
    'active',
    '$2a$10$YlnJDhRjdzrNi9kSy8ODD.9uU87l9w5Q2fxfiis1frZmgIZ4FmvRC'
)
ON CONFLICT DO NOTHING;

-- Sample decks.
INSERT INTO decks (title, subtitle, author, year, category, industry, tags, source_type, source_value, description, featured, view_count)
VALUES
    (
        'The State of AI 2024',
        'Trends shaping machine intelligence',
        'WIT Research',
        2024,
        'technology',
        'software',
        ARRAY['ai', 'ml', 'trends'],
        'gslides',
        'https://docs.google.com/presentation/d/sample-ai-2024',
        'A data-driven look at adoption, capability, and risk across the AI landscape.',
        true,
        128
    ),
    (
        'Series A Pitch Deck Teardown',
        'What great fundraising decks have in common',
        'Jane Founder',
        2023,
        'business',
        'finance',
        ARRAY['startup', 'fundraising', 'vc'],
        'pdf',
        'https://cdn.wit.id/decks/series-a-teardown.pdf',
        'Annotated breakdown of ten successful Series A decks and the narrative patterns they share.',
        true,
        342
    ),
    (
        'Designing for Accessibility',
        'Inclusive product design fundamentals',
        'Alex Designer',
        2024,
        'design',
        'software',
        ARRAY['a11y', 'ux', 'design-systems'],
        'gslides',
        'https://docs.google.com/presentation/d/sample-a11y',
        'Practical guidance on building products that work for everyone, with real-world examples.',
        false,
        57
    ),
    (
        'Go Concurrency Patterns',
        'Channels, goroutines, and beyond',
        'Sam Engineer',
        2022,
        'technology',
        'software',
        ARRAY['golang', 'concurrency', 'backend'],
        'embed',
        'https://speakerdeck.com/player/sample-go-concurrency',
        'An engineer-focused tour of idiomatic concurrency patterns in Go.',
        false,
        201
    )
ON CONFLICT DO NOTHING;
