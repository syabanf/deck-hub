# Deploying to production

The runbook for `https://paparan.reddie.id`. Written for whoever is at the
console of the deploy host — today that is Primmie.

Everything here assumes the shape described in
[`docker-compose.ghcr.yml`](../docker-compose.ghcr.yml): four containers on one
host, images pulled from GHCR, Postgres and the uploads directory on named
volumes.

**Nothing is ever built on the production host.** CI builds the images when a
commit lands on `main` or a tag is pushed; the host only pulls them. If you
find yourself typing `docker build` on the server, stop — something upstream
has gone wrong and building locally will hide it.

---

## Contents

- [What is running](#what-is-running) · [Before the first deploy](#before-the-first-deploy)
- [First deploy](#first-deploy) · [After the first deploy](#after-the-first-deploy-do-not-skip)
- [Upgrading what is already there](#upgrading-the-installation-that-is-already-there)
- [Updating](#updating-to-a-new-version) · [Rolling back](#rolling-back)
- [Migrations](#migrations) · [Checking it works](#checking-it-works)
- [When something is wrong](#when-something-is-wrong) · [Do not do these](#do-not-do-these)

---

## What is running

| Container | Image | Listens | Reachable from |
| --- | --- | --- | --- |
| `frontend` | `…-frontend` | `8080` in the container, published on `${APP_PORT}` | the TLS terminator |
| `backend` | `…-backend` | `8080` | `frontend` only |
| `migrate` | `…-backend`, different entrypoint | — | runs once, then exits |
| `db` | `postgres:16-alpine` | `5432` | `backend` and `migrate` only |

Two networks. `public` carries the frontend; `private` is `internal: true`, so
the database has no route off the host at all — there is no published port to
firewall, because there is no published port.

The frontend container is nginx. It serves the built bundle and proxies
`/api/` to the backend, which is why the browser only ever talks to one origin
and CORS never enters into it in production.

**The containers speak plain HTTP.** TLS is terminated in front of them, by
whatever proxy already answers for `paparan.reddie.id`. That proxy needs to
pass a body of at least 30 MB and allow a slow transfer to take several
minutes — see [Uploads stall](#uploads-or-downloads-stall-partway) below.

---

## Before the first deploy

You need, on the host:

- Docker with the Compose plugin (`docker compose version`).
- Read access to `ghcr.io/syabanf/deck-hub-*`. The packages inherit the
  repository's visibility; for a private repository, log in first:
  ```bash
  echo "$GITHUB_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin
  ```
  The token needs `read:packages` and nothing else.
- A TLS terminator already answering for the domain, forwarding to
  `127.0.0.1:${APP_PORT}`.
- Somewhere to keep `.env`, readable only by the deploy user (`chmod 600`).

And a decision on five values that compose will refuse to start without.
They are listed with the reason each one is required in
[`.env.production.example`](../.env.production.example). Generate the secrets
on the host, not in a chat window:

```bash
openssl rand -hex 24     # DB_PASSWORD
openssl rand -base64 48  # JWT_SECRET  (must be at least 32 characters)
openssl rand -base64 18  # BOOTSTRAP_ADMIN_PASSWORD
```

`JWT_SECRET` is checked at boot: shorter than 32 characters and the API exits
with a message saying so, rather than starting with a key that can be guessed
offline from any token it ever issues.

---

## First deploy

```bash
# 1. Get the compose file and the template onto the host.
#    Only these two files are needed — not the source tree.
mkdir -p /opt/deck-hub && cd /opt/deck-hub
curl -fsSLO https://raw.githubusercontent.com/syabanf/deck-hub/main/docker-compose.ghcr.yml
curl -fsSLo .env https://raw.githubusercontent.com/syabanf/deck-hub/main/.env.production.example

# 2. Fill it in. Every REQUIRED line, and IMAGE_TAG pinned to a real version.
#    IMAGE_TAG=0.1.0 — no "v". The git tag is v0.1.0; the image tag built
#    from it is 0.1.0. A leading "v" here fails with "manifest unknown".
chmod 600 .env && $EDITOR .env

# 3. Pull and start. `migrate` runs first and the backend waits for it.
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d

# 4. Watch it come up. The migrate container should exit 0, not restart.
docker compose -f docker-compose.ghcr.yml ps
docker compose -f docker-compose.ghcr.yml logs -f backend
```

A healthy backend log ends with `HTTP server listening on :8080` and carries
no `SECURITY WARNING`. If it does carry one, `BOOTSTRAP_ADMIN_PASSWORD` did
not reach the container and the admin account still has the password published
in migration `000001` — fix that before the site is reachable.

---

## After the first deploy (do not skip)

Three things are seeded from the repository and are therefore public knowledge
until you change them.

**1. Sign in and change the admin password.** `BOOTSTRAP_ADMIN_PASSWORD`
rotates the seeded account at every boot, which means it is also sitting in
`.env` in clear. Sign in as `BOOTSTRAP_ADMIN_EMAIL`, then open the account
menu (the avatar, top right) → Settings → **Profile** → Change your password. Do the same for any other account created from a template.

**2. Change the Demo Center PIN.** It ships as `1234` — the bcrypt hash of it
is in migration `000017`, in the repository, readable by anyone who can read
the source. The Demo Center holds working credentials for client systems, so
this is the one that matters most.

> Settings → **Master Data** → Demo Center PIN → set a new one.
> The field is only rendered for an admin.

The PIN is stored hashed and can never be read back, only replaced. Tell the
people who need it out of band, not in the repository and not in a ticket.

**3. Load the demo credentials.** They are **not** in git and never will be —
`backend/scripts/seed-demos.local.sql` matches `*.local.sql` in `.gitignore`
precisely so that a file full of live passwords cannot be committed by
accident. Get the file from the team over a private channel, then:

```bash
# Copy it to the host first; do not pipe it through anything that logs.
docker compose -f docker-compose.ghcr.yml exec -T db \
  psql -U wit -d wit < seed-demos.local.sql

# Then remove it from the host.
shred -u seed-demos.local.sql   # or: rm -P on macOS
```

The script is idempotent: it inserts rows that are missing and updates the
ones that exist, matched on name. Running it twice does nothing the first run
did not already do.

**4. Check what is public.** Deck browsing is public by design — a shared link
opens a deck without a sign-in, which is the point of the share button. Users,
the activity log and the Demo Center are not: they need an account, and the
Demo Center needs the PIN as well.

---

---

## Upgrading the installation that is already there

`paparan.reddie.id` has been running since 18 August, and it did not get there
the way the section above describes. As of 2026-09-08 it is:

| | |
| --- | --- |
| Compose project | `deck-hub`, in `~/deck-hub` on WITServerUtama |
| Images | **built on the host**, not pulled from a registry |
| Database | `deck_hub` — not `wit` — at migration **9**, `dirty=false` |
| Data | 28 decks, 7 users, uploads volume **empty** |
| Public route | cloudflared tunnel → `localhost:8098` |
| Env | no `BOOTSTRAP_ADMIN_PASSWORD`, no `SMTP_HOST`, no `APP_BASE_URL` |
| Backup | none |

So this is a migration between two differently-shaped deployments, not an
update. Four things about it are worth knowing before touching anything.

**The dangerous move is bringing this compose file up in a new directory.**
Compose names volumes after the project, which is the directory name. Start
`docker-compose.ghcr.yml` in `/opt/deck-hub` and you get
`deck-hub_postgres_data` — a *different, empty* volume from whatever
`~/deck-hub` has been using. The site comes up looking perfect and completely
empty, the 28 decks are still safe in the old volume, and it reads exactly
like data loss. Nobody enjoys the twenty minutes that follow.

**The migration jump is 9 → 18.** Nine migrations run in one go, and between
them they add: the taxonomy master data the navigation is now built from, deck
cover images, application settings, deck ownership, the audit log, and the
Demo Center with its PIN. They only add — nothing in 10–18 drops a column that
existing data lives in.

**Postgres majors are not interchangeable.** A `PGDATA` directory written by
Postgres 15 will not start under 16; the container exits with "database files
are incompatible with server". Reusing the old volume means matching the old
major exactly. Dumping and restoring does not — `pg_dump` output loads into a
newer server fine, which is one of two reasons the procedure below dumps.

**The other reason is that there is no backup.** Taking one is the first step
whatever else happens, and restoring it into the new stack means the backup is
verified by having been used, rather than filed and hoped for.

### The procedure

Read [`BACKUP.md`](BACKUP.md) first. Set aside an hour; the site is down for
part of it, so pick a quiet time and tell people.

```bash
cd ~/deck-hub

# 1. Find out what is actually there. Write these down — the volume names and
#    the Postgres major are the two facts the rest depends on.
docker compose ps
docker volume ls | grep -i deck
docker compose exec -T db psql -U "$DB_USER" -d deck_hub -c 'select version()'
docker compose exec -T db psql -U "$DB_USER" -d deck_hub -c 'select * from schema_migrations'
```

```bash
# 2. Back up, twice over: a dump for restoring, and a copy of the whole volume
#    in case the dump turns out to be wrong.
mkdir -p ~/deck-hub-backup && cd ~/deck-hub-backup

docker compose -f ~/deck-hub/docker-compose.yml exec -T db \
  pg_dump -U "$DB_USER" -d deck_hub -Fc > deck_hub-preupgrade.dump

docker run --rm -v <old-postgres-volume>:/data:ro -v "$PWD":/backup \
  alpine:3.21 tar czf /backup/pgdata-preupgrade.tar.gz -C /data .

# Prove the dump is readable before relying on it.
docker run --rm -v "$PWD":/b:ro postgres:16-alpine \
  pg_restore --list /b/deck_hub-preupgrade.dump | head
```

```bash
# 3. Stop the old stack. Do NOT pass -v; the old volumes stay exactly where
#    they are, which is the whole point of doing it this way.
cd ~/deck-hub && docker compose down
```

```bash
# 4. New stack, new directory, new empty volumes — deliberately.
mkdir -p /opt/deck-hub && cd /opt/deck-hub
curl -fsSLO https://raw.githubusercontent.com/syabanf/deck-hub/main/docker-compose.ghcr.yml
curl -fsSLo .env https://raw.githubusercontent.com/syabanf/deck-hub/main/.env.production.example
chmod 600 .env && $EDITOR .env
```

For this host, `.env` needs these values in particular:

```ini
IMAGE_TAG=0.1.0                        # no "v"
APP_PORT=8098                          # cloudflared points here
DB_NAME=deck_hub                       # not the default "wit"
CORS_ORIGINS=https://paparan.reddie.id
APP_BASE_URL=https://paparan.reddie.id
DB_PASSWORD=<generate a new one>       # fresh volume, so this is a fresh password
JWT_SECRET=<openssl rand -base64 48>   # at least 32 characters
BOOTSTRAP_ADMIN_PASSWORD=<generate>    # compose refuses to start without it
SMTP_HOST=<your relay>                 # empty = nobody can finish signing up
```

`DB_PASSWORD` is free to be new because the volume is new: `POSTGRES_PASSWORD`
only takes effect when Postgres initialises an empty data directory. Restoring
a dump does not carry a password with it.

```bash
# 5. Bring up ONLY the database, so nothing writes while the restore runs.
docker compose -f docker-compose.ghcr.yml up -d db
docker compose -f docker-compose.ghcr.yml exec -T db \
  sh -c 'until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do sleep 1; done'

# 6. Restore. --no-owner because the roles in the dump need not exist here.
docker compose -f docker-compose.ghcr.yml exec -T db \
  pg_restore -U wit -d deck_hub --no-owner < ~/deck-hub-backup/deck_hub-preupgrade.dump

# 7. Check the data arrived, and that it still says migration 9.
docker compose -f docker-compose.ghcr.yml exec -T db psql -U wit -d deck_hub -c \
  'select (select count(*) from decks) decks, (select count(*) from users) users'
docker compose -f docker-compose.ghcr.yml exec -T db psql -U wit -d deck_hub -c \
  'select * from schema_migrations'
```

`pg_restore` will print notices about the `public` schema and about extensions
already existing. Those are expected. What matters is that step 7 shows 28
decks and 7 users.

```bash
# 8. Now the rest. `migrate` runs 10 → 18 before the backend starts.
docker compose -f docker-compose.ghcr.yml up -d
docker compose -f docker-compose.ghcr.yml logs migrate
docker compose -f docker-compose.ghcr.yml ps
```

The `migrate` container must show `Exited (0)`. If it restarts or exits
non-zero, stop and read its log before anything else — the backend will not
have started, so nothing is serving a half-migrated schema.

### After it is up

Everything in [After the first deploy](#after-the-first-deploy-do-not-skip)
applies — rotate the admin password, change the Demo Center PIN from `1234`,
load the demo seed. Plus three checks specific to this jump:

```bash
# The navigation is built from taxonomy master data now. This reports any
# category or industry a deck still refers to that the master list does not
# have — those decks would be unreachable from the header.
curl -fsS https://paparan.reddie.id/api/taxonomy/categories/unknown
curl -fsS https://paparan.reddie.id/api/taxonomy/industries/unknown
```

Both should return an empty list. The seed in migration `000010` is the same
list the frontend used to carry, so the 28 existing decks should already
match — but "should" is why the endpoint exists.

Then, signed in as an admin: open a deck, add one and delete it again, and
check Settings → Activity recorded all three against your account. The audit
log starts empty; it records from migration `000015` onwards, not backwards.

### If it goes wrong

The old volumes are untouched. Rolling back is putting the old stack back:

```bash
cd /opt/deck-hub && docker compose -f docker-compose.ghcr.yml down
cd ~/deck-hub && docker compose up -d
```

Which is the entire reason step 3 does not pass `-v`. Leave the old volumes in
place for at least a week after a successful upgrade, then remove them
deliberately rather than as part of the same session.

## Updating to a new version

```bash
cd /opt/deck-hub

# 1. Point at the new tag. Pin a version; never leave IMAGE_TAG=latest.
$EDITOR .env          # IMAGE_TAG=0.2.0   — no "v"; see the note below

# 2. Pull, then bring it up. Migrations run before the new backend starts.
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d

# 3. Confirm.
docker compose -f docker-compose.ghcr.yml ps
curl -fsS https://paparan.reddie.id/api/healthz
```

Take a database backup first — see [`BACKUP.md`](BACKUP.md). A migration that
drops or rewrites a column is not reversible by re-running the old image.

There is a gap of a few seconds while the new backend replaces the old one.
For a deployment this size that is the right trade; anyone mid-request sees
one failed call and a retry succeeds.

---

## Rolling back

The images are immutable and every one CI built is still in the registry, so a
rollback is choosing an older tag:

```bash
$EDITOR .env    # IMAGE_TAG=0.1.0, the version that was working
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

**This rolls back the code, not the database.** `golang-migrate` has already
applied the newer migrations and nothing here undoes them. An older backend
against a newer schema is usually fine — the migrations so far only add — but
if the release you are backing out of renamed or dropped anything, restore the
database from the backup you took before the update instead.

---

## Migrations

The `migrate` container runs `migrate … up` against the same database, and the
backend does not start until it has exited successfully. So the ordinary case
needs no thought: `up -d` migrates, then starts.

To see where the schema stands:

```bash
docker compose -f docker-compose.ghcr.yml exec -T db \
  psql -U wit -d wit -c 'select * from schema_migrations'
```

A `dirty` of `t` means a migration failed partway. Do not run `up` again on top
of it — find out what failed first (`docker compose … logs migrate`), fix the
cause, then force the version back to the last good one and re-run:

```bash
docker compose -f docker-compose.ghcr.yml run --rm --entrypoint /usr/local/bin/migrate \
  backend -path=/app/migrations \
  -database="postgres://wit:$DB_PASSWORD@db:5432/wit?sslmode=disable" force <last-good-version>
```

---

## Checking it works

After any deploy, in this order — each one fails differently:

```bash
# The API is alive and reachable through nginx and the TLS terminator.
curl -fsS https://paparan.reddie.id/api/healthz            # {"status":"ok"}

# The bundle is being served, not a 502 from the proxy.
curl -fsSI https://paparan.reddie.id/ | head -1            # HTTP/2 200

# The database has the catalog in it.
curl -fsS 'https://paparan.reddie.id/api/decks?limit=1' | head -c 200
```

Then in a browser, signed in as an admin:

1. Open a deck — a PDF one, so the player and `/uploads` are both exercised.
2. Add a deck by uploading a PDF, and delete it again.
3. Open the Demo Center, enter the PIN, copy a password.
4. Settings → Activity: the three things you just did are listed, with your
   account against them.

That last one is worth doing every time. The activity log is written by the
router, so if it is empty the middleware is not running and something more
fundamental than the log is wrong.

---

## When something is wrong

**The site loads but every call fails.** Almost always `CORS_ORIGINS`, and only
if something has been changed to make the browser talk to the API
cross-origin. In the normal same-origin setup nginx proxies `/api` and CORS is
not consulted at all — so if you see CORS errors, check the frontend image was
built with `VITE_API_URL=/api` (CI does this; a hand-built image may not).

**Nobody can finish signing up.** `SMTP_HOST` is empty, so verification links
are being printed into the backend log instead of sent. Read them with
`docker compose … logs backend | grep verify` as a stopgap, and set the SMTP
variables properly.

**Uploads or downloads stall partway.** A 25 MB deck takes minutes on a slow
link. The API allows five minutes and its nginx allows 300 seconds, but the
TLS terminator in front has its own timeouts and its own body-size limit —
raise `client_max_body_size` to at least 30 MB and the proxy read/send
timeouts to at least 300 seconds there too.

**A deleted user can still use the site.** They cannot, and have not been able
to since the account behind a token is re-read on every request. If you are
seeing it, you are looking at a browser that has not made a request yet — its
next one is refused.

**The Demo Center answers 429.** Five wrong PINs a minute per account and it
stops answering for a minute. That is the brute-force guard doing its job;
wait a minute.

**Everything is slow.** Check `docker stats` first, then the backend log — chi
logs every request with its duration, so a slow endpoint names itself.

---

## Do not do these

- **Do not run `docker compose down -v`.** `-v` deletes the named volumes,
  which is the database *and* every uploaded deck. There is no undo.
- **Do not commit `.env`, or `*.local.sql`.** Both are gitignored; keep it
  that way. The demo seed in particular is live credentials for other people's
  systems.
- **Do not publish a port for `db`.** It has none on purpose. Reach it with
  `docker compose exec`.
- **Do not leave `IMAGE_TAG=latest`.** You lose the ability to say what is
  running and the ability to roll back to it.
- **Do not put a `v` in `IMAGE_TAG`.** `0.1.0`, not `v0.1.0`. The git tag has
  the `v` and the image tag does not; the error for getting it wrong is
  `manifest unknown`, which looks like a build that never happened.
- **Do not build images on the host.** The registry is the record of what was
  deployed; a locally built image is not in it.
