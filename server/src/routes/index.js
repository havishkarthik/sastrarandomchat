/**
 * HTTP route definitions for Sastra Random Chat.
 *
 * Exposes lightweight REST endpoints so load-balancers, monitoring tools,
 * and the client can query basic server health and queue statistics.
 */

const { Router } = require("express");
const { getQueueLength } = require("../matching/matchingAlgorithm");

const router = Router();

// ── GET /health ───────────────────────────────────────────────────────────────
// Simple liveness probe — used by container orchestrators and uptime monitors.
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── GET /stats ────────────────────────────────────────────────────────────────
// Returns anonymised queue depth so the client can display "X people waiting".
router.get("/stats", (_req, res) => {
  const waiting = getQueueLength(); // total users in queue
  res.json({ waiting });
});

module.exports = router;
