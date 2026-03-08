/**
 * Socket.io event handler for Sastra Random Chat
 */

const { v4: uuidv4 } = require("uuid");
const {
  addToQueue,
  removeFromQueue,
  tryMatch,
  getQueueLength,
} = require("../matching/matchingAlgorithm");
const { sanitizeText, sanitizeReason } = require("../utils/sanitize");
const { createRateLimiter } = require("../utils/rateLimiter");

// Track active chat pairs: Map<socketId, partnerSocketId>
const activePairs = new Map();
// Track user metadata: Map<socketId, { coords, sessionId, inactivityTimer }>
const userMeta = new Map();

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// Rate limiters — shared across all sockets
// Messages: max 20 per 10 seconds (prevents spam)
const messageLimiter = createRateLimiter({ maxEvents: 20, windowMs: 10_000 });
// Control events (next/stop/find_match): max 10 per 5 seconds
const controlLimiter = createRateLimiter({ maxEvents: 10, windowMs: 5_000 });

function resetInactivityTimer(io, socketId) {
  const meta = userMeta.get(socketId);
  if (!meta) return;
  if (meta.inactivityTimer) clearTimeout(meta.inactivityTimer);
  meta.inactivityTimer = setTimeout(() => {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) {
      socket.emit("auto_disconnect", { reason: "Disconnected due to inactivity." });
      socket.disconnect(true);
    }
  }, INACTIVITY_TIMEOUT_MS);
}

function disconnectFromPartner(io, socketId, reason) {
  const partnerId = activePairs.get(socketId);
  if (partnerId) {
    activePairs.delete(socketId);
    activePairs.delete(partnerId);
    const partnerSocket = io.sockets.sockets.get(partnerId);
    if (partnerSocket) {
      partnerSocket.emit("partner_disconnected", { reason });
    }
  }
}

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    const sessionId = uuidv4();
    userMeta.set(socket.id, { coords: null, sessionId, inactivityTimer: null });

    socket.emit("session_created", { sessionId });
    resetInactivityTimer(io, socket.id);

    // ── location_update ──────────────────────────────────────────────────────
    socket.on("location_update", ({ lat, lng }) => {
      const meta = userMeta.get(socket.id);
      if (meta) meta.coords = { lat, lng };
      resetInactivityTimer(io, socket.id);
    });

    // ── find_match ───────────────────────────────────────────────────────────
    socket.on("find_match", () => {
      if (!controlLimiter.check(socket.id)) {
        socket.emit("rate_limit_exceeded", { event: "find_match" });
        return;
      }

      // Disconnect from current partner first
      disconnectFromPartner(io, socket.id, "Your partner skipped to the next chat.");

      const meta = userMeta.get(socket.id);
      const coords = meta ? meta.coords : null;

      addToQueue(socket.id, coords);

      const result = tryMatch(socket.id, coords);

      if (result.matched) {
        const { partner, zone, partnerZone } = result;

        activePairs.set(socket.id, partner.socketId);
        activePairs.set(partner.socketId, socket.id);

        socket.emit("matched", {
          zone: zone || "Campus",
          partnerZone: partnerZone || "Campus",
        });

        const partnerSocket = io.sockets.sockets.get(partner.socketId);
        if (partnerSocket) {
          partnerSocket.emit("matched", {
            zone: partnerZone || "Campus",
            partnerZone: zone || "Campus",
          });
        }
      } else {
        const queuePos = getQueueLength(socket.id);
        socket.emit("waiting", { position: queuePos + 1 });
      }

      resetInactivityTimer(io, socket.id);
    });

    // ── message ──────────────────────────────────────────────────────────────
    socket.on("message", ({ text }) => {
      if (!messageLimiter.check(socket.id)) {
        socket.emit("rate_limit_exceeded", { event: "message" });
        return;
      }

      const sanitized = sanitizeText(text);
      if (!sanitized) return;

      const partnerId = activePairs.get(socket.id);
      if (!partnerId) return;

      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit("message", { text: sanitized, from: "stranger" });
      }

      // Confirm delivery to sender
      socket.emit("message_delivered");
      resetInactivityTimer(io, socket.id);
    });

    // ── typing ───────────────────────────────────────────────────────────────
    socket.on("typing", ({ isTyping }) => {
      const partnerId = activePairs.get(socket.id);
      if (!partnerId) return;
      const partnerSocket = io.sockets.sockets.get(partnerId);
      if (partnerSocket) {
        partnerSocket.emit("typing", { isTyping });
      }
    });

    // ── next ─────────────────────────────────────────────────────────────────
    socket.on("next", () => {
      if (!controlLimiter.check(socket.id)) {
        socket.emit("rate_limit_exceeded", { event: "next" });
        return;
      }

      disconnectFromPartner(io, socket.id, "Your partner has moved to the next chat.");
      removeFromQueue(socket.id);

      // Re-enter queue
      const meta = userMeta.get(socket.id);
      const coords = meta ? meta.coords : null;
      addToQueue(socket.id, coords);

      const result = tryMatch(socket.id, coords);
      if (result.matched) {
        const { partner, zone, partnerZone } = result;
        activePairs.set(socket.id, partner.socketId);
        activePairs.set(partner.socketId, socket.id);

        socket.emit("matched", { zone: zone || "Campus", partnerZone: partnerZone || "Campus" });
        const partnerSocket = io.sockets.sockets.get(partner.socketId);
        if (partnerSocket) {
          partnerSocket.emit("matched", { zone: partnerZone || "Campus", partnerZone: zone || "Campus" });
        }
      } else {
        const queuePos = getQueueLength(socket.id);
        socket.emit("waiting", { position: queuePos + 1 });
      }

      resetInactivityTimer(io, socket.id);
    });

    // ── stop ─────────────────────────────────────────────────────────────────
    socket.on("stop", () => {
      if (!controlLimiter.check(socket.id)) {
        socket.emit("rate_limit_exceeded", { event: "stop" });
        return;
      }

      disconnectFromPartner(io, socket.id, "Your partner has ended the chat.");
      removeFromQueue(socket.id);
      socket.emit("chat_stopped");
      resetInactivityTimer(io, socket.id);
    });

    // ── report ───────────────────────────────────────────────────────────────
    socket.on("report", ({ reason }) => {
      // Sanitize the reason before logging
      const safeReason = sanitizeReason(reason);
      // Log report server-side only; no data stored
      console.log(`[REPORT] Socket ${socket.id} reported partner. Reason: ${safeReason}`);
      socket.emit("report_received");
    });

    // ── disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      disconnectFromPartner(io, socket.id, "Your partner has disconnected.");
      removeFromQueue(socket.id);

      const meta = userMeta.get(socket.id);
      if (meta && meta.inactivityTimer) clearTimeout(meta.inactivityTimer);
      userMeta.delete(socket.id);

      // Free rate-limiter memory for this socket
      messageLimiter.cleanup(socket.id);
      controlLimiter.cleanup(socket.id);
    });
  });
}

module.exports = { registerSocketHandlers };
