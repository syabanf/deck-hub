-- 000011_drop_source_type_terms.down.sql
-- Widen the constraint again and restore the seeded source types. Any terms an
-- admin added before 000011 ran are not recoverable — the rows were deleted.
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
