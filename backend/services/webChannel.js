/**
 * webChannel.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Web (browser) channel for the AI Agent. Mirrors twilioService's outbound
 * API surface (sendMessage / sendMediaMessage) but instead of calling Meta,
 * it:
 *   1. Persists an OUTBOUND AgentMessage row.
 *   2. Pushes the message over Server-Sent Events to every connected client
 *      for that webId (a customer may have the page open in multiple tabs).
 *
 * Conventions:
 *   - `webId`        = "web-<uuid>"  (also stored as AgentSession.fromPhone)
 *   - SSE event data = JSON.stringify({ id, direction, type, content, imageUrl, createdAt })
 * ─────────────────────────────────────────────────────────────────────────────
 */

const db = require('../lib/db')

// webId -> Set<res>
const clients = new Map()

/**
 * Attach an SSE response to a webId. Called from the GET /web/stream route.
 * The response stays open; close handler cleans up.
 */
function attach (webId, res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // disable proxy buffering (nginx)
  // Flush headers immediately so the browser sees the stream open
  if (typeof res.flushHeaders === 'function') res.flushHeaders()
  res.write(': connected\n\n')

  const set = clients.get(webId) || new Set()
  set.add(res)
  clients.set(webId, set)

  // Heartbeat every 25 s so intermediate proxies don't kill idle streams
  const ping = setInterval(() => {
    try { res.write(': ping\n\n') } catch { /* connection already closed */ }
  }, 25000)

  const cleanup = () => {
    clearInterval(ping)
    set.delete(res)
    if (set.size === 0) clients.delete(webId)
  }
  res.on('close', cleanup)
  res.on('error', cleanup)
}

/**
 * Push a JSON payload to every SSE client currently attached to `webId`.
 */
function push (webId, payload) {
  const set = clients.get(webId)
  if (!set || set.size === 0) return
  const line = `data: ${JSON.stringify(payload)}\n\n`
  for (const r of set) {
    try { r.write(line) } catch { /* dead socket — cleanup on next 'close' */ }
  }
}

/** Lookup the active AgentSession id for a webId. */
async function findSessionId (webId) {
  const s = await db.agentSession.findFirst({
    where: { fromPhone: webId, isActive: true },
    select: { id: true }
  })
  return s ? s.id : null
}

/**
 * Send a text reply to a web client.
 * Persists an OUTBOUND AgentMessage and pushes via SSE.
 */
async function sendMessage (to, body) {
  const sessionId = await findSessionId(to)
  if (!sessionId) {
    console.warn(`[webChannel] No active session for ${to}; reply dropped`)
    return null
  }
  const row = await db.agentMessage.create({
    data: { sessionId, direction: 'OUTBOUND', messageType: 'TEXT', content: body }
  })
  push(to, {
    id: row.id,
    direction: 'OUTBOUND',
    type: 'TEXT',
    content: body,
    imageUrl: null,
    createdAt: row.createdAt
  })
  return row.id
}

/**
 * Send an image (+ optional caption) reply to a web client.
 * `mediaUrl` may be any URL the browser can fetch (eg. /api/images/public/...).
 */
async function sendMediaMessage (to, body, mediaUrl) {
  const sessionId = await findSessionId(to)
  if (!sessionId) {
    console.warn(`[webChannel] No active session for ${to}; media reply dropped`)
    return null
  }
  const row = await db.agentMessage.create({
    data: {
      sessionId,
      direction: 'OUTBOUND',
      messageType: 'IMAGE',
      content: body || '',
      imageUrl: mediaUrl
    }
  })
  push(to, {
    id: row.id,
    direction: 'OUTBOUND',
    type: 'IMAGE',
    content: body || '',
    imageUrl: mediaUrl,
    createdAt: row.createdAt
  })
  return row.id
}

module.exports = { attach, push, sendMessage, sendMediaMessage }
