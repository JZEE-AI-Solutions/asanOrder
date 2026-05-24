/**
 * webChat.js — REST + SSE client for the public AI Agent chat page.
 * Reuses the same backend agent (state machine, AI, orders) — the only
 * difference vs WhatsApp is the transport (HTTP + SSE here).
 */
import axios from 'axios'

// Use VITE_API_URL when set (production), otherwise rely on Vite's proxy (dev).
const API_BASE = (import.meta.env && import.meta.env.VITE_API_URL) || ''
const API = `${API_BASE}/api/agent/web`
const storageKey = (code) => `asanchat:webId:${code}`

export function getStoredWebId (businessCode) {
  try { return localStorage.getItem(storageKey(businessCode)) } catch { return null }
}

export function storeWebId (businessCode, webId) {
  try { localStorage.setItem(storageKey(businessCode), webId) } catch { /* ignore */ }
}

export function clearWebId (businessCode) {
  try { localStorage.removeItem(storageKey(businessCode)) } catch { /* ignore */ }
}

export async function startSession (businessCode, existingWebId, mode) {
  const { data } = await axios.post(`${API}/session`, {
    businessCode,
    webId: existingWebId || null,
    mode: mode || undefined
  })
  return data // { webId, sessionId, state, mode, tenant, greeting }
}

export async function fetchHistory (webId) {
  const { data } = await axios.get(`${API}/history`, { params: { webId } })
  return data.messages || []
}

export async function sendText (webId, text) {
  await axios.post(`${API}/message`, { webId, text })
}

export async function sendImage (webId, file, caption = '') {
  const fd = new FormData()
  fd.append('image', file)
  fd.append('webId', webId)
  if (caption) fd.append('caption', caption)
  await axios.post(`${API}/upload`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

/**
 * Open an SSE connection. Returns an EventSource that auto-reconnects
 * with exponential backoff via `onclose` recreation (caller wraps).
 */
export function openStream (webId, onMessage, onError) {
  const url = `${API}/stream?webId=${encodeURIComponent(webId)}`
  const es = new EventSource(url)
  es.onmessage = (ev) => {
    try { onMessage(JSON.parse(ev.data)) } catch { /* heartbeat or malformed */ }
  }
  es.onerror = (err) => { if (onError) onError(err) }
  return es
}
