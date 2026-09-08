-- 000018_demo_fields.up.sql
-- Match the columns the team already keeps this list in.
--
-- `product` becomes `category`, because that is what the existing sheet calls
-- it and the values are things like "Shopfloor" and "Human Resources" — the
-- kind of work the demo shows, not a product name.
--
-- `environment` and `status` are new and were being tracked already. They
-- matter for different reasons: environment says how freely a demo may be
-- shown (Confidential is not the same as Demo WIT), and status says whether it
-- works today. Folding either into `active` would lose the distinction between
-- "do not show this to a client" and "this is broken right now".
ALTER TABLE demos RENAME COLUMN product TO category;
ALTER TABLE demos ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT '';
ALTER TABLE demos ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT '';
