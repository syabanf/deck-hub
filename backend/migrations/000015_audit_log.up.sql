-- 000015_audit_log.up.sql
-- Who changed what, and when.
--
-- Recorded from the router rather than from each handler: a handler that
-- forgets to write its own audit line leaves a gap nobody notices until they
-- go looking for it, and the gap is exactly where an unusual change would be.
--
-- Reads are not recorded. Every write is.
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL   PRIMARY KEY,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- The account that made the change. Nullable because a few writes are
    -- unauthenticated by design — registration, and the public view counter —
    -- and because an account can be deleted after the fact.
    actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Copied at the time, not joined at read time. An account removed later
    -- would otherwise erase its own history, which is the opposite of what a
    -- log is for.
    actor_email TEXT        NOT NULL DEFAULT '',
    actor_role  TEXT        NOT NULL DEFAULT '',

    action      TEXT        NOT NULL,  -- create | update | delete
    entity      TEXT        NOT NULL,  -- deck | user | taxonomy | settings | upload | auth
    entity_id   TEXT        NOT NULL DEFAULT '',

    -- The request as it was routed, e.g. "PUT /decks/{id}". The pattern rather
    -- than the URL, so ids do not have to be parsed back out of it.
    route       TEXT        NOT NULL DEFAULT '',
    status      INTEGER     NOT NULL DEFAULT 0,
    ip          TEXT        NOT NULL DEFAULT ''
);

-- The listing is always newest first, and the id breaks ties within a
-- timestamp so paging cannot repeat or skip a row.
CREATE INDEX IF NOT EXISTS audit_log_at_idx ON audit_log (at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity);
