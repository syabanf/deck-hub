// safeHref decides what a stored value is allowed to become when the page
// turns it into a link.
//
// Two failure modes, and they look nothing alike. A `javascript:` URL in a
// deck source or a demo row runs as script on this origin the moment somebody
// clicks it — stored XSS, planted by anyone who can edit the catalog. A bare
// host is the quiet one: "dashboard.example.com" in an href is a *relative*
// link, so the browser resolves it against this app and the Open button goes
// nowhere. One of the imported demo rows was exactly that.
//
// Run: node --test src/lib/link.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { safeHref } from './link.js'

test('our own uploads are left alone', () => {
  assert.equal(safeHref('/uploads/9f3c.pdf'), '/uploads/9f3c.pdf')
  assert.equal(safeHref('/uploads/a b.png'), '/uploads/a b.png')
})

test('http and https pass through unchanged', () => {
  assert.equal(safeHref('https://example.com/a?b=c#d'), 'https://example.com/a?b=c#d')
  assert.equal(safeHref('http://103.10.20.30:8080/x'), 'http://103.10.20.30:8080/x')
})

test('a missing scheme is filled in rather than left relative', () => {
  assert.equal(safeHref('dashboard.example.com'), 'https://dashboard.example.com')
  assert.equal(safeHref('dashboard.example.com/app?x=1'), 'https://dashboard.example.com/app?x=1')
  // Protocol-relative already has the slashes; it needs the scheme, not both.
  assert.equal(safeHref('//example.com/a'), 'https://example.com/a')
})

test('a scheme that executes instead of navigating is refused', () => {
  for (const hostile of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    '  javascript:alert(1)  ',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ]) {
    assert.equal(safeHref(hostile), '', `${hostile} should not become a link`)
  }
})

test('nothing usable comes back as nothing, not as a broken link', () => {
  assert.equal(safeHref(''), '')
  assert.equal(safeHref('   '), '')
  assert.equal(safeHref(null), '')
  assert.equal(safeHref(undefined), '')
  assert.equal(safeHref('not a url'), '')
})
