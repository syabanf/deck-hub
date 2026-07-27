-- 000006_seed_team_accounts.down.sql
-- Remove the per-role team accounts. Matched by email so a manually-created
-- account with the same role is left alone.

DELETE FROM users
WHERE email IN ('lead-admin@wit.id', 'lead-editor@wit.id', 'lead-viewer@wit.id');
