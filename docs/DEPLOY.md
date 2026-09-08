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
# -U and -d are DB_USER and DB_NAME from .env — on the existing production
# host those are `deck` and `deck_hub`, not these defaults.
docker compose -f docker-compose.ghcr.yml exec -T db \
  psql -U wit -d wit < seed-demos.local.sql

# Then remove it from the host.
shred -u seed-demos.local.sql   # or: rm -P on macOS
```

The script is idempotent: it updates the rows that exist and inserts the ones
that do not, matched on name. Running it twice leaves 29 rows, not 58 — which
is worth stating because the first version of it did not, and the difference
only shows on the second run.

A demo retired in the app stays retired: `active` is set when a row is created
and never overwritten afterwards.

**4. Check what is public.** Deck browsing is public by design — a shared link
opens a deck without a sign-in, which is the point of the share button. Users,
the activity log and the Demo Center are not: they need an account, and the
Demo Center needs the PIN as well.

---

---

## Upgrading the installation that is already there

`paparan.reddie.id` has been running since 18 August, and it did not get there
the way the section above describes. Verified on the host, 2026-09-08/09:

| | |
| --- | --- |
| Compose project | `deck-hub`, in **`/home/wit/.openclaw/workspace/deck-hub`** |
| Services | `db`, `migrate`, `backend`, `frontend` — the same four as here |
| Images | **built on the host**, not pulled from a registry |
| Database | `deck_hub`, user **`deck`** — neither of them the default `wit` |
| Schema | migration **9**, `dirty=false`. 28 decks, 7 users |
| Postgres | **16.14 on Alpine** |
| Volumes | `deck-hub_postgres_data`, `deck-hub_uploads_data` (uploads empty) |
| Public route | cloudflared tunnel → `localhost:8098` |
| Env | no `BOOTSTRAP_ADMIN_PASSWORD`, no `SMTP_HOST`, no `APP_BASE_URL` |
| Backup | none |

Read that volume row twice, because it decides the whole procedure.

**The existing volumes are already named what this compose file would name
them.** Project `deck-hub` plus the volume keys declared here — `postgres_data`
and `uploads_data` — resolve to `deck-hub_postgres_data` and
`deck-hub_uploads_data`. The ones that are already there. So bringing this file
up under the project name `deck-hub` does not create anything fresh: it mounts
the live database.

That cuts both ways, and both are worth stating plainly.

It is *good*, because the existing Postgres is 16 and so is the image here, so
the data directory can simply be kept. No dump-and-restore dance, no window
where the data lives in a file instead of a database, and much less downtime.
That is the procedure below.

It is *dangerous* if you assume the opposite. A procedure that says "new
directory, fresh volumes, restore the dump into them" would, on this host,
restore a dump on top of a database that already has every one of those tables
— and the errors that follow are the good outcome. Compose does not warn you
that a volume already exists; it just attaches it.

Two consequences fall out of reusing the volume:

- **`DB_PASSWORD` must be the password the database already has.**
  `POSTGRES_PASSWORD` only does anything when Postgres initialises an empty
  data directory. On an existing one it is ignored, and a new value in `.env`
  means the backend cannot authenticate — for a database that is working
  perfectly. Read the existing value out of the old compose's env and carry it
  across; do not generate a new one.
- **`DB_USER=deck` and `DB_NAME=deck_hub`.** Both default to `wit` here. Get
  either wrong and the API connects to a database that does not exist, or to
  an empty one.

`JWT_SECRET` is the opposite: it can and should be new. Changing it invalidates
every token in circulation, which signs everyone out once and breaks nothing.

**The migration jump is 9 → 18.** Nine migrations in one go: the taxonomy
master data the navigation is now built from, deck cover images, application
settings, deck ownership, the audit log, and the Demo Center with its PIN. They
only add — nothing in 10–18 drops or renames a column that existing data lives
in.

**There is no backup.** That is the first step regardless, and it is what makes
every later step reversible.

### The procedure

Read [`BACKUP.md`](BACKUP.md) first. Pick a quiet hour and tell people: the
site is down from step 3 to step 6, which should be a few minutes.

```bash
cd /home/wit/.openclaw/workspace/deck-hub

# 1. Confirm the ground truth before changing anything. In particular: which
#    volume the db service actually mounts, and what DB_PASSWORD currently is.
docker compose ps
docker compose config | grep -A5 'volumes:'
docker compose config | grep -E 'POSTGRES_|DB_'
docker compose exec -T db psql -U deck -d deck_hub -c 'select * from schema_migrations'
```

The volume the `db` service mounts must be `deck-hub_postgres_data` at
`/var/lib/postgresql/data`. If it is mounted anywhere else, or from a host
path rather than a named volume, stop — the rest of this assumes it is not.

```bash
# 2. Back up. Two layers: a dump to restore from, and a copy of the whole
#    volume in case the dump turns out to be wrong.
mkdir -p ~/deck-hub-backup && cd ~/deck-hub-backup

docker compose -f /home/wit/.openclaw/workspace/deck-hub/docker-compose.yml \
  exec -T db pg_dump -U deck -d deck_hub -Fc > deck_hub-preupgrade.dump

docker run --rm -v deck-hub_postgres_data:/data:ro -v "$PWD":/backup \
  alpine:3.21 tar czf /backup/pgdata-preupgrade.tar.gz -C /data .

# A dump that cannot be read is not a backup. Prove it now.
docker run --rm -v "$PWD":/b:ro postgres:16-alpine \
  pg_restore --list /b/deck_hub-preupgrade.dump | head
```

```bash
# 3. Stop the old stack. NEVER with -v — that deletes the volumes this whole
#    procedure is built on keeping.
cd /home/wit/.openclaw/workspace/deck-hub
docker compose down
```

```bash
# 4. Put the new compose file in the SAME directory, so the project name stays
#    `deck-hub` and the existing volumes are the ones that get mounted.
#
#    `mv`, not `cp`: with no docker-compose.yml left in the directory, a bare
#    `docker compose up -d` typed by anyone later fails loudly instead of
#    quietly starting the old stack on top of a schema that has moved on.
#    The renamed file is the rollback.
mv docker-compose.yml docker-compose.yml.pre-0.1.0
curl -fsSLO https://raw.githubusercontent.com/syabanf/deck-hub/main/docker-compose.ghcr.yml
curl -fsSLo .env.new https://raw.githubusercontent.com/syabanf/deck-hub/main/.env.production.example
```

```bash
# 5. Fill in .env.new, then put it in place. Values specific to this host:
#
#   IMAGE_TAG=0.1.0                        no "v"
#   APP_PORT=8098                          cloudflared points here, not 8080
#   DB_USER=deck                           not the default "wit"
#   DB_NAME=deck_hub                       not the default "wit"
#   DB_PASSWORD=<the EXISTING password>    from step 1 — must not change
#   JWT_SECRET=<openssl rand -base64 48>   new is fine; signs everyone out once
#   BOOTSTRAP_ADMIN_PASSWORD=<generate>    compose refuses to start without it
#   SMTP_HOST=<your relay>                 empty = nobody can finish signing up
#   CORS_ORIGINS=https://paparan.reddie.id
#   APP_BASE_URL=https://paparan.reddie.id
#
cp .env .env.pre-0.1.0 2>/dev/null || true   # if the old stack had one
$EDITOR .env.new
mv .env.new .env && chmod 600 .env
```

```bash
# 6. Pull and start. `migrate` runs 9 → 18 and the backend waits for it.
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d

docker compose -f docker-compose.ghcr.yml ps
docker compose -f docker-compose.ghcr.yml logs migrate
```

`migrate` must show `Exited (0)`. If it restarted or exited non-zero, stop and
read its log — the backend will not have started, so nothing is serving a
half-migrated schema, and step 8 puts the old stack back.

```bash
# 7. The data is still the data.
docker compose -f docker-compose.ghcr.yml exec -T db psql -U deck -d deck_hub -c \
  'select (select count(*) from decks) decks, (select count(*) from users) users'
docker compose -f docker-compose.ghcr.yml exec -T db psql -U deck -d deck_hub -c \
  'select * from schema_migrations'
```

28 decks, 7 users, version 18, `dirty=false`.

```bash
# 8. Load the demo credentials. The file is not in git and arrives out of
#    band — see "After the first deploy" for why.
#
#    Note the flags: -U deck -d deck_hub. The generic instructions elsewhere
#    in this document say -U wit -d wit, which are the defaults and are both
#    wrong on this host.
docker compose -f docker-compose.ghcr.yml exec -T db \
  psql -U deck -d deck_hub < seed-demos.local.sql

# 29 rows, and 29 again if it is ever run a second time.
docker compose -f docker-compose.ghcr.yml exec -T db psql -U deck -d deck_hub -c \
  'select count(*) total, count(distinct name) unik from demos'

# Then remove it from the host.
shred -u seed-demos.local.sql
```

### After it is up

Everything in [After the first deploy](#after-the-first-deploy-do-not-skip)
applies — rotate the admin password, change the Demo Center PIN from `1234`,
load the demo seed. Plus one check specific to this jump:

```bash
# The navigation is built from taxonomy master data now. This reports any
# category or industry a deck still refers to that the master list does not
# have — those decks would exist but be unreachable from the header.
curl -fsS https://paparan.reddie.id/api/taxonomy/categories/unknown
curl -fsS https://paparan.reddie.id/api/taxonomy/industries/unknown
```

Both should return an empty list. The seed in migration `000010` is the same
list the frontend used to carry, so the 28 existing decks should already match
— but "should" is why the endpoint exists. Anything reported there is fixed by
adding the term in Settings → Master Data, not by editing decks.

Then, signed in as an admin: open a deck, add one and delete it again, and
check Settings → Activity recorded all three against your account. The audit
log starts empty — it records from migration `000015` forward, not backward.

### 9. If it goes wrong

The volume was never replaced, and the old compose file is still there:

```bash
cd /home/wit/.openclaw/workspace/deck-hub
docker compose -f docker-compose.ghcr.yml down          # again: no -v
cp .env.pre-0.1.0 .env 2>/dev/null
docker compose -f docker-compose.yml.pre-0.1.0 up -d
```

The migrations from 10 to 18 will have been applied and this does not undo
them. That is survivable, because all nine only add — the old backend selects
the columns it knows and ignores the rest. If the schema itself is the problem,
that is what step 2's dump is for: recreate the database and restore it, per
[`BACKUP.md`](BACKUP.md).

Keep both backups for at least a week after a successful upgrade.

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
