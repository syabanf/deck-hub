-- 000017_demo_pin.up.sql
-- A shared PIN in front of the Demo Center.
--
-- Stored as a bcrypt hash, unlike the demo passwords themselves. The
-- difference is what each one is for: a demo password is copied into another
-- system's login form, so it has to come back out readable, while this one is
-- only ever compared against what somebody typed. Nothing needs to read it,
-- so nothing can.
--
-- Which also means it cannot be shown in Settings later — only replaced. That
-- is the trade for a gate that a database backup does not hand over.
--
-- The hash below is of the PIN this shipped with. Change it in Settings; the
-- one in a migration is published in the repository, exactly like the seeded
-- admin password in 000001.
INSERT INTO app_settings (key, value) VALUES ('demo_pin_hash', '$2a$10$PovQJUjP11B92ixuItyVWOWmSwNvAA.BWnv1IPvy24W4biS549O0e')
ON CONFLICT (key) DO NOTHING;
