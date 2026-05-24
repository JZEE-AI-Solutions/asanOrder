/**
 * routes/agent.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Two groups of endpoints:
 *
 * PUBLIC (no auth — called by Meta WhatsApp Cloud API):
 *   GET  /api/agent/webhook          ← Meta hub.challenge verification
 *   POST /api/agent/webhook          ← Meta sends all incoming WhatsApp messages here
 *
 * PROTECTED (JWT required — business owner dashboard):
 *   GET  /api/agent/config           ← Get agent config
 *   PUT  /api/agent/config           ← Update mode, phones, AI provider
 *   GET  /api/agent/sessions         ← List active sessions
 *   GET  /api/agent/sessions/:id     ← Session detail + messages
 *   POST /api/agent/sessions/:id/reset ← Reset a stuck session
 *   GET  /api/agent/status           ← Quick stats
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express = require('express')
const crypto = require('crypto')
const multer = require('multer')
const router = express.Router()
const db = require('../lib/db')
const agentService = require('../services/agentService')
const twilioService = require('../services/twilioService')
const webChannel = require('../services/webChannel')
const { authenticateToken } = require('../middleware/auth')
const aiService = require('../services/aiService')

// Multer (memory) for web-channel image uploads — 5 MB cap
const webUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)) return cb(null, true)
    cb(new Error('Only image files are allowed'))
  }
})

const SESSION_TTL_MS = 24 * 60 * 60 * 1000

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC: Meta WhatsApp Cloud API Webhook
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/agent/webhook
 *
 * Meta calls this once during webhook setup to verify the endpoint.
 * We must echo back hub.challenge when the verify token matches.
 */
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode']
  const token     = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN || 'asanorder-verify-2024'

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[agent/webhook] ✅ Meta webhook verified')
    return res.status(200).send(challenge)
  }

  console.warn('[agent/webhook] ❌ Meta webhook verification failed', { mode, token })
  res.status(403).json({ error: 'Forbidden' })
})

/**
 * POST /api/agent/webhook
 *
 * Meta calls this for every incoming WhatsApp message (JSON body).
 * Must respond with 200 immediately — Meta retries if we take > 20s.
 */
router.post('/webhook', express.json(), async (req, res) => {
  // Respond immediately so Meta doesn't retry
  res.status(200).send('OK')

  // Parse the incoming message from Meta JSON format
  const msg = twilioService.parseWebhookBody(req.body)

  if (!msg) {
    // Status update (delivered/read) or unrecognized format — silently ignore
    return
  }

  console.log(`[agent/webhook] Incoming from ${msg.from}: "${msg.text}" | media=${msg.numMedia > 0}`)

  if (!msg.from) {
    console.warn('[agent/webhook] No sender phone — ignoring')
    return
  }

  try {
    // Find which tenant owns this Meta phone number
    // msg.to is the Meta Phone Number ID from the webhook metadata
    const tenantId = await resolveTenantFromNumber(msg.to)

    if (!tenantId) {
      console.warn(`[agent/webhook] No tenant found for Phone Number ID: ${msg.to}`)
      return
    }

    // Process asynchronously — response already sent
    await agentService.processMessage({
      fromPhone: msg.from,
      text: msg.text,
      mediaUrl: msg.mediaUrl,          // Actually a Meta media ID
      mediaContentType: msg.mediaContentType,
      tenantId
    })
  } catch (err) {
    console.error('[agent/webhook] Processing error:', err)
  }
})

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC: Web Chat Channel (browser PWA)
// ═════════════════════════════════════════════════════════════════════════════
//
// Lets a customer (or anyone with the URL) chat with the same AI agent over
// a browser instead of WhatsApp. Reuses agentService.processMessage entirely —
// only the I/O channel differs (SSE push instead of Meta API).
//
// fromPhone convention for web sessions: "web-<uuid>"
//   - stored as AgentSession.fromPhone (no schema change needed)
//   - messenger.js routes any "web-*" target to webChannel instead of Twilio
//
//   POST /api/agent/web/session   { businessCode, webId? }            → { webId, sessionId, ... }
//   POST /api/agent/web/message   { webId, text }                      → 202 (reply via SSE)
//   POST /api/agent/web/upload    multipart: image + webId + caption?  → 202 (reply via SSE)
//   GET  /api/agent/web/history   ?webId=...                           → { messages: [...] }
//   GET  /api/agent/web/stream    ?webId=...                           → SSE stream
// ─────────────────────────────────────────────────────────────────────────────

// ── POST /web/session ────────────────────────────────────────────────────────
router.post('/web/session', express.json(), async (req, res) => {
  try {
    const { businessCode, webId, mode } = req.body || {}
    if (!businessCode) return res.status(400).json({ error: 'businessCode required' })

    const tenant = await db.tenant.findUnique({ where: { businessCode } })
    if (!tenant) return res.status(404).json({ error: 'Business not found' })

    const cfg = await db.agentConfig.findUnique({ where: { tenantId: tenant.id } })
    if (!cfg || !cfg.isEnabled) {
      return res.status(403).json({ error: 'AI Agent is not active for this business' })
    }

    // Mode: 'direct' (default — customer-facing) or 'supervised' (owner sees
    // formatted reports with manual-match prompts, exactly like WhatsApp).
    const requestedMode = mode === 'supervised' ? 'supervised' : 'direct'

    // Reuse the supplied webId if it points to an active session for this tenant,
    // otherwise mint a fresh one.
    let fromPhone = (typeof webId === 'string' && webId.startsWith('web-')) ? webId : null
    let session = null
    if (fromPhone) {
      session = await db.agentSession.findFirst({
        where: { tenantId: tenant.id, fromPhone, isActive: true }
      })
      // If the existing session has a different mode, refresh it
      if (session && session.mode !== requestedMode) {
        session = await db.agentSession.update({
          where: { id: session.id },
          data: { mode: requestedMode }
        })
      }
    }
    if (!session) {
      fromPhone = `web-${crypto.randomUUID()}`
      session = await db.agentSession.create({
        data: {
          tenantId: tenant.id,
          fromPhone,
          state: 'IDLE',
          mode: requestedMode,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS)
        }
      })
    }

    res.json({
      webId: fromPhone,
      sessionId: session.id,
      state: session.state,
      mode: session.mode,
      tenant: { businessName: tenant.businessName, businessCode: tenant.businessCode },
      greeting: cfg.greeting || null
    })
  } catch (err) {
    console.error('[agent/web/session]', err)
    res.status(500).json({ error: 'Failed to start session' })
  }
})

// ── POST /web/message ────────────────────────────────────────────────────────
router.post('/web/message', express.json(), async (req, res) => {
  try {
    const { webId, text } = req.body || {}
    if (!webId || typeof text !== 'string') {
      return res.status(400).json({ error: 'webId and text required' })
    }
    const session = await db.agentSession.findFirst({
      where: { fromPhone: webId, isActive: true }
    })
    if (!session) return res.status(404).json({ error: 'Session not found' })

    // Acknowledge fast — the agent reply lands via SSE
    res.status(202).json({ ok: true })

    // Persist inbound row immediately so /history reflects what user sent
    await db.agentMessage.create({
      data: {
        sessionId: session.id,
        direction: 'INBOUND',
        messageType: 'TEXT',
        content: text
      }
    })

    // Fire-and-forget agent processing
    agentService.processMessage({
      fromPhone: webId,
      text,
      tenantId: session.tenantId
    }).catch(err => console.error('[agent/web/message] processMessage error:', err))
  } catch (err) {
    console.error('[agent/web/message]', err)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to send message' })
  }
})

// ── POST /web/upload ─────────────────────────────────────────────────────────
router.post('/web/upload', webUpload.single('image'), async (req, res) => {
  try {
    const { webId, caption } = req.body || {}
    if (!webId || !req.file) {
      return res.status(400).json({ error: 'webId and image file required' })
    }
    const session = await db.agentSession.findFirst({
      where: { fromPhone: webId, isActive: true }
    })
    if (!session) return res.status(404).json({ error: 'Session not found' })

    const base64 = req.file.buffer.toString('base64')
    const mimeType = req.file.mimetype
    const dataUrl = `data:${mimeType};base64,${base64}`

    // Persist inbound row so /history shows the customer's own image
    await db.agentMessage.create({
      data: {
        sessionId: session.id,
        direction: 'INBOUND',
        messageType: 'IMAGE',
        content: caption || '',
        imageUrl: dataUrl
      }
    })

    res.status(202).json({ ok: true })

    // Pass imageData directly so processMessage doesn't try to download from Meta
    agentService.processMessage({
      fromPhone: webId,
      text: caption || '',
      imageData: { base64, mimeType },
      tenantId: session.tenantId
    }).catch(err => console.error('[agent/web/upload] processMessage error:', err))
  } catch (err) {
    console.error('[agent/web/upload]', err)
    if (!res.headersSent) res.status(500).json({ error: 'Failed to upload image' })
  }
})

// ── GET /web/history ─────────────────────────────────────────────────────────
router.get('/web/history', async (req, res) => {
  try {
    const { webId } = req.query
    if (!webId) return res.status(400).json({ error: 'webId required' })
    const session = await db.agentSession.findFirst({
      where: { fromPhone: webId, isActive: true }
    })
    if (!session) return res.status(404).json({ error: 'Session not found' })
    const messages = await db.agentMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take: 200
    })
    res.json({
      sessionId: session.id,
      state: session.state,
      messages: messages.map(m => ({
        id: m.id,
        direction: m.direction,
        type: m.messageType,
        content: m.content,
        imageUrl: m.imageUrl,
        createdAt: m.createdAt
      }))
    })
  } catch (err) {
    console.error('[agent/web/history]', err)
    res.status(500).json({ error: 'Failed to load history' })
  }
})

// ── GET /web/stream — Server-Sent Events ─────────────────────────────────────
router.get('/web/stream', async (req, res) => {
  try {
    const { webId } = req.query
    if (!webId) return res.status(400).end()
    const session = await db.agentSession.findFirst({
      where: { fromPhone: webId, isActive: true },
      select: { id: true }
    })
    if (!session) return res.status(404).end()
    webChannel.attach(webId, res)
  } catch (err) {
    console.error('[agent/web/stream]', err)
    if (!res.headersSent) res.status(500).end()
  }
})

// ═════════════════════════════════════════════════════════════════════════════
// PROTECTED: Agent Admin Endpoints
// ═════════════════════════════════════════════════════════════════════════════

// All routes below require valid JWT
router.use(authenticateToken)

// ── GET /api/agent/status ─────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const tenantId = req.user.tenant?.id
    if (!tenantId) return res.status(400).json({ error: 'No tenant associated with this user' })

    const [config, activeSessions, pendingOrders, pendingPayments, totalOrdersToday] = await Promise.all([
      db.agentConfig.findUnique({ where: { tenantId } }),
      db.agentSession.count({ where: { tenantId, isActive: true } }),
      db.order.count({ where: { tenantId, status: 'PENDING' } }),
      db.order.count({ where: { tenantId, status: 'PAYMENT_RECEIVED' } }),
      db.order.count({
        where: {
          tenantId,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }
      })
    ])

    res.json({
      isEnabled: config?.isEnabled ?? false,
      mode: config?.mode ?? 'supervised',
      aiProvider: config?.aiProvider ?? 'anthropic',
      aiModel: config?.aiModel ?? 'claude-3-5-sonnet-20241022',
      providerInfo: aiService.getProviderInfo(),
      stats: {
        activeSessions,
        pendingOrders,
        pendingPayments,
        totalOrdersToday
      }
    })
  } catch (err) {
    console.error('[agent/status]', err)
    res.status(500).json({ error: 'Failed to fetch status' })
  }
})

// ── GET /api/agent/config ─────────────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    const tenantId = req.user.tenant?.id
    if (!tenantId) return res.status(400).json({ error: 'No tenant' })

    let config = await db.agentConfig.findUnique({ where: { tenantId } })

    // Return defaults if not configured yet
    if (!config) {
      config = {
        tenantId,
        mode: 'supervised',
        ownerPhone: '',
        aiProvider: 'anthropic',
        aiModel: 'claude-3-5-sonnet-20241022',
        isEnabled: false,
        packingTeamPhone: null,
        deliveryTeamPhone: null,
        greeting: null
      }
    }

    // Mask partial phone for security
    res.json(config)
  } catch (err) {
    console.error('[agent/config GET]', err)
    res.status(500).json({ error: 'Failed to fetch config' })
  }
})

// ── PUT /api/agent/config ─────────────────────────────────────────────────────
router.put('/config', async (req, res) => {
  try {
    const tenantId = req.user.tenant?.id
    if (!tenantId) return res.status(400).json({ error: 'No tenant' })

    const {
      mode,
      ownerPhone,
      aiProvider,
      aiModel,
      isEnabled,
      packingTeamPhone,
      deliveryTeamPhone,
      greeting
    } = req.body

    // Validate mode
    if (mode && !['supervised', 'direct'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be supervised or direct' })
    }

    // Validate aiProvider
    if (aiProvider && !['anthropic', 'openai'].includes(aiProvider)) {
      return res.status(400).json({ error: 'aiProvider must be anthropic or openai' })
    }

    const data = {}
    if (mode !== undefined) data.mode = mode
    if (ownerPhone !== undefined) data.ownerPhone = ownerPhone.replace(/\D/g, '')
    if (aiProvider !== undefined) data.aiProvider = aiProvider
    if (aiModel !== undefined) data.aiModel = aiModel
    if (isEnabled !== undefined) data.isEnabled = Boolean(isEnabled)
    if (packingTeamPhone !== undefined) data.packingTeamPhone = packingTeamPhone
    if (deliveryTeamPhone !== undefined) data.deliveryTeamPhone = deliveryTeamPhone
    if (greeting !== undefined) data.greeting = greeting

    const config = await db.agentConfig.upsert({
      where: { tenantId },
      update: data,
      create: {
        tenantId,
        mode: mode || 'supervised',
        ownerPhone: (ownerPhone || '').replace(/\D/g, ''),
        aiProvider: aiProvider || 'anthropic',
        aiModel: aiModel || 'claude-3-5-sonnet-20241022',
        isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : false,
        packingTeamPhone: packingTeamPhone || null,
        deliveryTeamPhone: deliveryTeamPhone || null,
        greeting: greeting || null
      }
    })

    res.json({ success: true, config })
  } catch (err) {
    console.error('[agent/config PUT]', err)
    res.status(500).json({ error: 'Failed to update config' })
  }
})

// ── GET /api/agent/sessions ───────────────────────────────────────────────────
router.get('/sessions', async (req, res) => {
  try {
    const tenantId = req.user.tenant?.id
    if (!tenantId) return res.status(400).json({ error: 'No tenant' })

    const { active, state, page = 1, limit = 20 } = req.query
    const skip = (parseInt(page) - 1) * parseInt(limit)

    const where = { tenantId }
    if (active === 'true') where.isActive = true
    if (active === 'false') where.isActive = false
    if (state) where.state = state

    const [sessions, total] = await Promise.all([
      db.agentSession.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: parseInt(limit),
        include: {
          _count: { select: { messages: true } }
        }
      }),
      db.agentSession.count({ where })
    ])

    // Parse sessionData for each session
    const enriched = sessions.map(s => ({
      ...s,
      sessionData: parseJSON(s.sessionData),
      messageHistory: undefined // Don't send full history in list
    }))

    res.json({ sessions: enriched, total, page: parseInt(page), limit: parseInt(limit) })
  } catch (err) {
    console.error('[agent/sessions]', err)
    res.status(500).json({ error: 'Failed to fetch sessions' })
  }
})

// ── GET /api/agent/sessions/:id ───────────────────────────────────────────────
router.get('/sessions/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenant?.id
    if (!tenantId) return res.status(400).json({ error: 'No tenant' })

    const session = await db.agentSession.findFirst({
      where: { id: req.params.id, tenantId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } }
      }
    })

    if (!session) return res.status(404).json({ error: 'Session not found' })

    res.json({
      ...session,
      sessionData: parseJSON(session.sessionData),
      messageHistory: parseJSON(session.messageHistory)
    })
  } catch (err) {
    console.error('[agent/sessions/:id]', err)
    res.status(500).json({ error: 'Failed to fetch session' })
  }
})

// ── POST /api/agent/sessions/:id/reset ────────────────────────────────────────
router.post('/sessions/:id/reset', async (req, res) => {
  try {
    const tenantId = req.user.tenant?.id
    if (!tenantId) return res.status(400).json({ error: 'No tenant' })

    const session = await db.agentSession.findFirst({
      where: { id: req.params.id, tenantId }
    })

    if (!session) return res.status(404).json({ error: 'Session not found' })

    const updated = await db.agentSession.update({
      where: { id: session.id },
      data: {
        state: 'IDLE',
        sessionData: '{}',
        messageHistory: '[]',
        pendingOrderId: null,
        customerId: null,
        isActive: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    })

    res.json({ success: true, session: updated })
  } catch (err) {
    console.error('[agent/sessions/:id/reset]', err)
    res.status(500).json({ error: 'Failed to reset session' })
  }
})

// ── POST /api/agent/sessions/:id/cancel ───────────────────────────────────────
router.post('/sessions/:id/cancel', async (req, res) => {
  try {
    const tenantId = req.user.tenant?.id
    if (!tenantId) return res.status(400).json({ error: 'No tenant' })

    const session = await db.agentSession.findFirst({
      where: { id: req.params.id, tenantId }
    })

    if (!session) return res.status(404).json({ error: 'Session not found' })

    await db.agentSession.update({
      where: { id: session.id },
      data: { state: 'CANCELLED', isActive: false }
    })

    res.json({ success: true })
  } catch (err) {
    console.error('[agent/sessions/:id/cancel]', err)
    res.status(500).json({ error: 'Failed to cancel session' })
  }
})

// ── POST /api/agent/test ──────────────────────────────────────────────────────
// Test the AI connection without actually sending WhatsApp messages
router.post('/test', async (req, res) => {
  try {
    const { message = 'Hello, are you working?' } = req.body
    const providerInfo = aiService.getProviderInfo()

    const reply = await aiService.chat(
      [{ role: 'user', content: message }],
      { systemPrompt: 'You are a helpful assistant for a dress business in Pakistan. Reply in 1-2 sentences.', maxTokens: 100 }
    )

    res.json({ success: true, provider: providerInfo, reply })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Resolve which tenant owns the incoming Meta Phone Number ID.
 *
 * @param {string} phoneNumberId - Meta Phone Number ID from webhook metadata
 *                                 e.g. "1006993515830269"
 */
async function resolveTenantFromNumber (phoneNumberId) {
  // Strategy 1: single-tenant shortcut — match META_PHONE_NUMBER_ID env var
  const envPhoneNumberId = process.env.META_PHONE_NUMBER_ID || ''

  if (envPhoneNumberId && (envPhoneNumberId === phoneNumberId || !phoneNumberId)) {
    // Use first enabled agent config
    const config = await db.agentConfig.findFirst({ where: { isEnabled: true } })
    return config?.tenantId || null
  }

  // Strategy 2: if no env match (e.g. different number or multi-tenant future),
  // fall back to any enabled config
  const config = await db.agentConfig.findFirst({ where: { isEnabled: true } })
  return config?.tenantId || null
}

function parseJSON (raw) {
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

module.exports = router
