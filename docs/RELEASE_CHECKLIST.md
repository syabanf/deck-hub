# Release checklist

What to clear before pushing to `syabanf/deck-hub`, and before Primmie pulls
the images onto production.

CI runs the first section on every push and pull request, and the image build
does not start until it passes — so an image in the registry has already been
through it. Running it locally first is still faster than finding out from a
red workflow.

---

## 1. The gates (CI runs these)

```bash
# Backend. From backend/.
go vet ./...
go test ./... -count=1        # unit; the e2e and stress suites SKIP here
make docs                     # every mounted route is in openapi.yaml, and vice versa
make test-e2e                 # the real one: a real database, real HTTP

# Frontend. From the repository root, with Node 22 on PATH.
npm test
npm run build
```

> `go test ./...` prints `ok` for `test/e2e` and `test/stress` **without
> running them** when `E2E_DATABASE_URL` / `STRESS_DATABASE_URL` are unset.
> That is deliberate — they need a database they are allowed to wipe — but it
> means "all tests passed" from that command alone is not true. `make test-e2e`
> is the one that runs them.

`make test-e2e` wipes `wit_test`. It never touches `wit` or `wit_staging`.

Optional, when a change could affect throughput:

```bash
make stress                   # also wipes wit_test
```

---

## 2. Staging, opened and clicked through

```bash
./staging/staging.sh up       # http://localhost:8081
```

Staging is a production build behind the repository's own nginx: the bundle is
built with `VITE_API_URL=/api`, deep links are served by `try_files`, and the
API is proxied on the same origin. Every production bug this project has had
so far lived in the gap between `npm run dev` and that.

Click, at minimum:

- [ ] Open a **PDF** deck and page through it (the player, and `/uploads`).
- [ ] **Upload** a PDF with a cover image, then delete the deck again.
- [ ] **Share** a deck: copy the link, open it in a private window — it opens
      without a sign-in, which is the point.
- [ ] **Download** from the share menu — the file saves under its original
      name, not a UUID.
- [ ] **Demo Center**: PIN screen, correct PIN, copy a password.
- [ ] **Sign out and back in** — the Demo Center asks for the PIN again.
- [ ] **Settings → Activity**: everything above is listed against your account.
- [ ] At **375 px wide**: the header chips scroll, the Settings tabs scroll,
      the Users and Catalog tables scroll sideways rather than clipping their
      Actions column, and no page scrolls horizontally.

---

## 3. What must not be in the commit

```bash
git status --short
git diff --cached --stat
```

- [ ] No `.env`, `backend/.env`, `.env.staging` — all gitignored, keep it so.
- [ ] **No `*.local.sql`.** `backend/scripts/seed-demos.local.sql` is the demo
      credentials for live client systems. It is gitignored on purpose and
      moves to production over a private channel, never through the repository.
- [ ] No `dist/`, no `backend/bin/`, no `staging/.run/`.
- [ ] No credential in a comment, a fixture or a test. Search the diff for the
      obvious ones before pushing:
      ```bash
      git diff origin/main -- . ':!*.lock' | grep -inE 'password|secret|token|api[_-]?key' | grep '^+'
      ```

---

## 4. Migrations

- [ ] Every new migration has **both** an `.up.sql` and a `.down.sql`.
- [ ] `make test-e2e` passed — it rebuilds the schema from the migration
      directory, so a migration that does not apply cleanly fails there.
- [ ] If the migration renames or drops anything, say so in the PR. It makes
      the release non-reversible by image tag alone, and
      [`DEPLOY.md`](DEPLOY.md) tells Primmie to take a backup first.

---

## 5. Tag and hand over

```bash
git tag -a v0.2.0 -m 'What changed, in a sentence'
git push origin v0.2.0
```

CI publishes the images as `:0.2.0`, `:0.2` and `:sha-<sha>`.

**The git tag keeps its `v`; the image tag loses it.** `docker/metadata-action`
strips the prefix, because that is the convention for image tags — so the tag
you push is `v0.2.0` and the value Primmie puts in `IMAGE_TAG` is `0.2.0`.
Getting this wrong fails with `manifest unknown`, which reads like the image
was never built.

Give Primmie the image tag, not `latest`.

For the deploy itself, and for what has to be done once on a fresh install
(rotate the admin password, change the Demo Center PIN, load the demo seed),
see [`DEPLOY.md`](DEPLOY.md). For the backup to take first, see
[`BACKUP.md`](BACKUP.md).

---

## Standing checks, not per-release

Worth re-reading every few releases rather than every time:

- **The seeded secrets are still rotated in production.** The bootstrap admin
  password and the Demo Center PIN both ship with values that are in the
  repository. A fresh deploy that skipped [`DEPLOY.md`](DEPLOY.md) step 2 is
  running with `1234` in front of live client credentials.
- **Backups are being copied off the host, and one has been restored.** See
  [`BACKUP.md`](BACKUP.md).
- **`JWT_TTL`.** A token is re-checked against the account on every request, so
  a removed user is locked out immediately — but a *stolen* token is still good
  until it expires. 24h is the default; shorten it if that matters more than
  the sign-ins it costs.
