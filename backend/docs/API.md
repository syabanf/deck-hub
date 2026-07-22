# WIT API

Quick reference with runnable examples. The authoritative contract is
[`openapi.yaml`](openapi.yaml) — it is checked against the router by
`test/docs`, so it cannot drift without the build going red.

```bash
make docs        # verify the spec matches the mounted routes
```

Base URL in development: `http://localhost:8080`.

## Contents

- [Authentication](#authentication) · [Roles](#roles) · [Errors](#errors)
- [Paging](#paging)
- [Decks](#decks) · [Favorites](#favorites) · [Users](#users) · [Uploads](#uploads)

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

### Demo accounts

Seeded by migrations `000001` and `000003`, for local development only.

| Email           | Password     | Role     |
|-----------------|--------------|----------|
| `admin@wit.id`  | `admin1234`  | `admin`  |
| `editor@wit.id` | `editor1234` | `editor` |
| `viewer@wit.id` | `viewer1234` | `viewer` |

## Roles

Enforced at the router, so an unauthorized call never reaches a handler.

| Endpoint group        | Read     | Write                |
|-----------------------|----------|----------------------|
| `/decks`              | public   | `admin`, `editor`    |
| `/users`              | public   | `admin`              |
| `/uploads`            | public   | `admin`, `editor`    |
| `/favorites`          | any signed-in user (scoped to them) |

`POST /decks/{id}/views` is public and unauthenticated — view counts are a
global signal, not per-user history.

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
| `internal`      | 500    | Unexpected server-side failure              |

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
overwrite an existing file. `name` is echoed back for display only.

Persist the returned `url` (server-relative) on the deck rather than an absolute
one, so stored decks survive an origin change.

Files are served publicly at `GET /uploads/{path}` so decks can reference their
own assets without a token. Traversal is rejected:
`/uploads/../../etc/passwd` is a 404.
