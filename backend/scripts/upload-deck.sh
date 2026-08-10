#!/usr/bin/env bash
#
# Upload a file and publish it as a deck, in one command.
#
# The API needs three calls to do this — sign in, POST /uploads, POST /decks —
# and the second and third are easy to get wrong by hand: the upload returns a
# server-relative path that has to be passed through verbatim, and a deck
# created with the wrong source type plays as the wrong thing.
#
# Works against any environment. Everything is a plain curl underneath, so
# nothing here can do something the API would not.
#
#   ./scripts/upload-deck.sh deck.pdf
#   ./scripts/upload-deck.sh deck.pdf --title "Q4 Review" --category iconic
#   API=https://deckflix.wit.id/api ./scripts/upload-deck.sh deck.pdf
#
set -euo pipefail

API="${API:-http://localhost:8080}"
EMAIL="${EMAIL:-admin@wit.id}"
PASSWORD="${PASSWORD:-admin1234}"

FILE=""
TITLE=""
CATEGORY="mine"
INDUSTRY=""
AUTHOR=""

die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
say() { printf '  %s\n' "$*"; }

usage() {
  cat <<USAGE
Upload a file and publish it as a deck.

  ./scripts/upload-deck.sh <file> [options]

Options
  --title <t>      Deck title. Defaults to the filename without its extension.
  --category <c>   company-profile | iconic | design | engineering | strategy |
                   keynotes | mine   (default: mine)
  --industry <i>   tech, finance, healthcare, … (optional)
  --author <a>     Shown on the card (optional)

Environment
  API              Base URL          (default: $API)
  EMAIL PASSWORD   Credentials       (default: $EMAIL)

Accepted files
  .pdf .mp4 .webm .mov .m4v .png .jpg .jpeg .gif .webp   — up to 25 MB

Examples
  ./scripts/upload-deck.sh slides.pdf --title "Q4 Review" --category iconic
  API=https://deckflix.wit.id/api EMAIL=editor@wit.id PASSWORD=… \\
    ./scripts/upload-deck.sh demo.mp4
USAGE
}

[ $# -eq 0 ] && { usage; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --title)    TITLE="${2:-}";    shift 2 ;;
    --category) CATEGORY="${2:-}"; shift 2 ;;
    --industry) INDUSTRY="${2:-}"; shift 2 ;;
    --author)   AUTHOR="${2:-}";   shift 2 ;;
    -*) die "unknown option: $1" ;;
    *)  FILE="$1"; shift ;;
  esac
done

[ -n "$FILE" ] || die "no file given — see --help"
[ -f "$FILE" ] || die "no such file: $FILE"
[ -s "$FILE" ] || die "$FILE is empty — the server rejects zero-byte uploads, because they produce a deck that can never render"

# Check the extension here rather than letting the server 400 after the whole
# file has crossed the wire.
EXT="$(printf '%s' "${FILE##*.}" | tr '[:upper:]' '[:lower:]')"
case "$EXT" in
  pdf|mp4|webm|mov|m4v|png|jpg|jpeg|gif|webp) ;;
  *) die ".$EXT is not accepted — allowed: pdf mp4 webm mov m4v png jpg jpeg gif webp" ;;
esac

# The player picks its renderer from this, so it decides whether the deck opens
# as a document or a video.
case "$EXT" in
  pdf)                       SOURCE_TYPE="pdf" ;;
  mp4|webm|mov|m4v)          SOURCE_TYPE="video" ;;
  *)                         SOURCE_TYPE="url" ;;   # images: shown as-is
esac

if [ -z "$TITLE" ]; then
  TITLE="$(basename "$FILE")"
  TITLE="${TITLE%.*}"
fi

command -v curl   >/dev/null || die "curl is required"
command -v python3 >/dev/null || die "python3 is required (used to read JSON)"

json() { python3 -c 'import json,sys
try: print(json.load(sys.stdin).get(sys.argv[1], ""))
except Exception: print("")' "$1"; }

err_of() { python3 -c 'import json,sys
try: print(json.load(sys.stdin)["error"]["message"])
except Exception: print("")' 2>/dev/null; }

SIZE_MB=$(( $(wc -c < "$FILE") / 1048576 ))
printf '\n\033[1mUploading\033[0m %s (%s MB) → %s\n\n' "$FILE" "$SIZE_MB" "$API"

# ── 1. sign in ───────────────────────────────────────────────────────────────
# Reachability first. Without this, a server that is down surfaces as curl's
# raw "Failed to connect", which reads like a bug in this script rather than an
# API that is not answering.
if ! curl -sS -o /dev/null --max-time 20 "$API/healthz" 2>/dev/null; then
  die "$API is not answering.

       TCP may still connect while the app behind it is down — that looks
       identical from here. Check the API is running and, if it is deployed,
       that its container has not crash-looped:

         curl -v $API/healthz
         docker logs --tail 50 <backend-container>"
fi

LOGIN=$(curl -sS --max-time 30 "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$EMAIL" "$PASSWORD")")

TOKEN=$(printf '%s' "$LOGIN" | json token)
if [ -z "$TOKEN" ]; then
  MSG=$(printf '%s' "$LOGIN" | err_of)
  case "$MSG" in
    *"not verified"*) die "$EMAIL has not confirmed its email address, so it cannot sign in" ;;
    *"too many"*)     die "rate limited — wait a minute. Auth allows 10 attempts/minute per address" ;;
    *)                die "sign-in failed as $EMAIL: ${MSG:-$LOGIN}" ;;
  esac
fi
say "signed in as $EMAIL"

# ── 2. upload the file ───────────────────────────────────────────────────────
# --max-time is generous: 25 MB over a slow uplink takes a while, and a timeout
# here would look identical to a rejection.
UP=$(curl -sS --max-time 300 -X POST "$API/uploads" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$FILE")

URL=$(printf '%s' "$UP" | json url)
if [ -z "$URL" ]; then
  MSG=$(printf '%s' "$UP" | err_of)
  case "$MSG" in
    *"empty"*)      die "the server saw an empty file" ;;
    *"extension"*)  die "$MSG" ;;
    *)              die "upload failed: ${MSG:-$UP}" ;;
  esac
fi
say "stored at $URL"

# ── 3. publish the deck ──────────────────────────────────────────────────────
# URL is passed through untouched. It is server-relative on purpose, so the deck
# keeps working if the API ever moves origin — rewriting it to an absolute URL
# here would pin the row to today's hostname.
BODY=$(python3 -c '
import json, sys
title, category, industry, author, stype, url = sys.argv[1:7]
deck = {"title": title, "category": category,
        "source": {"type": stype, "value": url}}
if industry: deck["industry"] = industry
if author:   deck["author"] = author
print(json.dumps(deck))' "$TITLE" "$CATEGORY" "$INDUSTRY" "$AUTHOR" "$SOURCE_TYPE" "$URL")

DECK=$(curl -sS --max-time 30 -X POST "$API/decks" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "$BODY")

ID=$(printf '%s' "$DECK" | json id)
if [ -z "$ID" ]; then
  MSG=$(printf '%s' "$DECK" | err_of)
  # The file is already stored at this point; say so, so the upload is not
  # repeated needlessly.
  die "the file uploaded fine but the deck was not created: ${MSG:-$DECK}
       the file is at $URL — retry with just the deck creation if you like"
fi

say "deck created: $ID"

# ── 4. prove it can be read back ─────────────────────────────────────────────
# A deck whose file 404s is worse than a failed upload, because it looks fine
# in the catalog until someone opens it.
CODE=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 60 "$API$URL")
if [ "$CODE" = "200" ]; then
  say "file verified — served back with 200"
else
  printf '\n\033[33mwarning:\033[0m the deck exists but its file answered %s at %s\n' "$CODE" "$API$URL"
  printf '         check that the uploads directory is mounted and writable.\n'
fi

printf '\n\033[32mDone.\033[0m %s\n\n' "$TITLE"
