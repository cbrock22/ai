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

// General limiter for the rest of the API. Generous enough not to affect normal
// gallery browsing/uploading, but blunts abusive bursts.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

module.exports = { authLimiter, apiLimiter };
