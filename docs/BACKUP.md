# Backup and restore

Two things on the production host cannot be rebuilt from the repository, and
losing either one loses the site:

| What | Where it lives | Losing it means |
| --- | --- | --- |
| The database | volume `postgres_data` | Every deck, account, demo credential, favourite and activity entry is gone |
| The uploaded files | volume `uploads_data` | Every deck that was uploaded rather than linked shows a broken player |

They have to be backed up **together**. A database referring to files that are
no longer there is a catalog of dead links; files with no database are a
directory of UUIDs nobody can name.

Everything else — images, compose file, migrations — comes back from the
registry and from git. `.env` is the exception: it is not in git, so keep a
copy somewhere a person can reach without the server.

---

## Where the volumes actually are

On `paparan.reddie.id` the compose project lives in
**`/home/wit/.openclaw/workspace/deck-hub`** — not `/opt/deck-hub`, which does
not exist there (read it off a running container's
`com.docker.compose.project.working_dir` label if in doubt). Every `cd` below
means that directory.

Compose prefixes volume names with the project, which is the directory name
unless you set one. From a directory called `deck-hub` that makes them
`deck-hub_postgres_data` and `deck-hub_uploads_data`. Confirm rather than
assume:

```bash
cd /home/wit/.openclaw/workspace/deck-hub
docker compose -f docker-compose.ghcr.yml config --volumes   # postgres_data, uploads_data
docker volume ls | grep deck-hub
```

### Database user and name

The commands here never spell out the database user or name. They read
`$POSTGRES_USER` and `$POSTGRES_DB` inside the `db` container, which compose
sets from `DB_USER` and `DB_NAME` in `.env` — so they are right on any host.
On this one they are `deck` and `deck_hub`, not the `wit`/`wit` defaults;
a script that hard-codes `-U wit -d wit` fails there with `role "wit" does not
exist`.

---

## Taking a backup

Run this before every deploy, and on a schedule. It is safe to run while the
site is up: `pg_dump` takes a consistent snapshot, and the uploads directory is
append-only in practice — a file is written once under a fresh UUID and never
rewritten.

```bash
#!/usr/bin/env bash
# backup.sh, kept next to docker-compose.ghcr.yml — database + uploads, one
# timestamped pair.
set -euo pipefail

cd "$(dirname "$0")"
# The deploy user cannot write /var/backups (root's), so the default is under
# its own home. Override with BACKUP_DIR.
DEST="${BACKUP_DIR:-$HOME/backups/deck-hub}"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$DEST"

# Database. Custom format (-Fc): compressed, and restorable selectively.
# User and name come from the container's own env — see above.
docker compose -f docker-compose.ghcr.yml exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DEST/db-$STAMP.dump"

# Uploads. Read straight off the volume through a throwaway container, so
# nothing depends on the backend being up. The container runs as root, so the
# archive is handed back to whoever ran the script.
docker run --rm \
  -v deck-hub_uploads_data:/data:ro \
  -v "$DEST":/backup \
  alpine:3.21 sh -c "tar czf /backup/uploads-$STAMP.tar.gz -C /data . \
    && chown $(id -u):$(id -g) /backup/uploads-$STAMP.tar.gz"

# A dump that cannot be read is not a backup. Fail loudly, now, not in six
# months when it is needed.
docker run --rm -v "$DEST":/b:ro postgres:16-alpine \
  pg_restore --list "/b/db-$STAMP.dump" > /dev/null

echo "$STAMP ok  $(du -sh "$DEST/db-$STAMP.dump" "$DEST/uploads-$STAMP.tar.gz" | tr '\n' ' ')"
```

```bash
chmod 700 /home/wit/.openclaw/workspace/deck-hub/backup.sh
```

The dump contains every demo credential in clear — that is the whole point of
the Demo Center — so the backup directory is as sensitive as the database:

```bash
chmod 700 /home/wit/backups/deck-hub
```

### On a schedule

```cron
# Daily at 02:15 UTC, keeping 30 days.
15 2 * * * /home/wit/.openclaw/workspace/deck-hub/backup.sh >> /home/wit/backups/deck-hub/backup.log 2>&1
30 3 * * * find /home/wit/backups/deck-hub -type f -name '*-*Z.*' -mtime +30 -delete
```

**Copy them off the host.** A backup on the same disk as the thing it backs up
survives a mistake and nothing else. `rsync` or `rclone` to another machine or
to object storage, and check that the copy arrives — a silent sync failure
looks exactly like a working one.

---

## Restoring

### The database

This replaces the live data. Stop the application first so nothing writes
while the restore is in progress.

```bash
cd /home/wit/.openclaw/workspace/deck-hub

# 1. Stop everything that talks to the database, but leave the database up.
docker compose -f docker-compose.ghcr.yml stop frontend backend

# 2. Drop and recreate the schema, then load the dump into it.
docker compose -f docker-compose.ghcr.yml exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE $POSTGRES_DB WITH (FORCE)"'
docker compose -f docker-compose.ghcr.yml exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER"'
docker compose -f docker-compose.ghcr.yml exec -T db \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' \
  < /home/wit/backups/deck-hub/db-<STAMP>.dump

# 3. Start again. `migrate` re-runs and applies anything the dump predates.
docker compose -f docker-compose.ghcr.yml up -d
```

`DROP DATABASE … WITH (FORCE)` needs Postgres 13 or newer; the image is 16, so
it is available. It disconnects anything still attached rather than failing
with "database is being accessed by other users".

### The uploads

```bash
docker compose -f docker-compose.ghcr.yml stop backend

docker run --rm \
  -v deck-hub_uploads_data:/data \
  -v /home/wit/backups/deck-hub:/backup:ro \
  alpine:3.21 sh -c 'rm -rf /data/* && tar xzf /backup/uploads-<STAMP>.tar.gz -C /data'

docker compose -f docker-compose.ghcr.yml start backend
```

Restore the **matching pair**. A database from Tuesday with files from Monday
means every deck uploaded on Tuesday is a broken link, and nothing in the app
will tell you which ones.

### After any restore

```bash
curl -fsS https://paparan.reddie.id/api/healthz
```

Then, signed in: open an uploaded PDF deck (proves database and files agree),
check Settings → Users lists who you expect, and open the Demo Center. If the
PIN was changed after the backup was taken, it is now back to whatever it was
at backup time — set it again.

---

## Practising it

A restore that has never been tried is a plan, not a backup. Once, and again
after any change to this file, restore a recent dump into a throwaway database
and confirm the row counts look right:

```bash
docker compose -f docker-compose.ghcr.yml exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE restore_test OWNER $POSTGRES_USER"'
docker compose -f docker-compose.ghcr.yml exec -T db \
  sh -c 'pg_restore -U "$POSTGRES_USER" -d restore_test --no-owner' \
  < /home/wit/backups/deck-hub/db-<STAMP>.dump
docker compose -f docker-compose.ghcr.yml exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d restore_test -c "
    select (select count(*) from decks) decks,
           (select count(*) from users) users,
           (select count(*) from demos) demos"'
docker compose -f docker-compose.ghcr.yml exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE restore_test"'
```

---

## What is *not* backed up here, and why

- **Images.** They are in GHCR, immutable, tagged. Pull them again.
- **The activity log.** It is a table in the same database, so it is covered —
  worth knowing that it is, since it is the only record of who changed what.
- **Browser-side state** (bookmarks kept by a guest, dismissed tour). It lives
  in the visitor's own `localStorage` and never reaches the server.
- **`.env`.** Not in git and not in the volumes. Keep a copy off the host, and
  remember it holds `JWT_SECRET`: restoring a different one signs everybody out
  but breaks nothing else.
