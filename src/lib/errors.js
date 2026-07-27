// Turns whatever went wrong into something a person can actually act on.
//
// Backend errors arrive as {code, message, status}. Those messages are written
// for developers ("malformed JSON body"), so showing them verbatim leaks jargon
// into the UI. This module maps each failure to a plain-language title + next
// step, and only passes a server message through when it reads like a sentence
// a human wrote for another human.

// Server text that's really for developers. If a message trips this, we use our
// own copy instead of confusing someone with implementation details.
const JARGON = /\b(json|payload|unmarshal|nil|sql|pq:|syntax|token|header|parse|decode|multipart|uuid|constraint|violates)\b/i

const usable = (msg) => !!msg && msg.length < 160 && !JARGON.test(msg)

// Backend messages are written as fragments ("email and password are required").
// Sentence-casing and punctuating them keeps the UI from looking half-finished.
const polish = (msg) => {
  const t = msg.trim()
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.')
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

// A 401 mid-session means the 24h JWT lapsed — the person is still "signed in"
// as far as the UI knows, but every request will now fail.
//
// email_not_verified is also a 401 but is not an expiry: the account was never
// usable, and telling someone their session expired would send them to re-login
// instead of to their inbox.
export const isSessionExpired = (err) =>
  err?.code !== 'email_not_verified' && (err?.code === 'unauthorized' || err?.status === 401)

/**
 * humanizeError(err, { action }) → { title, message }
 *
 * `action` completes the sentence "We couldn't ___" — e.g. 'save this deck'.
 * Keep it lowercase and specific; it's what makes the copy feel written rather
 * than generated.
 */
export function humanizeError(err, { action = 'finish that' } = {}) {
  const status = err?.status
  const code = err?.code

  // Offline beats every other explanation — no point blaming the server when
  // the request never left the building.
  if (isOffline()) {
    return {
      title: "You're offline",
      message: `We couldn't ${action} because there's no connection right now. It'll work once you're back.`,
    }
  }

  if (code === 'timeout') {
    return {
      title: 'That took too long',
      message: 'The server went quiet instead of answering. Give it another try.',
    }
  }

  if (code === 'network') {
    return {
      title: "Can't reach WIT",
      message: 'The server isn’t responding. It may be restarting — try again in a moment.',
    }
  }

  // Right password, real account — the address just isn't proven yet. Handled
  // before the generic 401 because the fix is completely different: check your
  // inbox, not check your password.
  if (code === 'email_not_verified') {
    return {
      title: 'Verify your email first',
      message: 'We sent you a link when you signed up. Open it to activate your account — or have us send another.',
    }
  }

  if (isSessionExpired(err)) {
    return {
      title: 'Your session expired',
      message: 'You’ve been signed out to keep the account safe. Sign in again to pick up where you left off.',
    }
  }

  if (code === 'forbidden' || status === 403) {
    return {
      title: 'Your account can’t do that',
      message: `You don’t have permission to ${action}. An admin can change your role in Settings.`,
    }
  }

  if (code === 'not_found' || status === 404) {
    return {
      title: 'That’s not here anymore',
      message: 'Someone may have removed it. Refresh to see the current catalog.',
    }
  }

  if (code === 'conflict' || status === 409) {
    return {
      title: 'That already exists',
      message: usable(err?.message) ? polish(err.message) : 'Something with those details is already in the catalog.',
    }
  }

  if (status === 413 || code === 'too_large') {
    return {
      title: 'That file is too large',
      message: 'Uploads are capped at 25 MB. Try compressing it, or link to it instead.',
    }
  }

  if (status === 429) {
    return {
      title: 'Slow down a moment',
      message: 'That was a lot of requests at once. Wait a few seconds and try again.',
    }
  }

  if (code === 'invalid_input' || status === 400 || status === 422) {
    return {
      title: 'Something in the form needs fixing',
      message: usable(err?.message) ? polish(err.message) : `We couldn’t ${action} — please double-check the details and try again.`,
    }
  }

  if (status >= 500) {
    return {
      title: 'Something broke on our end',
      message: 'That one’s on us, not you. Try again in a moment — it usually sorts itself out.',
    }
  }

  return {
    title: `We couldn’t ${action}`,
    message: usable(err?.message) ? polish(err.message) : 'Something unexpected happened. Try again, and refresh if it sticks around.',
  }
}

// Convenience: build the toast payload directly, so callers can't forget the
// `type: 'error'` that makes a failure look like a failure.
export const errorToast = (err, opts) => ({ ...humanizeError(err, opts), type: 'error' })
