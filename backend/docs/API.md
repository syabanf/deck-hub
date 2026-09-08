# WIT API

Quick reference with runnable examples. The authoritative contract is
[`openapi.yaml`](openapi.yaml) — it is checked against the router by
`test/docs`, so it cannot drift without the build going red.

```bash
make docs        # verify the spec matches the mounted routes
```

**Browsable version:** the running API serves it at
[`/docs`](http://localhost:8080/docs), with the raw contract at
[`/openapi.yaml`](http://localhost:8080/openapi.yaml) for client generators and
Postman/Insomnia imports. Both are compiled into the binary, so they always
describe the server you are talking to.

Base URL in development: `http://localhost:8080`.

## Contents

- [Authentication](#authentication) · [Roles](#roles) · [Errors](#errors)
- [Paging](#paging)
- [Decks](#decks) · [Favorites](#favorites) · [Continue watching](#continue-watching) · [Users](#users) · [Uploads](#uploads)

---

## Authentication

`POST /auth/login` returns a JWT (HS256, 24h by default — set `JWT_TTL`).

```bash
curl -s localhost:8080/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@wit.id","password":"admin1234"}'
```

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "id": "…", "name": "WIT Admin", "email": "admin@wit.id", "role": "admin", "status": "active" }
}
```

Send it on every authenticated call:

```bash
TOKEN=$(curl -s localhost:8080/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@wit.id","password":"admin1234"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')

curl -s localhost:8080/decks -H "Authorization: Bearer $TOKEN"
```

A wrong password, an unknown email and a suspended account all return the same
401. Telling them apart would confirm which addresses have accounts.

A 401 on an authenticated call also covers a case that is not about the token
at all: **the account behind it is gone or suspended.** Every authenticated
request re-reads that account, and the role that decides the request is the one
in the database, not the one in the token — otherwise removing a user would do
nothing until their token expired, a full day at the default `JWT_TTL`. So a
client cannot assume that signing in again will fix a 401.

### Demo accounts

Migration `000009` removed the seeded demo accounts: they carried passwords
published in this repository and were found live in production. They are opt-in
now, for local development only:

```bash
make seed-demo    # admin@wit.id / editor@wit.id / viewer@wit.id
```

The bootstrap admin from `000001` is deliberately still there — deleting it
would lock a running deployment out of its own admin screen — and its password
is rotated at startup from `BOOTSTRAP_ADMIN_PASSWORD`.

## Roles

Enforced at the router, so an unauthorized call never reaches a handler.

| Endpoint group        | Read                     | Write                |
|-----------------------|--------------------------|----------------------|
| `/decks`              | public                   | `admin`, `editor`    |
| `/taxonomy/{kind}`    | public                   | `admin`              |
| `/settings`           | public                   | `admin`              |
| `/uploads`            | public (the stored files) | `admin`, `editor`   |
| `/users`              | `admin`                  | `admin`              |
| `/audit`              | `admin`                  | —                    |
| `/demos`              | any signed-in user **+ PIN** | `admin`, `editor` **+ PIN** |
| `/demos/pin`          | —                        | `admin` (no PIN)     |
| `/me`                 | the account itself       | the account itself   |
| `/favorites`          | any signed-in user (scoped to them) | |
| `/progress`           | any signed-in user (scoped to them) | |

`/users` reads used to be public. They return every account's email and role,
which is the target list an attacker wants before guessing a single password.

`POST /decks/{id}/views` is public and unauthenticated — view counts are a
global signal, not per-user history.

The Demo Center needs both an account and the shared PIN, in `X-Demo-Pin`, on
every call. Wrong PINs are counted: five a minute per account, then `429`.
Setting a new PIN is admin-only and deliberately *not* behind the PIN — that
is how a forgotten one gets replaced.

## Errors

One envelope everywhere, so clients branch on `code` and never parse prose:

```json
{ "error": { "code": "not_found", "message": "deck not found" } }
```

| `code`          | Status | Meaning                                     |
|-----------------|--------|---------------------------------------------|
| `invalid_input` | 400    | Malformed body, bad UUID, failed validation |
| `unauthorized`  | 401    | Missing, malformed, or expired token        |
| `forbidden`     | 403    | Authenticated, but the role isn't allowed   |
| `not_found`     | 404    | No such resource                            |
| `conflict`      | 409    | Email already registered                    |
| `rate_limited`  | 429    | Too many attempts; `Retry-After` says when  |
| `internal`      | 500    | Unexpected server-side failure              |

Two 401s carry their own codes because the fix is different. `email_not_verified`
means the password was right and the address is not confirmed — the client shows
"check your inbox" with a resend button. `demo_pin_required` means the session is
fine and the Demo Center PIN is missing or wrong — the client shows the PIN
screen instead of signing the person out.

`message` is written for developers. Render your own copy keyed off `code` — the
frontend does this in `src/lib/errors.js`.

## Paging

`GET /decks` is **always paged**. Omitting `limit` applies the default of 50
rather than returning the catalog; the ceiling is 200 and larger values are
clamped, not rejected.

The body stays a plain array. Paging metadata rides in headers:

| Header          | Meaning                                       |
|-----------------|-----------------------------------------------|
| `X-Total-Count` | Rows matching the filter, ignoring paging     |
| `X-Limit`       | Page size actually applied, after clamping    |
| `X-Offset`      | Offset echoed back                            |

They are in the CORS `Access-Control-Expose-Headers`; a browser hides response
headers from JavaScript otherwise.

```bash
curl -sD- -o /dev/null 'localhost:8080/decks?limit=20&offset=40' | grep -i '^x-'
```

Why it matters: at 73k decks an unbounded response was 25.1 MB and served
34 req/s. The same call paged is 0.017 MB at ~2,500 req/s.

Every ordering is tie-broken by `id`. Without that, rows sharing a sort key can
reorder between pages and a paging client silently skips or repeats them.

## Decks

### List

```bash
curl -s 'localhost:8080/decks?category=engineering&sort=views&limit=5'
```

| Query        | Notes                                                        |
|--------------|--------------------------------------------------------------|
| `search`     | Case-insensitive substring over title/subtitle/author/description |
| `category`   | Category id, e.g. `engineering`                              |
| `industry`   | Industry id, e.g. `tech`                                     |
| `sourceType` | `pdf` · `url` · `video` · `gslides` · `embed`                |
| `featured`   | `true` / `false`                                             |
| `sort`       | `newest` (default) · `oldest` · `views` · `title`            |
| `limit`      | 1–200, default 50                                            |
| `offset`     | Default 0                                                    |
| `ids`        | Comma-separated ids, max 200 — see below                     |

**`ids` hydrates a known set** (favourites, continue-watching) without listing
the catalog:

```bash
curl -s "localhost:8080/decks?ids=$ID_A,$ID_B"
```

A present-but-empty `ids=` returns `[]`, *not* a full listing — a client
building `?ids=${ids.join(',')}` from an empty array must not accidentally
receive the whole catalog.

### Aggregates

```bash
curl -s localhost:8080/decks/stats
```

```json
{ "total": 69, "featured": 6, "totalViews": 13397,
  "byCategory": { "engineering": 12 }, "byIndustry": { "tech": 16 } }
```

Exists so a browse screen can show "16 decks in Technology" without downloading
any decks.

### Create · update · delete

```bash
curl -s localhost:8080/decks -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Series A Teardown","category":"iconic","industry":"finance",
       "source":{"type":"url","value":"https://example.com/deck"}}'
```

`PUT /decks/{id}` is a **partial** update — omitted fields are left untouched,
so two clients editing different fields don't clobber each other:

```bash
curl -s -X PUT localhost:8080/decks/$ID -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"subtitle":"Updated subtitle"}'
```

`source.value` is stored **verbatim**. A YouTube watch URL stays a watch URL and
an upload stays a server-relative `/uploads/...` path. If your client rewrites it
for playback (embed URLs, absolute URLs), do not write the rewritten form back —
that pins the deck to one origin and loses the canonical link.

`DELETE /decks/{id}` returns `204`. Favourite rows referencing the deck go with
it (`ON DELETE CASCADE`).

## Favorites

"My Library". Always scoped to the token's user — there is no way to read
someone else's. Any role may have favourites, including `viewer`.

```bash
curl -s localhost:8080/favorites -H "Authorization: Bearer $TOKEN"
# {"deckIds":["…","…"]}

curl -s -X PUT    localhost:8080/favorites/$ID -H "Authorization: Bearer $TOKEN"   # 204
curl -s -X DELETE localhost:8080/favorites/$ID -H "Authorization: Bearer $TOKEN"   # 204
```

Both writes are idempotent. The list returns ids only — hydrate them with
`GET /decks?ids=`.

## Continue watching

Per-user resume positions. Private to the token's user — distinct from
`viewCount`, which is a public popularity counter anyone can increment.

```bash
curl -s localhost:8080/progress -H "Authorization: Bearer $TOKEN"
# {"items":[{"deckId":"…","currentSlide":7,"totalSlides":24,"viewedAt":"…"}]}

curl -s -X PUT localhost:8080/progress/$ID -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"currentSlide":7,"totalSlides":24}'   # 204

curl -s -X DELETE localhost:8080/progress/$ID -H "Authorization: Bearer $TOKEN"  # 204
```

`viewedAt` is stamped server-side — a wrong or hostile client clock would
otherwise control the ordering of the shelf. Out-of-range positions are clamped
rather than rejected: the player sends this fire-and-forget and never waits on
the response, so a rejection would be invisible anyway.

Capped at the 50 most recent. Returns deck ids only; hydrate with
`GET /decks?ids=`.

## Users

Reads are public and never include password hashes. Mutations require `admin`;
there is no public registration.

```bash
curl -s localhost:8080/users
curl -s localhost:8080/users -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada","email":"ada@wit.id","password":"secret123","role":"editor"}'
```

Emails are unique case-insensitively; a duplicate is a `409`.

## Uploads

`multipart/form-data`, one `file` part, capped at 25 MB (`UPLOAD_MAX_BYTES`).
Allowed: `.pdf .mp4 .webm .mov .m4v .png .jpg .jpeg .gif .webp`.

```bash
curl -s localhost:8080/uploads -H "Authorization: Bearer $TOKEN" -F file=@deck.pdf
# {"url":"/uploads/8f14e45f-….pdf","name":"deck.pdf","size":184320,"contentType":"application/pdf"}
```

The stored filename is a generated UUID plus the extension — the client's
filename never becomes part of the path, so it cannot traverse directories or
overwrite an existing file. `name` is the *stored* filename, not the one you uploaded — your filename is never persisted anywhere.

Persist the returned `url` (server-relative) on the deck rather than an absolute
one, so stored decks survive an origin change.

Files are served publicly at `GET /uploads/{path}` so decks can reference their
own assets without a token. Traversal is rejected:
`/uploads/../../etc/passwd` is a 404.
