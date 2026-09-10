-- 000011_drop_source_type_terms.down.sql
-- Widen the constraint again and restore the seeded source types. Any terms an
-- admin added before 000011 ran are not recoverable — the rows were deleted.
--
-- Wrapped in a guard because a down migration has to tolerate its table being
-- absent. golang-migrate runs these newest-first, and so do the test suites
-- when they reset the schema; a bare INSERT here fails at analysis time — not
-- at execution — so no IF EXISTS on the statement itself can save it. Whether
-- the table is there has to be asked before the statement is parsed at all.
DO $$
BEGIN
    IF to_regclass('public.taxonomy_terms') IS NULL THEN
        RETURN;
    END IF;

    ALTER TABLE taxonomy_terms DROP CONSTRAINT IF EXISTS taxonomy_terms_kind_check;
    ALTER TABLE taxonomy_terms
        ADD CONSTRAINT taxonomy_terms_kind_check CHECK (kind IN ('category', 'industry', 'source_type'));

    INSERT INTO taxonomy_terms (kind, slug, title, sort_order) VALUES
        ('source_type', 'pdf',     'PDF document',   10),
        ('source_type', 'gslides', 'Google Slides',  20),
        ('source_type', 'url',     'Link',           30),
        ('source_type', 'video',   'Video',          40),
        ('source_type', 'embed',   'Embed / iframe', 50)
    ON CONFLICT (kind, slug) DO NOTHING;
END $$;
