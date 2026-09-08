-- 000010_taxonomy_terms.down.sql
-- decks.category / industry / source_type are plain TEXT and never referenced
-- this table, so dropping it loses the titles and ordering but no deck data.
DROP TABLE IF EXISTS taxonomy_terms;
