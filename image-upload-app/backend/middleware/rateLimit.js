const rateLimit = require('express-rate-limit');

// Standard JSON error shape used across the API.
const handler = (req, res) =>
  res.status(429).json({ error: 'Too many requests, please try again later.' });

// Strict limiter for auth-sensitive endpoints (login, signup, change-password).
// Caps brute-force / credential-stuffing against the small set of accounts.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per window
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: false,
  handler,
});

// General limiter for the rest of the API. Uploading is one request per image,
// and a typical batch here is 500-1000 photos, so a 300-request window stopped
// real uploads dead around image 300 with an opaque 429. The ceiling has to
// clear a full batch plus retries plus the gallery traffic alongside it. At
// 2000 per 15 minutes it is still ~2.2 requests/second sustained, which blunts
// an abusive burst, and the auth endpoints keep their own strict limit of 10.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

module.exports = { authLimiter, apiLimiter };
