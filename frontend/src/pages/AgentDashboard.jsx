import { useState, useEffect, useCallback, useRef } from 'react'
import {
  SparklesIcon,
  PhoneIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  CogIcon,
  BeakerIcon,
  ClockIcon,
  SignalIcon,
  XMarkIcon,
  ChevronRightIcon,
  BoltIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'
import agentService from '../services/agentService'

// ─── State badge colours ──────────────────────────────────────────────────────
const STATE_BADGE = {
  IDLE:               { label: 'Idle',              bg: 'bg-gray-100',   text: 'text-gray-600' },
  CHECKING_STOCK:     { label: 'Checking Stock',    bg: 'bg-blue-100',   text: 'text-blue-700' },
  COLLECTING_NAME:    { label: 'Collecting Name',   bg: 'bg-blue-100',   text: 'text-blue-700' },
  COLLECTING_ADDRESS: { label: 'Coll. Address',     bg: 'bg-blue-100',   text: 'text-blue-700' },
  COLLECTING_CITY:    { label: 'Coll. City',        bg: 'bg-blue-100',   text: 'text-blue-700' },
  COLLECTING_PHONE:   { label: 'Coll. Phone',       bg: 'bg-blue-100',   text: 'text-blue-700' },
  AWAITING_PAYMENT:   { label: 'Awaiting Payment',  bg: 'bg-yellow-100', text: 'text-yellow-700' },
  VERIFYING_PAYMENT:  { label: 'Verifying Payment', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  CONFIRMED:          { label: 'Confirmed',         bg: 'bg-green-100',  text: 'text-green-700' },
  CANCELLED:          { label: 'Cancelled',         bg: 'bg-red-100',    text: 'text-red-600' },
}

function StateBadge({ state }) {
  const cfg = STATE_BADGE[state] || { label: state, bg: 'bg-gray-100', text: 'text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ─── Stats card ───────────────────────────────────────────────────────────────
function StatsCard({ label, value, icon: Icon, color }) {
  const colors = {
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-500',   val: 'text-blue-700' },
    yellow: { bg: 'bg-yellow-50', icon: 'text-yellow-500', val: 'text-yellow-700' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-500',  val: 'text-green-700' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-500', val: 'text-purple-700' },
  }
  const c = colors[color] || colors.blue
  return (
    <div className={`rounded-2xl p-5 ${c.bg} flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm`}>
        <Icon className={`w-6 h-6 ${c.icon}`} />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className={`text-2xl font-bold ${c.val}`}>{value ?? '—'}</p>
      </div>
    </div>
  )
}

// ─── Chat bubble ─────────────────────────────────────────────────────────────
function ChatBubble({ msg }) {
  const isIn = msg.direction === 'INBOUND'
  const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  return (
    <div className={`flex ${isIn ? 'justify-start' : 'justify-end'} mb-2`}>
      <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm shadow-sm ${
        isIn
          ? 'bg-gray-100 text-gray-800 rounded-tl-none'
          : 'bg-brand-500 text-white rounded-tr-none'
      }`}>
        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
        {time && <p className={`text-[10px] mt-1 ${isIn ? 'text-gray-400' : 'text-brand-100'}`}>{time}</p>}
      </div>
    </div>
  )
}

// ─── Session detail panel ─────────────────────────────────────────────────────
function SessionPanel({ session, onClose, onReset, onCancel }) {
  const messagesEndRef = useRef(null)
  const [resetting, setResetting] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.messages])

  const sessionData = session?.sessionData || {}
  const messages = session?.messages || []

  async function handleReset() {
    setResetting(true)
    try {
      await agentService.resetSession(session.id)
      toast.success('Session reset')
      onReset()
    } catch {
      toast.error('Failed to reset session')
    } finally {
      setResetting(false)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    try {
      await agentService.cancelSession(session.id)
      toast.success('Session cancelled')
      onCancel()
    } catch {
      toast.error('Failed to cancel session')
    } finally {
      setCancelling(false)
    }
  }

  if (!session) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* backdrop */}
      <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" />
      {/* panel */}
      <div
        className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <p className="font-bold text-gray-900 flex items-center gap-2">
              <PhoneIcon className="w-4 h-4 text-gray-400" />
              {session.fromPhone}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <StateBadge state={session.state} />
              {session.isActive && (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Active
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Session data pills */}
        {Object.keys(sessionData).length > 0 && (
          <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-2">
            {sessionData.selectedDress && (
              <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs font-medium">
                👗 {sessionData.selectedDress}
              </span>
            )}
            {sessionData.customerName && (
              <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                👤 {sessionData.customerName}
              </span>
            )}
            {sessionData.city && (
              <span className="px-2 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-medium">
                📍 {sessionData.city}
              </span>
            )}
            {sessionData.totalAmount && (
              <span className="px-2 py-1 bg-yellow-50 text-yellow-700 rounded-lg text-xs font-medium">
                💰 Rs.{sessionData.totalAmount}
              </span>
            )}
          </div>
        )}

        {/* Chat history */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ChatBubbleLeftRightIcon className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-sm">No messages yet</p>
            </div>
          ) : (
            messages.map((msg, i) => <ChatBubble key={msg.id || i} msg={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 font-semibold text-sm hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            <ArrowPathIcon className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
            {resetting ? 'Resetting…' : 'Reset'}
          </button>
          <button
            onClick={handleCancel}
            disabled={cancelling || session.state === 'CANCELLED'}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 text-red-600 font-semibold text-sm hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            <XCircleIcon className="w-4 h-4" />
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function AgentDashboard() {
  const [activeTab, setActiveTab] = useState('sessions')

  // Data state
  const [status, setStatus] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingSessions, setLoadingSessions] = useState(true)

  // Config state
  const [config, setConfig] = useState(null)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configForm, setConfigForm] = useState({
    mode: 'supervised',
    ownerPhone: '',
    aiProvider: 'anthropic',
    aiModel: 'claude-3-5-sonnet-20241022',
    packingTeamPhone: '',
    deliveryTeamPhone: '',
    isEnabled: true,
  })

  // Test AI state
  const [testMessage, setTestMessage] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Session panel
  const [selectedSession, setSelectedSession] = useState(null)
  const [loadingSessionDetail, setLoadingSessionDetail] = useState(false)

  // ── Fetchers ────────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await agentService.getStatus()
      setStatus(res.data)
    } catch {
      // silently ignore — status may not be configured yet
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  const fetchSessions = useCallback(async () => {
    try {
      const res = await agentService.getSessions({ limit: 50 })
      setSessions(res.data?.sessions || res.data || [])
    } catch {
      setSessions([])
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  const fetchConfig = useCallback(async () => {
    setLoadingConfig(true)
    try {
      const res = await agentService.getConfig()
      const data = res.data
      setConfig(data)
      setConfigForm({
        mode:              data.mode              || 'supervised',
        ownerPhone:        data.ownerPhone        || '',
        aiProvider:        data.aiProvider        || 'anthropic',
        aiModel:           data.aiModel           || 'claude-3-5-sonnet-20241022',
        packingTeamPhone:  data.packingTeamPhone  || '',
        deliveryTeamPhone: data.deliveryTeamPhone || '',
        isEnabled:         data.isEnabled         !== false,
      })
    } catch {
      // config may not exist yet — that's fine
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  // Initial load + 30-second poll
  useEffect(() => {
    fetchStatus()
    fetchSessions()
  }, [fetchStatus, fetchSessions])

  useEffect(() => {
    const id = setInterval(() => {
      fetchStatus()
      fetchSessions()
    }, 30_000)
    return () => clearInterval(id)
  }, [fetchStatus, fetchSessions])

  useEffect(() => {
    if (activeTab === 'config') fetchConfig()
  }, [activeTab, fetchConfig])

  // ── Session detail ──────────────────────────────────────────────────────────
  async function openSession(session) {
    setLoadingSessionDetail(true)
    setSelectedSession(session)
    try {
      const res = await agentService.getSession(session.id)
      setSelectedSession(res.data)
    } catch {
      toast.error('Could not load session detail')
    } finally {
      setLoadingSessionDetail(false)
    }
  }

  function handleSessionMutated() {
    setSelectedSession(null)
    fetchSessions()
    fetchStatus()
  }

  // ── Config save ─────────────────────────────────────────────────────────────
  async function handleSaveConfig(e) {
    e.preventDefault()
    setSavingConfig(true)
    try {
      const res = await agentService.updateConfig(configForm)
      setConfig(res.data)
      toast.success('Configuration saved')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save config')
    } finally {
      setSavingConfig(false)
    }
  }

  // ── AI test ─────────────────────────────────────────────────────────────────
  async function handleTestAI() {
    if (!testMessage.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await agentService.testAI(testMessage)
      setTestResult({ ok: true, data: res.data })
    } catch (err) {
      setTestResult({ ok: false, error: err?.response?.data?.error || 'Connection failed' })
    } finally {
      setTesting(false)
    }
  }

  // ── Derived stats ───────────────────────────────────────────────────────────
  const activeSessions   = status?.sessions?.active    ?? sessions.filter(s => s.isActive).length
  const pendingOrders    = status?.sessions?.pendingOrders    ?? 0
  const pendingPayments  = status?.sessions?.pendingPayments  ?? 0
  const providerLabel    = status?.ai?.provider ? status.ai.provider.toUpperCase() : '—'

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <ModernLayout>
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-brand-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Agent</h1>
            <p className="text-sm text-gray-500">WhatsApp order automation</p>
          </div>
        </div>

        {/* Mode badge */}
        {status?.config?.mode && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold shadow-sm ${
            status.config.mode === 'direct'
              ? 'bg-green-50 text-green-700'
              : 'bg-blue-50 text-blue-700'
          }`}>
            {status.config.mode === 'direct'
              ? <><BoltIcon className="w-4 h-4" /> Direct Mode</>
              : <><ShieldCheckIcon className="w-4 h-4" /> Supervised Mode</>
            }
          </div>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard label="Active Sessions"   value={loadingStatus ? '…' : activeSessions}   icon={ChatBubbleLeftRightIcon} color="blue" />
        <StatsCard label="Pending Orders"    value={loadingStatus ? '…' : pendingOrders}     icon={ClockIcon}               color="yellow" />
        <StatsCard label="Pending Payments"  value={loadingStatus ? '…' : pendingPayments}   icon={SignalIcon}              color="purple" />
        <StatsCard label="AI Provider"       value={loadingStatus ? '…' : providerLabel}     icon={SparklesIcon}            color="green" />
      </div>

      {/* ── Tabs ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {[
            { id: 'sessions', label: 'Sessions',      icon: ChatBubbleLeftRightIcon },
            { id: 'config',   label: 'Configuration', icon: CogIcon },
            { id: 'test',     label: 'Test AI',       icon: BeakerIcon },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-600 bg-brand-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Sessions tab ── */}
        {activeTab === 'sessions' && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">{sessions.length} session(s) total</p>
              <button
                onClick={() => { setLoadingSessions(true); fetchSessions() }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${loadingSessions ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {loadingSessions ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <ArrowPathIcon className="w-6 h-6 animate-spin mr-2" />
                Loading sessions…
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <ChatBubbleLeftRightIcon className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium text-gray-500">No sessions yet</p>
                <p className="text-sm mt-1">Sessions appear here when customers message your WhatsApp number.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                      <th className="pb-3 pr-4">Phone</th>
                      <th className="pb-3 pr-4">State</th>
                      <th className="pb-3 pr-4">Messages</th>
                      <th className="pb-3 pr-4">Last Active</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sessions.map(session => (
                      <tr
                        key={session.id}
                        onClick={() => openSession(session)}
                        className="cursor-pointer hover:bg-brand-50/50 transition-colors group"
                      >
                        <td className="py-3 pr-4 font-medium text-gray-900 flex items-center gap-2">
                          <PhoneIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
                          {session.fromPhone}
                          <ChevronRightIcon className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                        </td>
                        <td className="py-3 pr-4">
                          <StateBadge state={session.state} />
                        </td>
                        <td className="py-3 pr-4 text-gray-500">
                          {session._count?.messages ?? session.messages?.length ?? '—'}
                        </td>
                        <td className="py-3 pr-4 text-gray-500">
                          {session.updatedAt
                            ? new Date(session.updatedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                            : '—'}
                        </td>
                        <td className="py-3">
                          {session.isActive
                            ? <span className="inline-flex items-center gap-1 text-xs text-green-600 font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Active</span>
                            : <span className="text-xs text-gray-400 font-medium">Inactive</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Configuration tab ── */}
        {activeTab === 'config' && (
          <div className="p-6 max-w-2xl">
            {loadingConfig ? (
              <div className="flex items-center gap-2 py-8 text-gray-400">
                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                Loading configuration…
              </div>
            ) : (
              <form onSubmit={handleSaveConfig} className="space-y-6">

                {/* Agent toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="font-semibold text-gray-900">Agent Enabled</p>
                    <p className="text-sm text-gray-500">Turn off to pause all AI responses</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfigForm(f => ({ ...f, isEnabled: !f.isEnabled }))}
                    className={`relative inline-flex w-12 h-6 rounded-full transition-colors focus:outline-none ${
                      configForm.isEnabled ? 'bg-brand-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      configForm.isEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* Mode */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Agent Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { val: 'supervised', label: 'Supervised', desc: 'Owner forwards messages to AI', icon: ShieldCheckIcon },
                      { val: 'direct',     label: 'Direct',     desc: 'Customers talk to AI directly', icon: BoltIcon },
                    ].map(opt => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setConfigForm(f => ({ ...f, mode: opt.val }))}
                        className={`p-4 rounded-xl border-2 text-left transition-colors ${
                          configForm.mode === opt.val
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <opt.icon className={`w-5 h-5 mb-1 ${configForm.mode === opt.val ? 'text-brand-600' : 'text-gray-400'}`} />
                        <p className={`font-semibold text-sm ${configForm.mode === opt.val ? 'text-brand-700' : 'text-gray-700'}`}>{opt.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Owner phone */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Owner WhatsApp Number
                  </label>
                  <p className="text-xs text-gray-400 mb-2">Include country code, no spaces (e.g. 923001234567)</p>
                  <input
                    type="text"
                    value={configForm.ownerPhone}
                    onChange={e => setConfigForm(f => ({ ...f, ownerPhone: e.target.value }))}
                    placeholder="923001234567"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                </div>

                {/* AI Provider */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">AI Provider</label>
                  <div className="flex gap-3">
                    {['anthropic', 'openai'].map(p => (
                      <label key={p} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="aiProvider"
                          value={p}
                          checked={configForm.aiProvider === p}
                          onChange={() => setConfigForm(f => ({ ...f, aiProvider: p }))}
                          className="accent-brand-500"
                        />
                        <span className="text-sm font-medium text-gray-700 capitalize">{p === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI (GPT)'}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* AI Model */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">AI Model</label>
                  <input
                    type="text"
                    value={configForm.aiModel}
                    onChange={e => setConfigForm(f => ({ ...f, aiModel: e.target.value }))}
                    placeholder={configForm.aiProvider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o'}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                </div>

                {/* Team phones */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Packing Team WhatsApp</label>
                    <input
                      type="text"
                      value={configForm.packingTeamPhone}
                      onChange={e => setConfigForm(f => ({ ...f, packingTeamPhone: e.target.value }))}
                      placeholder="923001234567"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Delivery Team WhatsApp</label>
                    <input
                      type="text"
                      value={configForm.deliveryTeamPhone}
                      onChange={e => setConfigForm(f => ({ ...f, deliveryTeamPhone: e.target.value }))}
                      placeholder="923001234567"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-brand-500 to-brand-600 text-white font-semibold rounded-xl hover:from-brand-600 hover:to-brand-700 disabled:opacity-50 transition-all shadow-lg shadow-brand-500/20"
                >
                  {savingConfig ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                  {savingConfig ? 'Saving…' : 'Save Configuration'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Test AI tab ── */}
        {activeTab === 'test' && (
          <div className="p-6 max-w-xl">
            <p className="text-sm text-gray-500 mb-4">
              Send a test message to verify your AI provider connection. This bypasses the WhatsApp flow and
              talks directly to the AI.
            </p>

            {/* Provider info */}
            {status?.ai && (
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl mb-5">
                <SparklesIcon className="w-5 h-5 text-purple-500 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-gray-800">{status.ai.provider?.toUpperCase() || '—'}</p>
                  <p className="text-gray-500">{status.ai.model || '—'}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={testMessage}
                onChange={e => setTestMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTestAI()}
                placeholder="Type a test message…"
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
              <button
                onClick={handleTestAI}
                disabled={testing || !testMessage.trim()}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-brand-600 text-white font-semibold rounded-xl disabled:opacity-50 hover:from-purple-600 hover:to-brand-700 transition-all text-sm"
              >
                {testing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : 'Test'}
              </button>
            </div>

            {testResult && (
              <div className={`p-4 rounded-xl border ${
                testResult.ok
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {testResult.ok
                    ? <CheckCircleIcon className="w-5 h-5 text-green-600" />
                    : <XCircleIcon className="w-5 h-5 text-red-500" />
                  }
                  <p className={`font-semibold text-sm ${testResult.ok ? 'text-green-700' : 'text-red-600'}`}>
                    {testResult.ok ? 'Connection successful' : 'Connection failed'}
                  </p>
                </div>
                {testResult.ok && testResult.data?.response && (
                  <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{testResult.data.response}</p>
                )}
                {!testResult.ok && (
                  <p className="text-sm text-red-600 mt-1">{testResult.error}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Session detail panel ── */}
      {selectedSession && (
        <SessionPanel
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
          onReset={handleSessionMutated}
          onCancel={handleSessionMutated}
        />
      )}
    </ModernLayout>
  )
}
