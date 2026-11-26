// Simple limit on how often someone can try something (e.g. log in, ask for a reset).
// Stops password guessing and stops anyone using our Gmail to spam an inbox.
// Counts are kept in memory, so they reset when the server restarts. That is
// fine for our size; a big system would use a shared store like Redis.

function rateLimit({ windowMinutes, max, keyFrom, message }) {
  const hits = new Map(); // key -> list of times

  return (req, res, next) => {
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    const key = keyFrom(req);
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);

    if (recent.length >= max) {
      return res.status(429).json({ status: 'error', message });
    }
    recent.push(now);
    hits.set(key, recent);

    // Tidy up old entries now and then so memory does not grow forever.
    if (hits.size > 5000) {
      for (const [k, times] of hits) {
        if (times.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }
    next();
  };
}

const emailOf = (req) => String(req.body?.email || '').trim().toLowerCase();

// Login: 10 tries per 15 minutes for the same computer + email.
const loginLimit = rateLimit({
  windowMinutes: 15,
  max: 10,
  keyFrom: (req) => `${req.ip}|${emailOf(req)}`,
  message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
});

// Forgot password: 3 emails per 15 minutes for the same email address.
const forgotPasswordLimit = rateLimit({
  windowMinutes: 15,
  max: 3,
  keyFrom: (req) => emailOf(req),
  message: 'Too many reset requests. Please wait 15 minutes and try again.',
});

// Reset password (using a link): 10 tries per 15 minutes per computer.
const resetPasswordLimit = rateLimit({
  windowMinutes: 15,
  max: 10,
  keyFrom: (req) => req.ip,
  message: 'Too many attempts. Please wait 15 minutes and try again.',
});

module.exports = { rateLimit, loginLimit, forgotPasswordLimit, resetPasswordLimit };
