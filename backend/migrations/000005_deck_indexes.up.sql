-- 000005_deck_indexes.up.sql
-- Indexes for the two deck queries that were doing full table scans.
--
-- Both were invisible at seed size (~300 rows) and only showed up under load
-- against a 61k-row table. Measured with EXPLAIN (ANALYZE) at that size:
--
--   ORDER BY created_at DESC LIMIT 50
--     before: Parallel Seq Scan + top-N heapsort, 1431 buffers,  13.655 ms
--     after:  Index Scan,                            52 buffers,   0.044 ms
--
--   title/subtitle/author/description ILIKE '%q%'
--     before: Seq Scan,                                            9.459 ms
--     after:  BitmapOr over 4 trigram indexes,                     0.063 ms

-- ---------------------------------------------------------------------------
-- Sort key
-- ---------------------------------------------------------------------------
-- Every list query ends in ORDER BY created_at DESC, including the unfiltered
-- one the home page issues. Without this the planner sorts the entire table to
-- return the first page.
CREATE INDEX IF NOT EXISTS decks_created_at_idx ON decks (created_at DESC);

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------
-- A leading-wildcard ILIKE ('%term%') can never use a btree index, so search
-- always scanned every row. Trigram GIN indexes handle leading wildcards.
--
-- One index per column rather than one over the concatenation: the repository
-- ORs the four columns separately, and the planner combines per-column indexes
-- with a BitmapOr. An index on title||subtitle||… would be ignored unless the
-- query were rewritten to match that exact expression.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS decks_title_trgm_idx       ON decks USING gin (title       gin_trgm_ops);
CREATE INDEX IF NOT EXISTS decks_subtitle_trgm_idx    ON decks USING gin (subtitle    gin_trgm_ops);
CREATE INDEX IF NOT EXISTS decks_author_trgm_idx      ON decks USING gin (author      gin_trgm_ops);
CREATE INDEX IF NOT EXISTS decks_description_trgm_idx ON decks USING gin (description gin_trgm_ops);

-- Deliberately NOT added: a composite (category, created_at DESC). It was
-- tested at 61k rows and the planner kept choosing the existing
-- decks_category_idx, so it would be dead weight on every write.
