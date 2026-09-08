-- 000015_audit_log.down.sql
-- Dropping this destroys the record of who changed what. There is no copy.
DROP TABLE IF EXISTS audit_log;
