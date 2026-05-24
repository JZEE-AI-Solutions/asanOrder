/**
 * WebChat.jsx — Public WhatsApp-style chat with the AI Agent.
 * URL: /chat/:businessCode
 *
 * - No auth: anonymous customers chat directly.
 * - On mount: gets/creates a webId in localStorage, calls /web/session,
 *   loads /web/history, opens /web/stream SSE.
 * - Sends text/images via /web/message, /web/upload.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  startSession, fetchHistory, sendText, sendImage,
  openStream, getStoredWebId, storeWebId, clearWebId
} from '../services/webChat'

// Client-side detection only — the actual /business/quick-add page is still
// gated by ProtectedRoute + backend JWT auth, so non-owners can't bypass.
function hasAuthToken () {
  try { return !!localStorage.getItem('token') } catch { return false }
}

function Bubble ({ msg }) {
  const isOutbound = msg.direction === 'OUTBOUND' // from agent
  const align = isOutbound ? 'justify-start' : 'justify-end'
  const tone  = isOutbound
    ? 'bg-white text-gray-900 border border-gray-200'
    : 'bg-emerald-500 text-white'
  return (
    <div className={`flex ${align}`}>
      <div className={`max-w-[78%] rounded-2xl px-3 py-2 my-1 shadow-sm ${tone}`}>
        {msg.imageUrl && (
          <img
            src={msg.imageUrl}
            alt=""
            className="rounded-lg mb-1 max-h-72 object-contain"
            loading="lazy"
          />
        )}
        {msg.content && (
          <div className="whitespace-pre-wrap text-sm leading-snug">{msg.content}</div>
        )}
        <div className={`text-[10px] mt-1 ${isOutbound ? 'text-gray-400' : 'text-emerald-100'}`}>
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

export default function WebChat () {
  const { businessCode } = useParams()
  const [searchParams] = useSearchParams()
  const requestedMode = searchParams.get('mode') === 'supervised' ? 'supervised' : 'direct'
  const [status,     setStatus]     = useState('connecting') // connecting | ready | error
  const [errorMsg,   setErrorMsg]   = useState('')
  const [tenant,     setTenant]     = useState(null)
  const [webId,      setWebId]      = useState(null)
  const [sessionMode, setSessionMode] = useState('direct')
  const [messages,   setMessages]   = useState([])
  const [input,      setInput]      = useState('')
  const [sending,    setSending]    = useState(false)
  const scrollRef = useRef(null)
  const esRef     = useRef(null)
  const fileRef   = useRef(null)
  const backoffRef = useRef(0)

  // ── 1. Bootstrap session ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Use a mode-specific localStorage key so switching modes via URL
        // gets a fresh session instead of reusing the other mode's webId.
        const storageCode = `${businessCode}:${requestedMode}`
        const existing = getStoredWebId(storageCode)
        const s = await startSession(businessCode, existing, requestedMode)
        if (cancelled) return
        storeWebId(storageCode, s.webId)
        setWebId(s.webId)
        setTenant(s.tenant)
        setSessionMode(s.mode || requestedMode)
        const hist = await fetchHistory(s.webId)
        if (cancelled) return
        setMessages(hist.length ? hist : (s.greeting
          ? [{
              id: 'greet',
              direction: 'OUTBOUND',
              type: 'TEXT',
              content: s.greeting,
              createdAt: new Date().toISOString()
            }]
          : []))
        setStatus('ready')
      } catch (err) {
        const msg = err?.response?.data?.error || err.message || 'Failed to start chat'
        // If the stored webId pointed to an expired session, clear it and retry once.
        const storageCode = `${businessCode}:${requestedMode}`
        if (err?.response?.status === 404 && getStoredWebId(storageCode)) {
          clearWebId(storageCode)
          window.location.reload()
          return
        }
        setErrorMsg(msg)
        setStatus('error')
      }
    })()
    return () => { cancelled = true }
  }, [businessCode])

  // ── 2. SSE stream with reconnect ────────────────────────────────────────
  const connectStream = useCallback((id) => {
    if (!id) return
    const es = openStream(id, (m) => {
      setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
      backoffRef.current = 0
    }, () => {
      // EventSource auto-reconnects, but if it errors out we manually re-open
      try { es.close() } catch {}
      const delay = Math.min(30000, 3000 * Math.pow(2, backoffRef.current))
      backoffRef.current += 1
      setTimeout(() => connectStream(id), delay)
    })
    esRef.current = es
  }, [])

  useEffect(() => {
    if (status === 'ready' && webId) connectStream(webId)
    return () => { try { esRef.current?.close() } catch {} }
  }, [status, webId, connectStream])

  // ── 3. Auto-scroll on new messages ──────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // ── 4. Send handlers ────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e?.preventDefault?.()
    const text = input.trim()
    if (!text || sending || !webId) return
    setSending(true)
    // Optimistic render
    const optimistic = {
      id: `local-${Date.now()}`,
      direction: 'INBOUND',
      type: 'TEXT',
      content: text,
      createdAt: new Date().toISOString()
    }
    setMessages(prev => [...prev, optimistic])
    setInput('')
    try {
      await sendText(webId, text)
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === optimistic.id ? { ...m, content: m.content + ' ⚠️ (failed)' } : m
      ))
    } finally {
      setSending(false)
    }
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !webId) return
    setSending(true)
    const dataUrl = await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result)
      fr.readAsDataURL(file)
    })
    const optimistic = {
      id: `local-${Date.now()}`,
      direction: 'INBOUND',
      type: 'IMAGE',
      content: '',
      imageUrl: dataUrl,
      createdAt: new Date().toISOString()
    }
    setMessages(prev => [...prev, optimistic])
    try {
      await sendImage(webId, file, '')
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === optimistic.id ? { ...m, content: '⚠️ Upload failed' } : m
      ))
    } finally {
      setSending(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (status === 'connecting') {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Connecting…
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center bg-white rounded-xl shadow p-6">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Chat unavailable</h1>
          <p className="text-sm text-gray-600 mb-4">{errorMsg}</p>
          <button
            className="px-4 py-2 rounded-md bg-emerald-500 text-white text-sm"
            onClick={() => window.location.reload()}
          >Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#e7ded5]">
      {/* Header */}
      <header className="bg-emerald-700 text-white px-4 py-3 shadow flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center font-bold">
          {tenant?.businessName?.[0] || 'A'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{tenant?.businessName || 'AI Assistant'}</div>
          <div className="text-xs opacity-80">online</div>
        </div>
        {/* Quick-Add shortcut — visible only when an auth token is in localStorage. */}
        {hasAuthToken() && (
          <a
            href="/business/quick-add"
            className="text-xs bg-white text-emerald-700 px-3 py-1.5 rounded-full font-medium shadow hover:bg-emerald-50"
            title="Add a product fast — owner only">
            + Add Product
          </a>
        )}
        {sessionMode === 'supervised' && (
          <span className="text-[10px] uppercase tracking-wide bg-amber-400 text-amber-900 px-2 py-1 rounded-full font-bold">
            Owner&nbsp;Mode
          </span>
        )}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 text-sm mt-12">
            Send a dress photo or type a message to start.
          </div>
        )}
        {messages.map((m) => <Bubble key={m.id} msg={m} />)}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="bg-[#f0f0f0] px-2 py-2 flex items-end gap-2 border-t border-gray-300"
      >
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="p-2 rounded-full hover:bg-gray-200 text-gray-600"
          aria-label="Attach image"
          disabled={sending}
        >
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Type a message"
          className="flex-1 resize-none rounded-2xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 max-h-40"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="px-4 py-2 rounded-full bg-emerald-500 text-white text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
