// Global double-submit CSRF wiring (client side).
//
// The backend sets a readable `csrfToken` cookie and requires a matching
// X-CSRF-Token header on every state-changing /api request. Rather than edit all
// ~19 mutating fetch call sites, we install a single window.fetch wrapper that
// attaches the header automatically. Importing this module for its side effect
// (see index.js) installs the wrapper before the app makes any request.
//
// IMPORTANT: the wrapper only covers `fetch`. Any request sent by another
// transport — XMLHttpRequest (used by Upload.js for progress events),
// navigator.sendBeacon, a native <form> POST — bypasses it entirely and must
// attach the header itself via the exported ensureCsrfToken() below. Omitting
// it yields a 403 { error: 'Invalid CSRF token' } from the server.

const CSRF_COOKIE = 'csrfToken';
const CSRF_HEADER = 'X-CSRF-Token';
const SAFE_METHOD = /^(GET|HEAD|OPTIONS)$/i;
const API_URL = process.env.REACT_APP_API_URL || '';

function readCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// Captured before the wrapper is installed, so internal calls never re-enter it.
const nativeFetch = window.fetch.bind(window);

// Resolve the token, bootstrapping the cookie once if it doesn't exist yet
// (e.g. when the very first user action is a login POST). Concurrent callers
// share the single in-flight bootstrap request — which matters for the batch
// uploader, where N files fire in parallel from a cold cookie.
//
// Exported for non-fetch transports (see the note at the top of this file).
// Returns null if the cookie is absent AND the bootstrap request failed; callers
// should treat that as "cannot send a state-changing request" rather than
// sending one without the header and eating an opaque 403.
let bootstrap = null;
export async function ensureCsrfToken() {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;

  if (!bootstrap) {
    // nativeFetch, not the wrapper: this is a plain GET and must never re-enter
    // the wrapper (which would call back into ensureCsrfToken).
    bootstrap = nativeFetch(`${API_URL}/api/csrf-token`, { credentials: 'include' })
      .catch(() => {})
      .finally(() => { bootstrap = null; });
  }
  await bootstrap;
  return readCookie(CSRF_COOKIE);
}

// Only attach the token to our own API. Never leak it to third-party origins
// (S3, Google Fonts, etc.).
function isOwnApiRequest(url) {
  try {
    const target = new URL(url, window.location.origin);
    const base = new URL(API_URL || window.location.origin, window.location.origin);
    return target.origin === base.origin && target.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

window.fetch = async function csrfFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const method = (
    init.method ||
    (typeof input !== 'string' && input && input.method) ||
    'GET'
  ).toUpperCase();

  if (!SAFE_METHOD.test(method) && isOwnApiRequest(url)) {
    const token = await ensureCsrfToken();
    const headers = new Headers(
      init.headers || (typeof input !== 'string' && input ? input.headers : undefined)
    );
    if (token && !headers.has(CSRF_HEADER)) {
      headers.set(CSRF_HEADER, token);
    }
    return nativeFetch(input, {
      ...init,
      headers,
      credentials: init.credentials || 'include',
    });
  }

  return nativeFetch(input, init);
};
