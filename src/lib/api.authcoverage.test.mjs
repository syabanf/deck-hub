// Guards the class of bug that made login look like an expired session.
//
// /users became admin-only while the client still called it without a token.
// Every request came back 401, the app translated that to "your session
// expired", and signing in again did exactly the same thing — a loop on the
// screen the user had just authenticated from.
//
// The rule this pins: if the backend guards a route with JWTAuth, the client
// call for it must pass `auth: true`. Nothing else notices when it does not,
// because an unauthenticated 401 is indistinguishable from a stale token.
//
// Run: node --test src/lib/api.authcoverage.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const api = readFileSync(new URL('./api.js', import.meta.url), 'utf8')
const router = readFileSync(
  new URL('../../backend/internal/delivery/http/router.go', import.meta.url), 'utf8')

// Route groups the backend puts behind JWTAuth, by their path prefix.
function protectedPrefixes(src) {
  const found = new Set()
  const re = /r\.Route\("([^"]+)",\s*func\(r chi\.Router\)\s*\{([\s\S]*?)\n\t\}\)/g
  for (const [, prefix, body] of src.matchAll(re)) {
    // A whole group behind JWTAuth, e.g. /favorites, /progress, /users.
    if (/r\.Use\(d\.Tokens\.JWTAuth\)/.test(body.split('r.Group(')[0])) {
      found.add(prefix)
    }
  }
  return found
}

test('every client call to a JWT-guarded route sends the token', () => {
  const guarded = protectedPrefixes(router)
  assert.ok(guarded.size > 0, 'parsed no guarded routes — has router.go changed shape?')

  const offenders = []
  // name: (args) => request('/path'…) — capture the whole call.
  const callRe = /(\w+):\s*\([^)]*\)\s*=>\s*request\(\s*[`'"]([^`'"]+)[`'"][^;]*?\),?\n/g
  for (const [call, name, path] of api.matchAll(callRe)) {
    const prefix = '/' + path.replace(/^\//, '').split(/[/?]/)[0]
    if (guarded.has(prefix) && !/auth:\s*true/.test(call)) {
      offenders.push(`${name} → ${path}`)
    }
  }

  assert.deepEqual(offenders, [],
    'these call a token-guarded route without auth: true, so every response ' +
    'is a 401 the app reports as an expired session')
})
