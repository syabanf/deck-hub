-- 000017_demo_pin.down.sql
-- Removing the hash leaves the Demo Center with no PIN configured. The API
-- refuses to serve demos in that state rather than serving them ungated.
DELETE FROM app_settings WHERE key = 'demo_pin_hash';
