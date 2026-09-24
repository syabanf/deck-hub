// The same cases as backend/internal/usecase/slug_test.go, deliberately.
//
// Two implementations of one rule is a thing that drifts, and the drift is
// invisible: the field would show one link while the server stored another,
// and nobody would notice until a client's link did not open. These cases
// exist to fail when that starts happening.
//
// Run: node --test src/lib/slug.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { MAX_SLUG_LEN, slugProblem, slugify } from './slug.js'

test('what a person types becomes something a URL can carry', () => {
  const cases = {
    'Company Profile 2026': 'company-profile-2026',
    '  Laporan   Tahunan  ': 'laporan-tahunan',
    'Q1/Q2 — Review': 'q1-q2-review',
    'Profil WIT 2026!': 'profil-wit-2026',
    'already-a-slug': 'already-a-slug',
    '--leading-and-': 'leading-and',
    WIT: 'wit',
    日本語: '',
    '!!!': '',
    '': '',
  }
  for (const [input, want] of Object.entries(cases)) {
    assert.equal(slugify(input), want, `slugify(${JSON.stringify(input)})`)
  }
})

test('cleaning a clean slug changes nothing', () => {
  // The value goes through this while typing and again when the saved deck
  // comes back. A second pass that changed anything would make the field
  // disagree with the link that was actually stored.
  for (const input of ['Company Profile 2026', 'Q1/Q2 — Review', 'a--b', '-x-']) {
    const once = slugify(input)
    assert.equal(slugify(once), once, `slugify is not idempotent for ${input}`)
  }
})

test('a very long title is cut without leaving a dangling hyphen', () => {
  const got = slugify('laporan tahunan '.repeat(20))
  assert.ok(got.length <= MAX_SLUG_LEN, `${got.length} characters, cap is ${MAX_SLUG_LEN}`)
  assert.ok(!got.endsWith('-'), `ends in a hyphen: ${got}`)
})

test('names that cannot be links are explained, not silently accepted', () => {
  for (const bad of ['日本語', '!!!', 'api', 'Settings', '2026', '12-34']) {
    assert.notEqual(slugProblem(bad), '', `${bad} should be refused`)
  }
})

test('no name is not a problem — the deck falls back to its id', () => {
  assert.equal(slugProblem(''), '')
  assert.equal(slugProblem('   '), '')
  assert.equal(slugProblem(null), '')
})

test('an ordinary title passes once it is cleaned', () => {
  assert.equal(slugProblem('  Profil WIT 2026!  '), '')
  assert.equal(slugify('  Profil WIT 2026!  '), 'profil-wit-2026')
})
