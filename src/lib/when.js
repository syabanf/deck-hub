// Timestamps for people, not for logs.
//
// The API returns ISO strings in whatever zone the server runs in, which in
// production is UTC. Slicing the string — what the activity log does — shows
// a sign-in at 09:00 in Jakarta as 02:00. These read it as an instant and
// print it in the viewer's own zone.

const pad = (n) => String(n).padStart(2, '0')

const toDate = (value) => {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

// "2026-11-03 09:15", local time. Fixed-width, so a column of them lines up.
export const formatDateTime = (value) => {
  const d = toDate(value)
  if (!d) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// "just now", "5 min ago", "3 h ago", "2 days ago"; past a month, the date.
// Coarse on purpose: last-seen only moves every five minutes, so anything
// finer would claim a precision the number does not have.
export const timeAgo = (value, now = new Date()) => {
  const d = toDate(value)
  if (!d) return ''
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return days === 1 ? 'yesterday' : `${days} days ago`
  return formatDateTime(d).slice(0, 10)
}
