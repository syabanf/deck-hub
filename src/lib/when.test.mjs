// Run: node --test src/lib/when.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatDateTime, timeAgo } from './when.js'

test('formatDateTime prints the instant in local time, not the string', () => {
  const d = new Date(2026, 10, 3, 9, 5)
  assert.equal(formatDateTime(d.toISOString()), '2026-11-03 09:05')
})

test('formatDateTime is empty for nothing and for garbage', () => {
  assert.equal(formatDateTime(null), '')
  assert.equal(formatDateTime(undefined), '')
  assert.equal(formatDateTime('not a date'), '')
})

test('timeAgo steps from minutes to hours to days to a date', () => {
  const now = new Date(2026, 10, 3, 12, 0)
  const ago = (ms) => new Date(now.getTime() - ms).toISOString()
  assert.equal(timeAgo(ago(20 * 1000), now), 'just now')
  assert.equal(timeAgo(ago(5 * 60 * 1000), now), '5 min ago')
  assert.equal(timeAgo(ago(3 * 3600 * 1000), now), '3 h ago')
  assert.equal(timeAgo(ago(26 * 3600 * 1000), now), 'yesterday')
  assert.equal(timeAgo(ago(4 * 86400 * 1000), now), '4 days ago')
  assert.equal(timeAgo(new Date(2026, 8, 1, 10, 0).toISOString(), now), '2026-09-01')
})

test('timeAgo never says a time is in the future', () => {
  const now = new Date(2026, 10, 3, 12, 0)
  assert.equal(timeAgo(new Date(now.getTime() + 60000).toISOString(), now), 'just now')
})
