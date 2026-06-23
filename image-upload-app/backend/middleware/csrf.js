const crypto = require('crypto');

// Stateless double-submit-cookie CSRF protection.
//
// Why this is needed: authenticateToken accepts the JWT from the `token` COOKIE
// (req.cookies?.token), which the browser attaches automatically on any request
// — including ones triggered by a malicious third-party page. SameSite=strict on
// that cookie is the first line of defense, but older browsers and edge cases
// make SameSite insufficient on its own (OWASP). The double-submit pattern adds
// an explicit second check: a random token is placed in a JS-READABLE cookie,
// and every state-changing request must echo it back in the X-CSRF-Token header.
// A cross-site attacker can ride the auth cookie but cannot read this cookie
// (same-origin policy) nor set a custom header, so forged writes are rejected.

const CSRF_COOKIE = 'csrfToken';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const generateToken = () => crypto.randomBytes(32).toString('hex');

// Ensure a CSRF token cookie exists on every response. httpOnly:false on purpose
// so the SPA can read it and echo it in the header. Set early (before login) so
// the token is already present for the first state-changing request.
function issueCsrfToken(req, res, next) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token) {
    token = generateToken();
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days — matches the auth token lifetime
    });
    // Reflect it onto the current request so verifyCsrf in the same cycle sees it.
    req.cookies = req.cookies || {};
    req.cookies[CSRF_COOKIE] = token;
  }
  res.locals.csrfToken = token;
  next();
}

// Constant-time compare to avoid leaking match progress via timing.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Reject unsafe methods whose X-CSRF-Token header doesn't match the cookie.
// Safe (read-only) methods pass through untouched.
function verifyCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
}

module.exports = { issueCsrfToken, verifyCsrf, CSRF_COOKIE, CSRF_HEADER };
