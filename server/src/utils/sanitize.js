/**
 * Input sanitization utilities for Sastra Random Chat.
 * Cleans user-supplied strings before forwarding them to partners
 * or logging them server-side.
 *
 * Security note: sanitizeText replaces `<` and `>` to prevent HTML injection.
 * This is sufficient because all sanitized text is sent over WebSocket and
 * rendered in React as plain text nodes (never via dangerouslySetInnerHTML or
 * inserted into HTML attributes / URL contexts). If the rendering context ever
 * changes, additional context-specific escaping must be applied.
 */

// Maximum allowed message length in characters
const MAX_MESSAGE_LENGTH = 1000;
// Maximum allowed reason string length (for reports, etc.)
const MAX_REASON_LENGTH = 300;

/**
 * Strip characters that could be used for XSS or injection,
 * then trim whitespace and enforce a length cap.
 *
 * @param {string} text - Raw input from the client.
 * @param {number} [maxLength=MAX_MESSAGE_LENGTH] - Hard cap on output length.
 * @returns {string} Sanitized string, or empty string if input is invalid.
 */
function sanitizeText(text, maxLength = MAX_MESSAGE_LENGTH) {
  if (!text || typeof text !== "string") return "";

  return text
    // Replace angle brackets to prevent HTML/script injection
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Collapse runs of whitespace (but preserve intentional newlines)
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize a short reason string (used for reports and disconnect reasons).
 *
 * @param {string} reason - Raw reason input.
 * @returns {string} Sanitized reason, or "N/A" if empty / invalid.
 */
function sanitizeReason(reason) {
  const cleaned = sanitizeText(reason, MAX_REASON_LENGTH);
  return cleaned || "N/A";
}

module.exports = { sanitizeText, sanitizeReason, MAX_MESSAGE_LENGTH };
