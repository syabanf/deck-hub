-- 000011_drop_source_type_terms.up.sql
-- Source types are not master data, and putting them on an admin screen said
-- otherwise.
--
-- A category or an industry is a label: add one and the catalog files decks
-- under it immediately. A source type is a rendering contract — 'pdf' means
-- pdf.js, 'video' means the media element, 'gslides' and 'embed' mean an
-- iframe with their own URL rules. Adding a sixth through a form produces
-- decks the player has no branch for, and the failure surfaces at playback to
-- a viewer rather than at creation to the person who caused it.
--
-- The list still exists; it lives in domain.SourceTypes, next to the code that
-- has to change with it.

DELETE FROM taxonomy_terms WHERE kind = 'source_type';

-- Narrow the constraint so the kind cannot come back by accident. Dropping and
-- re-adding is the only way to change a CHECK in PostgreSQL.
ALTER TABLE taxonomy_terms DROP CONSTRAINT IF EXISTS taxonomy_terms_kind_check;
ALTER TABLE taxonomy_terms
    ADD CONSTRAINT taxonomy_terms_kind_check CHECK (kind IN ('category', 'industry'));
