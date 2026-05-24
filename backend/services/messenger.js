/**
 * messenger.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Channel dispatcher used by agentService for OUTBOUND messages.
 *
 *   to.startsWith('web-')  → goes to webChannel  (SSE push to browser)
 *   everything else         → goes to twilioService (Meta WhatsApp Cloud API)
 *
 * INBOUND messages and media downloads still go through the channel-specific
 * services directly (twilioService.downloadMedia, parseWebhookBody, etc).
 * Only the reply path is unified here so the agent state machine doesn't
 * care which channel the customer is on.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const twilio = require('./twilioService')
const web = require('./webChannel')

const isWeb = (to) => typeof to === 'string' && to.startsWith('web-')

async function sendMessage (to, body) {
  if (isWeb(to)) return web.sendMessage(to, body)
  return twilio.sendMessage(to, body)
}

async function sendMediaMessage (to, body, mediaUrl) {
  if (isWeb(to)) return web.sendMediaMessage(to, body, mediaUrl)
  return twilio.sendMediaMessage(to, body, mediaUrl)
}

module.exports = { sendMessage, sendMediaMessage, isWeb }
