/**
 * Simple in-memory rate limiter for Socket.io events.
 *
 * Tracks the number of times each socket fires a given event within a
 * rolling time window. If a socket exceeds the limit it is considered
 * rate-limited and the calling handler should drop the event.
 *
 * Usage:
 *   const limiter = createRateLimiter({ maxEvents: 20, windowMs: 10_000 });
 *   if (!limiter.check(socket.id)) { return; } // too fast — drop
 */

/**
 * Create a new rate-limiter instance.
 *
 * @param {object} [options]
 * @param {number} [options.maxEvents=30]  - Max events allowed in the window.
 * @param {number} [options.windowMs=10000] - Rolling window in milliseconds.
 * @returns {{ check: Function, cleanup: Function }}
 */
function createRateLimiter({ maxEvents = 30, windowMs = 10_000 } = {}) {
  // Map<socketId, number[]> — stores timestamps of recent events per socket
  const buckets = new Map();

  /**
   * Check whether a socket is within the rate limit.
   * Records the current event and returns true when allowed, false when blocked.
   *
   * @param {string} socketId
   * @returns {boolean} true = allowed, false = rate-limited
   */
  function check(socketId) {
    const now = Date.now();
    const cutoff = now - windowMs;

    // Retrieve or create the timestamp bucket for this socket
    let timestamps = buckets.get(socketId) || [];

    // Drop timestamps that fall outside the rolling window
    timestamps = timestamps.filter((t) => t > cutoff);

    if (timestamps.length >= maxEvents) {
      // Still store the pruned list so the next call doesn't re-process stale entries
      buckets.set(socketId, timestamps);
      return false; // rate-limited
    }

    // Record this event and save
    timestamps.push(now);
    buckets.set(socketId, timestamps);
    return true; // allowed
  }

  /**
   * Remove all tracking data for a socket (call on disconnect to free memory).
   *
   * @param {string} socketId
   */
  function cleanup(socketId) {
    buckets.delete(socketId);
  }

  return { check, cleanup };
}

/**
 * Express middleware factory for HTTP-level rate limiting.
 * Returns a middleware that limits requests per IP address.
 *
 * @param {object} [options]
 * @param {number} [options.maxRequests=100] - Max requests per window.
 * @param {number} [options.windowMs=60000]  - Window in milliseconds (default 1 min).
 * @param {string} [options.message]         - Message sent when rate-limited.
 * @returns {Function} Express middleware
 */
function createHttpRateLimiter({
  maxRequests = 100,
  windowMs = 60_000,
  message = "Too many requests. Please try again later.",
} = {}) {
  // Map<ip, { count: number, resetAt: number }>
  const ipMap = new Map();

  // Periodically purge stale entries to avoid unbounded memory growth
  const pruneInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipMap.entries()) {
      if (entry.resetAt <= now) ipMap.delete(ip);
    }
  }, windowMs);

  // Allow the interval to be garbage-collected when the process exits
  if (pruneInterval.unref) pruneInterval.unref();

  return function httpRateLimitMiddleware(req, res, next) {
    // Use req.ip so Express respects the trust proxy setting.
    // In production behind a reverse proxy (e.g. nginx / Heroku / Railway),
    // set app.set('trust proxy', 1) so req.ip resolves to the real client IP
    // rather than the proxy address, preventing rate-limit bypass via spoofed
    // X-Forwarded-For headers.
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    const now = Date.now();
    let entry = ipMap.get(ip);

    if (!entry || entry.resetAt <= now) {
      // First request in a new window
      entry = { count: 1, resetAt: now + windowMs };
      ipMap.set(ip, entry);
      return next();
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      res.setHeader(
        "Retry-After",
        Math.ceil((entry.resetAt - now) / 1000)
      );
      return res.status(429).json({ error: message });
    }

    return next();
  };
}

module.exports = { createRateLimiter, createHttpRateLimiter };
