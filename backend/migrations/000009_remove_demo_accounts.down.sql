-- 000009_remove_demo_accounts.down.sql
--
-- Rolling back means wanting the demo accounts again, which is what
-- `make seed-demo` does. Re-inserting them here would put published credentials
-- back into whatever database the rollback runs against — including production.
-- Down is intentionally a no-op.
SELECT 1;
