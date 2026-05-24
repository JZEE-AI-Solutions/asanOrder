/**
 * twilioService.js  (Meta WhatsApp Cloud API adapter)
 * ─────────────────────────────────────────────────────────────────────────────
 * All outward-facing exports are identical to the original Twilio version so
 * agentService.js and the Jest test mocks require zero changes.
 *
 * Underlying implementation now uses the Meta Graph API:
 *   https://graph.facebook.com/v17.0/{PHONE_NUMBER_ID}/messages
 *
 * Required env vars:
 *   META_ACCESS_TOKEN     – permanent / long-lived page/system-user token
 *   META_PHONE_NUMBER_ID  – e.g. 1006993515830269
 *   META_WABA_ID          – e.g. 1824730344873732  (used for logging only)
 *   WEBHOOK_VERIFY_TOKEN  – any secret string you set in Meta Developer Console
 * ─────────────────────────────────────────────────────────────────────────────
 */

const axios = require('axios')
const crypto = require('crypto')

const GRAPH_API_VERSION = 'v17.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPhoneNumberId () {
  const id = process.env.META_PHONE_NUMBER_ID
  if (!id) throw new Error('META_PHONE_NUMBER_ID must be set in .env')
  return id
}

function getAccessToken () {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) throw new Error('META_ACCESS_TOKEN must be set in .env')
  return token
}

/**
 * Convert any phone string to a plain E.164 digit string (no +, no whatsapp: prefix).
 * e.g. "+92 300 1234567", "03001234567", "923001234567" → "923001234567"
 */
function normalizePhone (phone) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('92')) return digits
  if (digits.startsWith('0')) return `92${digits.slice(1)}`
  return digits
}

// ── Send a text message ───────────────────────────────────────────────────────
/**
 * @param {string} to   - Recipient phone e.g. "923001234567"
 * @param {string} body - Message text
 * @returns {Promise<string>} Meta message ID (wamid.xxx)
 */
async function sendMessage (to, body) {
  const recipient = normalizePhone(to)
  const phoneNumberId = getPhoneNumberId()
  const token = getAccessToken()

  try {
    const response = await axios.post(
      `${GRAPH_BASE}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'text',
        text: { preview_url: false, body }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    )

    const msgId = response.data?.messages?.[0]?.id || 'unknown'
    console.log(`[metaService] Sent to ${recipient}: id=${msgId}`)
    return msgId
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message
    console.error(`[metaService] sendMessage error:`, detail)
    throw err
  }
}

// ── Send a message with an image ─────────────────────────────────────────────
/**
 * @param {string} to       - Recipient phone
 * @param {string} body     - Caption text (can be empty string)
 * @param {string} mediaUrl - Publicly accessible image URL
 * @returns {Promise<string>} Meta message ID
 */
async function sendMediaMessage (to, body, mediaUrl) {
  const recipient = normalizePhone(to)
  const phoneNumberId = getPhoneNumberId()
  const token = getAccessToken()

  try {
    const response = await axios.post(
      `${GRAPH_BASE}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'image',
        image: {
          link: mediaUrl,
          caption: body || ''
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    )

    const msgId = response.data?.messages?.[0]?.id || 'unknown'
    console.log(`[metaService] Sent media to ${recipient}: id=${msgId}`)
    return msgId
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message
    console.error(`[metaService] sendMediaMessage error:`, detail)
    throw err
  }
}

// ── Validate Meta webhook signature ──────────────────────────────────────────
/**
 * Verifies the X-Hub-Signature-256 header (HMAC-SHA256 of raw body using
 * the Meta App Secret).  Falls back to true in dev when no app secret is set.
 *
 * NOTE: Express must be configured with `verify` on the JSON parser to capture
 * the raw body buffer (see routes/agent.js).  The raw buffer is attached to
 * req.rawBody by that middleware.
 *
 * @param {Request} req
 * @returns {boolean}
 */
function validateWebhookSignature (req) {
  const appSecret = process.env.META_APP_SECRET

  // Skip in dev when app secret is not configured
  if (!appSecret) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[metaService] Skipping signature validation (no META_APP_SECRET set)')
      return true
    }
    return false
  }

  const signature = req.headers['x-hub-signature-256']
  if (!signature) return false

  const rawBody = req.rawBody // set by express.json verify callback
  if (!rawBody) return false

  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

// ── Download media from Meta ──────────────────────────────────────────────────
/**
 * Meta requires a two-step download:
 *   1. GET /v17.0/{media_id}  → { url, mime_type, ... }
 *   2. GET the returned URL with Bearer token → binary data
 *
 * @param {string} mediaId          - Meta media ID from the webhook message
 * @param {string} mediaContentType - MIME type hint from webhook (optional)
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
async function downloadMedia (mediaId, mediaContentType) {
  const token = getAccessToken()

  try {
    // Step 1: Resolve the temporary download URL
    const metaResponse = await axios.get(
      `${GRAPH_BASE}/${mediaId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      }
    )

    const downloadUrl = metaResponse.data?.url
    const mimeType = metaResponse.data?.mime_type || mediaContentType || 'image/jpeg'

    if (!downloadUrl) {
      throw new Error(`No download URL returned for media ID: ${mediaId}`)
    }

    // Step 2: Download the actual binary
    const imageResponse = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000
    })

    const base64 = Buffer.from(imageResponse.data, 'binary').toString('base64')
    return { base64, mimeType }
  } catch (err) {
    console.error('[metaService] downloadMedia error:', err.message)
    throw err
  }
}

// ── Parse incoming Meta webhook body ─────────────────────────────────────────
/**
 * Extracts the relevant fields from a Meta WhatsApp Cloud API webhook POST body.
 *
 * Meta sends JSON — very different from Twilio's form-urlencoded format.
 *
 * Handles:
 *   - text messages
 *   - image / document / audio / video messages (returns mediaId as mediaUrl)
 *   - status updates (returns null, caller should skip)
 *
 * @param {Object} body - req.body (already parsed JSON)
 * @returns {Object|null} Normalized message object, or null if not a message event
 */
function parseWebhookBody (body) {
  try {
    const entry = body?.entry?.[0]
    const change = entry?.changes?.[0]
    const value = change?.value

    if (!value) return null

    const messages = value.messages
    if (!messages || messages.length === 0) {
      // This is a status update (delivered, read), not a message — skip it
      return null
    }

    const message = messages[0]
    const contact = value.contacts?.[0]
    const metadata = value.metadata

    const from = message.from || ''  // E.164 digits, e.g. "923001234567"
    const to = metadata?.phone_number_id || ''  // Our Meta Phone Number ID

    let text = ''
    let mediaId = null
    let mediaContentType = null
    let numMedia = 0

    switch (message.type) {
      case 'text':
        text = (message.text?.body || '').trim()
        break

      case 'image':
        mediaId = message.image?.id || null
        mediaContentType = message.image?.mime_type || 'image/jpeg'
        text = (message.image?.caption || '').trim()
        numMedia = 1
        break

      case 'document':
        mediaId = message.document?.id || null
        mediaContentType = message.document?.mime_type || 'application/pdf'
        text = (message.document?.caption || '').trim()
        numMedia = 1
        break

      case 'audio':
        mediaId = message.audio?.id || null
        mediaContentType = message.audio?.mime_type || 'audio/ogg'
        numMedia = 1
        break

      case 'video':
        mediaId = message.video?.id || null
        mediaContentType = message.video?.mime_type || 'video/mp4'
        text = (message.video?.caption || '').trim()
        numMedia = 1
        break

      default:
        // Unsupported type (location, sticker, etc.) — treat as empty text
        text = ''
    }

    return {
      from: stripWhatsAppPrefix(from),           // e.g. "923001234567"
      to,                                         // Meta Phone Number ID
      text,
      numMedia,
      mediaUrl: mediaId,                          // Actually a Meta media ID (not a URL)
      mediaContentType,
      messageSid: message.id || null,             // Meta message ID (wamid.xxx)
      profileName: contact?.profile?.name || null // WhatsApp display name
    }
  } catch (err) {
    console.error('[metaService] parseWebhookBody error:', err.message)
    return null
  }
}

// ── Compatibility helpers (unchanged API surface) ─────────────────────────────

/**
 * Normalize a phone to whatsapp: prefixed format.
 * Meta doesn't use this prefix, but agentService may call this internally.
 */
function normalizeToWhatsApp (phone) {
  if (phone.startsWith('whatsapp:')) return phone
  if (phone.startsWith('+')) return `whatsapp:${phone}`
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('92')) return `whatsapp:+${digits}`
  if (digits.startsWith('0')) return `whatsapp:+92${digits.slice(1)}`
  return `whatsapp:+${digits}`
}

/**
 * Strip any whatsapp: prefix — returns plain digit string.
 */
function stripWhatsAppPrefix (phone) {
  return phone.replace(/^whatsapp:\+?/, '').replace(/^\+/, '')
}

module.exports = {
  sendMessage,
  sendMediaMessage,
  validateWebhookSignature,
  downloadMedia,
  parseWebhookBody,
  normalizeToWhatsApp,
  stripWhatsAppPrefix
}
