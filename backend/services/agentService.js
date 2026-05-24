/**
 * agentService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Core AI Agent brain — state machine that handles the full WhatsApp order flow.
 *
 * STATES:
 *   IDLE               → waiting for dress photo
 *   CHECKING_STOCK     → AI is identifying dress & checking stock
 *   COLLECTING_NAME    → stock confirmed, asking customer name
 *   COLLECTING_ADDRESS → got name, asking address
 *   COLLECTING_CITY    → got address, asking city
 *   COLLECTING_PHONE   → got city, asking phone number
 *   AWAITING_PAYMENT   → order created, waiting for payment receipt
 *   VERIFYING_PAYMENT  → receipt received, waiting for owner to verify
 *   CONFIRMED          → order confirmed, packing team notified
 *   CANCELLED          → session cancelled
 *
 * MODES:
 *   supervised → only owner's phone talks to agent; AI formats reports for owner
 *   direct     → customers interact with agent directly
 * ─────────────────────────────────────────────────────────────────────────────
 */

const db = require('../lib/db')
const aiService = require('./aiService')
const twilioService = require('./twilioService')
const messenger = require('./messenger')
const embeddingService = require('./embeddingService')
const productCreationService = require('./productCreationService')
const { addProductToInventory } = productCreationService

/** Mean-pool an array of equal-length vectors and L2-normalise the result. */
function meanPool (vectors) {
  if (!vectors || vectors.length === 0) return []
  const dim = vectors[0].length
  const acc = new Array(dim).fill(0)
  for (const v of vectors) for (let i = 0; i < dim; i++) acc[i] += v[i]
  for (let i = 0; i < dim; i++) acc[i] /= vectors.length
  let s = 0
  for (let i = 0; i < dim; i++) s += acc[i] * acc[i]
  const n = Math.sqrt(s) || 1
  for (let i = 0; i < dim; i++) acc[i] /= n
  return acc
}

// ── Vector-search similarity thresholds (tune as needed) ────────────────────
// Cosine similarity scale: 0..1 (1 = identical, 0 = unrelated)
// Lab ΔE scale: 0..100ish (0 = identical color, <5 imperceptible, 5-15 noticeable,
//                          15+ clearly different colors)
const MATCH_TH_AUTO     = 0.92   // CLIP cosine for auto-match
const MATCH_TH_MAYBE    = 0.78   // CLIP cosine for top-3 manual-pick
const MATCH_LAB_AUTO    = 12     // Max Lab ΔE allowed for auto-match
const MATCH_LAB_MAYBE   = 18     // Max Lab ΔE allowed in top-3 candidates (was 22)

// ── Session TTL: 24 hours ────────────────────────────────────────────────────
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Main entry point called by the webhook route for every incoming WhatsApp message.
 *
 * @param {Object} params
 * @param {string} params.fromPhone        - Sender's phone (digits only, e.g. "923001234567")
 * @param {string} params.text             - Message text (may be empty if image only)
 * @param {string|null} params.mediaUrl    - Twilio media URL if image attached
 * @param {string|null} params.mediaContentType - MIME type of image
 * @param {string} params.tenantId         - Which tenant this number belongs to
 * @param {{base64:string,mimeType:string}} [params.imageData] - Pre-downloaded image (web channel bypasses Meta downloadMedia)
 * @returns {Promise<string>}              - Reply text (sent to WhatsApp + returned)
 */
async function processMessage ({ fromPhone, text, mediaUrl, mediaContentType, tenantId, imageData }) {
  try {
    // 1. Load agent config for this tenant
    const config = await getOrCreateConfig(tenantId)

    if (!config.isEnabled) {
      return null // Agent is disabled — do nothing
    }

    // 2. Determine effective mode.
    //    - WhatsApp channel: use tenant config.mode
    //    - Web channel: use session.mode (set when /web/session was called).
    //      Default to 'direct' if no existing web session.
    const isWebChannel = messenger.isWeb(fromPhone)
    let effectiveMode = config.mode
    if (isWebChannel) {
      const existing = await db.agentSession.findFirst({
        where: { tenantId, fromPhone, isActive: true },
        select: { mode: true }
      })
      effectiveMode = existing?.mode || 'direct'
    }

    // Supervised mode owner-phone gate applies ONLY to WhatsApp — on the web
    // there is no phone identity to gate against; whoever opens the URL is
    // assumed to be the operator (anyone can pick supervised mode from the URL).
    if (!isWebChannel && effectiveMode === 'supervised') {
      const ownerNorm = normalizePhone(config.ownerPhone)
      const fromNorm = normalizePhone(fromPhone)
      if (ownerNorm !== fromNorm) {
        console.log(`[agentService] Ignoring non-owner message in supervised mode: ${fromPhone}`)
        return null
      }
    }

    // Shallow-clone config with overridden mode so downstream handlers see correct mode
    const effectiveConfig = { ...config, mode: effectiveMode }

    // 3. Load or create session
    const session = await getOrCreateSession(fromPhone, tenantId, effectiveMode)

    // 4. Save inbound message to history
    const hasImage = !!(mediaUrl || imageData)
    const messageType = hasImage ? 'IMAGE' : (isCommand(text) ? 'COMMAND' : 'TEXT')
    await saveMessage(session.id, 'INBOUND', messageType, text || '[image]', mediaUrl)

    // 5. Refresh session TTL
    await db.agentSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + SESSION_TTL_MS), updatedAt: new Date() }
    })

    // 6. Route to correct handler
    let reply

    if (isCommand(text)) {
      reply = await handleCommand(text, session, effectiveConfig, tenantId)
    } else if (hasImage) {
      reply = await handleImageMessage(session, effectiveConfig, mediaUrl, mediaContentType, text, tenantId, imageData)
    } else {
      reply = await handleTextMessage(session, effectiveConfig, text, tenantId)
    }

    // 7. Save & dispatch outbound message
    if (reply) {
      if (isWebChannel) {
        // webChannel.sendMessage persists the AgentMessage row and pushes via SSE
        await messenger.sendMessage(fromPhone, reply)
      } else {
        await saveMessage(session.id, 'OUTBOUND', 'TEXT', reply)
        const sid = await messenger.sendMessage(fromPhone, reply)
        await db.agentMessage.updateMany({
          where: { sessionId: session.id, direction: 'OUTBOUND', twilioSid: null },
          data: { twilioSid: sid }
        })
      }
    }

    return reply
  } catch (err) {
    console.error('[agentService] processMessage error:', err)
    return '⚠️ Something went wrong. Please try again shortly.'
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLER  (/status, /stock, /confirm, /cancel, /reset, /mode)
// ═════════════════════════════════════════════════════════════════════════════

async function handleCommand (text, session, config, tenantId) {
  const parts = text.trim().split(/\s+/)
  const cmd = parts[0].toLowerCase()
  const args = parts.slice(1)

  switch (cmd) {
    case '/status':
      return await cmdStatus(tenantId)

    case '/stock':
      return await cmdStock(args.join(' '), tenantId)

    case '/confirm':
      return await cmdConfirm(args[0], tenantId, config)

    case '/reject':
      return await cmdReject(args[0], tenantId)

    case '/cancel':
      return await cmdCancelSession(session, args.join(' '))

    case '/reset':
      return await cmdResetSession(session)

    case '/mode':
      return await cmdMode(args[0], tenantId, config)

    case '/help':
      return formatHelp(config.mode)

    default:
      return `❓ Unknown command: ${cmd}\nSend /help to see all commands.`
  }
}

// ── /status ──────────────────────────────────────────────────────────────────
async function cmdStatus (tenantId) {
  const [activeSessions, pendingOrders, pendingPayments] = await Promise.all([
    db.agentSession.count({ where: { tenantId, isActive: true } }),
    db.order.count({ where: { tenantId, status: 'PENDING' } }),
    db.order.count({ where: { tenantId, status: 'PAYMENT_RECEIVED' } })
  ])

  return `📊 *AGENT STATUS*
─────────────────
💬 Active sessions: ${activeSessions}
📦 Pending orders: ${pendingOrders}
💰 Payments to verify: ${pendingPayments}

Send /help for commands.`
}

// ── /stock [product name] ─────────────────────────────────────────────────────
async function cmdStock (query, tenantId) {
  if (!query) return '❓ Usage: /stock [product name or SKU]'

  const products = await db.product.findMany({
    where: {
      tenantId,
      isActive: true,
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { sku: { contains: query, mode: 'insensitive' } },
        { category: { contains: query, mode: 'insensitive' } }
      ]
    },
    take: 5
  })

  if (!products.length) return `❌ No products found matching: "${query}"`

  const lines = products.map(p =>
    `• ${p.name} — Stock: ${p.currentQuantity} — Rs. ${p.currentRetailPrice || 'N/A'}`
  )
  return `🔍 *Stock Check: "${query}"*\n─────────────────\n${lines.join('\n')}`
}

// ── /confirm [orderNumber] ─────────────────────────────────────────────────────
async function cmdConfirm (orderNumber, tenantId, config) {
  if (!orderNumber) return '❓ Usage: /confirm [ORDER-NUMBER]'

  const order = await db.order.findFirst({
    where: { tenantId, orderNumber, status: 'PAYMENT_RECEIVED' },
    include: { customer: true }
  })

  if (!order) {
    return `❌ Order ${orderNumber} not found or not in PAYMENT_RECEIVED status.`
  }

  await db.order.update({
    where: { id: order.id },
    data: {
      status: 'CONFIRMED',
      paymentVerified: true,
      paymentVerifiedAt: new Date()
    }
  })

  // Notify packing team
  if (config.packingTeamPhone) {
    const packMsg = formatPackingNotification(order)
    await messenger.sendMessage(config.packingTeamPhone, packMsg).catch(console.error)
  }

  // Notify delivery team
  if (config.deliveryTeamPhone) {
    let data = {}
    try { data = JSON.parse(order.formData || '{}') } catch {}
    const deliveryMsg = `🚚 *DISPATCH ALERT*\n─────────────────\n🔢 Order: ${order.orderNumber}\n👤 Customer: ${data.customerName || order.customer?.name || 'N/A'}\n📞 Phone: ${data.phone || order.customer?.phoneNumber || 'N/A'}\n📍 Address: ${data.address || 'N/A'}, ${data.city || 'N/A'}\n💰 Total: Rs. ${data.price || 'N/A'}\n✅ Payment: VERIFIED\n\nPlease arrange delivery ASAP.`
    await messenger.sendMessage(config.deliveryTeamPhone, deliveryMsg).catch(console.error)
  }

  // Notify customer (in direct mode, or via owner in supervised)
  const sessionData = await getSessionDataForOrder(order.id)
  const customerPhone = sessionData?.actualCustomerPhone || order.customer?.phoneNumber

  if (config.mode === 'direct' && customerPhone) {
    await messenger.sendMessage(
      customerPhone,
      `✅ *Payment Verified!*\n\nAap ka order confirm ho gaya hai.\nOrder #: ${order.orderNumber}\n\nHam jald pack karke dispatch karenge. 📦`
    ).catch(console.error)
  }

  const teamStatus = [
    config.packingTeamPhone  ? '📦 Packing team notified.'  : '',
    config.deliveryTeamPhone ? '🚚 Delivery team notified.' : '',
  ].filter(Boolean).join('\n')

  return `✅ Order ${orderNumber} CONFIRMED.\n${teamStatus || '⚠️ No team numbers configured.'}`
}

// ── /reject [orderNumber] ──────────────────────────────────────────────────────
async function cmdReject (orderNumber, tenantId) {
  if (!orderNumber) return '❓ Usage: /reject [ORDER-NUMBER]'

  const order = await db.order.findFirst({
    where: { tenantId, orderNumber, status: 'PAYMENT_RECEIVED' }
  })

  if (!order) return `❌ Order ${orderNumber} not found or cannot be rejected.`

  await db.order.update({
    where: { id: order.id },
    data: { status: 'PENDING', paymentVerified: false }
  })

  // Find session linked to this order and ask customer to resend
  const session = await db.agentSession.findFirst({
    where: { pendingOrderId: order.id, isActive: true }
  })

  if (session) {
    await db.agentSession.update({
      where: { id: session.id },
      data: { state: 'AWAITING_PAYMENT' }
    })
    await messenger.sendMessage(
      session.fromPhone,
      `❌ *Payment not verified.*\n\nPlease dobara receipt ki photo send karein ya correct amount bhejein.`
    ).catch(console.error)
  }

  return `❌ Order ${orderNumber} payment rejected. Customer has been asked to resend receipt.`
}

// ── /cancel ────────────────────────────────────────────────────────────────────
async function cmdCancelSession (session, reason) {
  await db.agentSession.update({
    where: { id: session.id },
    data: { state: 'CANCELLED', isActive: false }
  })
  return `🚫 Session cancelled${reason ? `: ${reason}` : ''}.\nSend a new dress photo to start again.`
}

// ── /reset ─────────────────────────────────────────────────────────────────────
async function cmdResetSession (session) {
  await db.agentSession.update({
    where: { id: session.id },
    data: {
      state: 'IDLE',
      sessionData: '{}',
      messageHistory: '[]',
      pendingOrderId: null,
      customerId: null
    }
  })
  return `🔄 Session reset. Send a dress photo to start a new order.`
}

// ── /mode [supervised|direct] ──────────────────────────────────────────────────
async function cmdMode (newMode, tenantId, config) {
  if (!['supervised', 'direct'].includes(newMode)) {
    return `❓ Usage: /mode [supervised|direct]\nCurrent mode: ${config.mode}`
  }

  await db.agentConfig.update({
    where: { tenantId },
    data: { mode: newMode }
  })

  return `✅ Mode changed to: *${newMode.toUpperCase()}*\n${
    newMode === 'direct'
      ? '⚠️ Customers can now message the AI directly.'
      : '🔒 Only you can interact with the agent.'
  }`
}

// ── /help ──────────────────────────────────────────────────────────────────────
function formatHelp (mode) {
  return `🤖 *AGENT COMMANDS*
─────────────────
/status          — Active sessions & pending orders
/stock [name]    — Check product stock
/confirm [#]     — Verify payment & confirm order
/reject [#]      — Reject payment receipt
/cancel [reason] — Cancel current session
/reset           — Reset session to start
/mode [type]     — Switch supervised|direct
/help            — Show this menu

*Current mode:* ${mode.toUpperCase()}`
}

// ═════════════════════════════════════════════════════════════════════════════
// IMAGE MESSAGE HANDLER
// ═════════════════════════════════════════════════════════════════════════════

async function handleImageMessage (session, config, mediaUrl, mediaContentType, caption, tenantId, imageData) {
  const state = session.state

  // In AWAITING_PAYMENT state → treat image as payment receipt
  if (state === 'AWAITING_PAYMENT') {
    return await handlePaymentReceipt(session, config, mediaUrl, mediaContentType, tenantId, imageData)
  }

  // In any other state → treat image as dress photo (start new product search)
  return await handleDressPhoto(session, config, mediaUrl, mediaContentType, caption, tenantId, imageData)
}

// ── Customer question / photo request handler ────────────────────────────────
// Called for all COLLECTING_* states before field extraction.
// Returns a reply string if the message was a question/photo request,
// or null if it looks like normal field input (let switch handle it).
async function handleCustomerQuestion (text, session, config, sessionData, state) {
  const lower = text.toLowerCase()
  const isSupervised = config.mode === 'supervised'

  // ── Photo / image request (keyword-based, no AI call needed) ────────────
  const isPhotoRequest = /photo|picture|image|pic\b|tasveer|dikhao|dikhaao|show|dekh/.test(lower)

  if (isPhotoRequest && sessionData.productId) {
    const imageUrl = getProductPublicImageUrl(sessionData.productId)
    const caption = `${sessionData.productName || 'Product'} — Rs. ${sessionData.price || 'TBD'}`
    try {
      await messenger.sendMediaMessage(session.fromPhone, caption, imageUrl)
    } catch (err) {
      console.warn('[agentService] sendMediaMessage skipped (no image or URL not public):', err.message)
    }
    const reAsk = getReAskPromptText(state)
    return isSupervised
      ? `📸 Product photo sent above.\n\n⏭️ Forward to customer, then ask them: *"${reAsk}"*`
      : `📸 Ye lo product ki photo!\n\nAb please: ${reAsk}`
  }

  // ── General question (has "?" or starts with a question word) ───────────
  const isQuestion = text.includes('?') ||
    /^(what|how|when|where|why|is|are|can|will|do|does|kya|kab|kahan|kitna|kyun)\b/i.test(lower)

  if (isQuestion) {
    const reAsk = getReAskPromptText(state)
    const reply = await aiService.chat(
      [{ role: 'user', content: text }],
      {
        systemPrompt: `You are a helpful assistant for a Pakistani dress shop. Answer the question briefly in 1-2 sentences in the same language the customer used (Urdu/English mix is fine). End your reply with: "${reAsk}"`,
        maxTokens: 150
      }
    )
    return reply
  }

  return null // Normal input — let the switch handle it
}

// ── Dress photo handler ───────────────────────────────────────────────────────
/**
 * Visual verifier — ask Claude vision "are these the same dress?" by comparing
 * the customer's photo to the product's stored primary image.
 *
 * Returns true if Claude confidently says yes, false otherwise (including if
 * the AI call fails — conservative reject). Returns true ALSO when the product
 * has no stored image (nothing to compare against), so the cosine/Lab gate is
 * trusted in that case.
 */
async function visualVerifierSame (customerImageData, productId, productName) {
  const candImg = await db.productImage.findFirst({
    where: { productId, isPrimary: true },
    select: { mediaData: true, mediaType: true }
  })
  if (!candImg || !candImg.mediaData) return true   // no image to check — defer to cosine/Lab

  try {
    const verdict = await aiService.analyzeImages(
      [
        { base64: customerImageData.base64, mimeType: customerImageData.mimeType },
        { base64: Buffer.from(candImg.mediaData).toString('base64'), mimeType: candImg.mediaType || 'image/jpeg' }
      ],
      `Image 1 is the customer's dress photo. Image 2 is inventory product "${productName}".
Are these the SAME exact dress — same fabric print, same colors, same pattern?
Reply ONLY 'yes' or 'no'. If you are unsure, say 'no'.`,
      { maxTokens: 10 }
    )
    return String(verdict).toLowerCase().trim().startsWith('y')
  } catch (e) {
    console.warn('[agentService] Verifier failed; conservative reject:', e.message)
    return false
  }
}

async function handleDressPhoto (session, config, mediaUrl, mediaContentType, caption, tenantId, preDownloaded) {
  // Update state
  await setSessionState(session.id, 'CHECKING_STOCK')

  // Send "checking" acknowledgement
  await messenger.sendMessage(
    session.fromPhone,
    config.mode === 'supervised'
      ? '🔍 Checking stock...'
      : '🔍 Dress check kar raha hoon, ek second...'
  )

  try {
    // Use pre-downloaded image (web channel) or fetch from Meta (WhatsApp)
    const imageData = preDownloaded || await twilioService.downloadMedia(mediaUrl, mediaContentType)

    // Ask Claude/GPT to identify the dress — must use analyzeImage so the AI
    // actually sees the photo (extractJSON is text-only and would return empty).
    const identifyPrompt = `This is an image of a dress/clothing item from a Pakistani fashion business.
Look at it carefully and describe it in detail: color, style, embroidery, fabric type (lawn/chiffon/silk etc), design elements.
Then suggest 3-5 keywords to search for this in a product database.

Respond with ONLY valid JSON, no markdown fences, no extra text:
{
  "description": "<full description>",
  "color": "<primary color>",
  "style": "<style/cut>",
  "fabric": "<fabric type>",
  "searchKeywords": ["keyword1", "keyword2", ...]
}`

    let identifyResult = {}
    try {
      const raw = await aiService.analyzeImage(
        imageData,
        identifyPrompt,
        {
          systemPrompt: 'You are a fashion product identification expert. Respond only with valid JSON.',
          model: config.aiModel,
          maxTokens: 512
        }
      )
      // Strip markdown fences if any
      const cleaned = String(raw || '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim()
      try {
        identifyResult = JSON.parse(cleaned)
      } catch {
        // AI returned plain text (or test mock) — keep it as the description
        identifyResult = { description: cleaned, color: '', style: '', fabric: '', searchKeywords: [] }
      }
    } catch (parseErr) {
      console.warn('[agentService] Identify call failed:', parseErr.message)
      identifyResult = {}
    }

    // ── Visual match via CLIP image embeddings (cosine similarity) ──────────
    // Replaces all prior keyword/AI-verifier matching. Computes the customer
    // photo's 512-d CLIP vector, fetches every product's stored embedding in
    // this tenant, and ranks by cosine similarity (in-app — no pgvector yet).
    const { color = '', style = '', description = '' } = identifyResult

    let matchedProduct = null
    let topCandidates  = []   // [{ id, name, price, qty, similarity }]
    let topSim         = 0

    try {
      const { tiles: customerTiles, meanLab: customerLab } = await embeddingService.embedImage({
        base64: imageData.base64,
        mimeType: imageData.mimeType
      })

      // Fetch all embeddings for in-stock products in this tenant.
      const rows = await db.productEmbedding.findMany({
        where: {
          product: { tenantId, isActive: true, currentQuantity: { gt: 0 } }
        },
        select: {
          tileEmbeddings: true, embedding: true, meanLab: true,
          product: {
            select: {
              id: true, name: true,
              currentRetailPrice: true, currentQuantity: true
            }
          }
        }
      })

      // Score each product: max pairwise cosine over (5 customer tiles × 5 product tiles).
      // Robust to localised image corruption (watermarks, folds, glare) on either side.
      const scored = rows.map(r => {
        let similarity = 0
        if (r.tileEmbeddings && r.tileEmbeddings.length >= embeddingService.EMBED_DIM * 2) {
          const productTiles = embeddingService.unflattenTiles(r.tileEmbeddings)
          similarity = embeddingService.maxPairwiseCosine(customerTiles, productTiles)
        } else if (r.embedding && r.embedding.length > 0) {
          // Legacy mean-pool fallback (only for very old products not yet backfilled).
          const meanCust = meanPool(customerTiles)
          similarity = embeddingService.cosineSim(meanCust, r.embedding)
        }
        return {
          id:         r.product.id,
          name:       r.product.name,
          price:      r.product.currentRetailPrice,
          qty:        r.product.currentQuantity,
          similarity,
          deltaE:     embeddingService.labDeltaE(customerLab, r.meanLab)
        }
      })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)

      topCandidates = scored
      topSim        = scored[0]?.similarity || 0

      console.log(
        `[agentService] Tile-MAX search (${rows.length} embedded products): ` +
        scored.slice(0, 3).map(c =>
          `"${c.name}" maxSim=${c.similarity.toFixed(3)} ΔE=${c.deltaE.toFixed(1)}`
        ).join(' | ') +
        ` (thresholds: cos≥${MATCH_TH_AUTO}+ΔE≤${MATCH_LAB_AUTO} auto, cos≥${MATCH_TH_MAYBE}+ΔE≤${MATCH_LAB_MAYBE} maybe)`
      )
    } catch (vecErr) {
      console.warn('[agentService] Vector search failed:', vecErr.message)
    }

    // ── Match decisioning: requires BOTH visual similarity AND color agreement ──
    const topCand = topCandidates[0]
    const passesAuto  = topCand && topCand.similarity >= MATCH_TH_AUTO  && topCand.deltaE <= MATCH_LAB_AUTO
    const colorOkCands = topCandidates.filter(c => c.similarity >= MATCH_TH_MAYBE && c.deltaE <= MATCH_LAB_MAYBE)

    // 1. Very confident → AI verifier gate → auto-match
    if (passesAuto) {
      const ok = await visualVerifierSame(imageData, topCand.id, topCand.name)
      console.log(`[agentService] Verifier gate on "${topCand.name}" (cos=${topCand.similarity.toFixed(3)} ΔE=${topCand.deltaE.toFixed(1)}) → ${ok ? 'YES' : 'NO'}`)
      if (ok) {
        matchedProduct = await db.product.findUnique({ where: { id: topCand.id } })
      }
    }

    // 2. Medium confidence (or auto-match failed verifier) → run verifier on each candidate,
    //    show only the ones Claude confirms. If Claude rejects all, fall through to OOS.
    if (!matchedProduct && colorOkCands.length > 0) {
      const verifiedCands = []
      for (const c of colorOkCands.slice(0, 3)) {
        const ok = await visualVerifierSame(imageData, c.id, c.name)
        console.log(`[agentService] Verifier on "${c.name}" (cos=${c.similarity.toFixed(3)} ΔE=${c.deltaE.toFixed(1)}) → ${ok ? 'YES' : 'NO'}`)
        if (ok) verifiedCands.push(c)
      }

      if (verifiedCands.length > 0) {
        for (let i = 0; i < verifiedCands.length; i++) {
          const c = verifiedCands[i]
          try {
            const imgUrl = getProductPublicImageUrl(c.id)
            await messenger.sendMediaMessage(session.fromPhone,
              `${i + 1}. ${c.name} — Rs. ${c.price || 'N/A'} (${(c.similarity * 100).toFixed(0)}% match)`,
              imgUrl)
          } catch (e) {
            console.warn('[agentService] Failed to send candidate image:', e.message)
          }
        }

        const sessionDataPartial = {
          ...parseSessionData(session.sessionData),
          identifiedDress: description,
          productId: null, productName: null, price: null, stock: 0,
          originalMediaId: mediaUrl,
          originalMediaType: mediaContentType || imageData?.mimeType || 'image/jpeg',
          originalImageBase64: imageData?.base64 || null,
          _availableProducts: verifiedCands.map(c => ({
            id: c.id, name: c.name, price: c.price, qty: c.qty
          }))
        }
        await updateSession(session.id, 'CONFIRMING_PRODUCT_MATCH', sessionDataPartial)

        const choicesText = verifiedCands
          .map((c, i) => `${i + 1}. ${c.name} — Rs. ${c.price || 'N/A'} (${(c.similarity * 100).toFixed(0)}% match)`)
          .join('\n')

        if (config.mode === 'supervised') {
          return formatSupervisedReport({
            status: '🔍 POSSIBLE MATCHES',
            identified: description,
            extra: `Visually similar products:\n${choicesText}\n\nReply 1/2/3 to pick, or 0 for OOS / add new.`,
            sendToCustomer: null,
            nextStep: `Reply 1-${verifiedCands.length} to confirm match, or 0 to mark OOS`
          })
        } else {
          return `🤔 *Ye ${verifiedCands.length} dresses similar lag rahi hain:*\n\n${choicesText}\n\n` +
                 `Apna pasandida product ka number bhejein (1-${verifiedCands.length}), ya *0* likhein.`
        }
      }
      // verifiedCands.length === 0 → all candidates rejected by Claude → fall through to OOS below.
    }
    // 3. Neither auto nor maybe band (or verifier rejected all) → fall through to OOS path.

    // Build and save session data
    const sessionData = {
      ...parseSessionData(session.sessionData),
      identifiedDress: description,
      productId: matchedProduct?.id || null,
      productName: matchedProduct?.name || 'Custom Dress',
      price: matchedProduct?.currentRetailPrice || null,
      stock: matchedProduct?.currentQuantity || 0,
      // Keep original media ID so we can save the photo when product is added
      originalMediaId: mediaUrl,
      originalMediaType: mediaContentType || imageData?.mimeType || 'image/jpeg',
      originalImageBase64: imageData?.base64 || null
    }

    if (matchedProduct && matchedProduct.currentQuantity > 0) {
      // Product found and in stock
      await updateSession(session.id, 'COLLECTING_NAME', sessionData)

      // Send the matched product's stored image so the supervisor/customer can
      // visually confirm. Only when the product actually has a primary image.
      try {
        const hasImg = await db.productImage.findFirst({
          where: { productId: matchedProduct.id, isPrimary: true },
          select: { id: true }
        })
        if (hasImg) {
          const imgUrl = getProductPublicImageUrl(matchedProduct.id)
          const caption = config.mode === 'supervised'
            ? `✅ Matched: ${matchedProduct.name} — Rs. ${matchedProduct.currentRetailPrice || 'TBD'}`
            : `📦 ${matchedProduct.name} — Rs. ${matchedProduct.currentRetailPrice || 'TBD'}`
          await messenger.sendMediaMessage(session.fromPhone, caption, imgUrl)
        }
      } catch (imgErr) {
        console.warn('[agentService] Could not send matched-product image:', imgErr.message)
      }

      if (config.mode === 'supervised') {
        return formatSupervisedReport({
          status: '✅ AVAILABLE',
          product: `${matchedProduct.name}`,
          stock: `${matchedProduct.currentQuantity} remaining`,
          price: `Rs. ${matchedProduct.currentRetailPrice || 'TBD'}`,
          identified: description,
          sendToCustomer: `✅ Jee available hai!\nPrice: Rs. ${matchedProduct.currentRetailPrice || 'confirm karte hain'}\n\nPlease share:\n1. Apna naam\n2. Complete address\n3. City\n4. Phone number (parcel ke liye)`,
          nextStep: 'Forward customer reply back to me'
        })
      } else {
        return `✅ *Jee available hai!*\n\n` +
          `📦 *${matchedProduct.name}*\n` +
          `💰 Price: Rs. ${matchedProduct.currentRetailPrice || 'TBD'}\n\n` +
          `Apna order confirm karne ke liye please share karein:\n` +
          `1️⃣ Apna naam\n` +
          `2️⃣ Complete address\n` +
          `3️⃣ City\n` +
          `4️⃣ Phone number (parcel writing ke liye)`
      }
    } else {
      // Out of stock — search for similar dresses to suggest
      const orConditions = []
      if (color)               orConditions.push({ name:     { contains: color,                  mode: 'insensitive' } })
      if (style)               orConditions.push({ category: { contains: style,                  mode: 'insensitive' } })
      if (identifyResult.fabric) orConditions.push({ name:  { contains: identifyResult.fabric,   mode: 'insensitive' } })

      const similar = orConditions.length > 0 ? await db.product.findMany({
        where: {
          tenantId,
          isActive: true,
          currentQuantity: { gt: 0 },
          OR: orConditions
        },
        take: 3
      }) : []

      const similarText = similar.length > 0
        ? `\n\n✨ *Similar dresses available:*\n${similar.map(p => `• ${p.name} — Rs. ${p.currentRetailPrice || 'N/A'} (${p.currentQuantity} in stock)`).join('\n')}`
        : ''

      if (config.mode === 'supervised') {
        // Supervised: don't reset — ask owner if dress is physically available
        await updateSession(session.id, 'AWAITING_STOCK_CONFIRM', sessionData)
        return formatSupervisedReport({
          status: '❌ OUT OF STOCK',
          identified: description,
          extra: similar.length > 0
            ? `Similar available:\n${similar.map(p => `• ${p.name} (${p.currentQuantity})`).join('\n')}`
            : 'No similar products found',
          sendToCustomer: `❌ Sorry, ye dress abhi available nahi hai.${similarText}\n\nKoi aur dress ka photo bhejein! 🙏`,
          nextStep: `Reply *YES* to add this dress to inventory, or send another dress photo to check stock`
        })
      } else {
        await updateSession(session.id, 'IDLE', {})
        return `❌ *Sorry, ye dress abhi available nahi hai.*${similarText}\n\nKoi aur dress ka photo send karein! 📸`
      }
    }
  } catch (err) {
    console.error('[agentService] handleDressPhoto error:', err)
    await setSessionState(session.id, 'IDLE')
    return config.mode === 'supervised'
      ? '⚠️ Image process karne mein masla hua. Dobara try karein.'
      : '⚠️ Image check nahi ho saki. Please dobara send karein.'
  }
}

// addProductToInventory has moved to services/productCreationService.js so it can
// be reused by the dashboard Quick-Add endpoint. The function is re-imported at
// the top of this file; behaviour is unchanged.

// ── Payment receipt handler ────────────────────────────────────────────────────
async function handlePaymentReceipt (session, config, mediaUrl, mediaContentType, tenantId, preDownloaded) {
  const sessionData = parseSessionData(session.sessionData)

  try {
    // Use pre-downloaded image (web channel) or fetch from Meta (WhatsApp)
    const imageData = preDownloaded || await twilioService.downloadMedia(mediaUrl, mediaContentType)

    // OCR the receipt
    const ocrPrompt = `This is a payment receipt/screenshot from a Pakistani bank, JazzCash, Easypaisa, or similar.
Extract the following information:
{
  "amount": 0,
  "senderName": "",
  "receiverName": "",
  "transactionId": "",
  "date": "",
  "bank": "",
  "isValid": true
}
If this doesn't look like a payment receipt, set isValid to false.`

    const receipt = await aiService.extractJSON(ocrPrompt, {
      systemPrompt: 'You are a payment receipt reader for Pakistani payment systems.',
      model: config.aiModel
    })

    if (!receipt || !receipt.isValid) {
      return config.mode === 'supervised'
        ? '⚠️ Ye payment receipt nahi lagti. Customer se dobara receipt send karne ko kahein.'
        : '⚠️ Ye payment receipt nahi lagti. Please bank transfer ya JazzCash ki receipt send karein.'
    }

    // Update order with receipt info
    if (session.pendingOrderId) {
      await db.order.update({
        where: { id: session.pendingOrderId },
        data: {
          status: 'PAYMENT_RECEIVED',
          paymentAmount: receipt.amount || sessionData.price,
          paymentReceipt: mediaUrl,
          paymentMethod: receipt.bank || 'Bank Transfer'
        }
      })
    }

    await setSessionState(session.id, 'VERIFYING_PAYMENT')

    const orderNum = sessionData.orderNumber || 'N/A'
    const extractedAmount = receipt.amount ? `Rs. ${receipt.amount}` : 'amount not clear'
    const expectedAmount = sessionData.price ? `Rs. ${sessionData.price}` : 'N/A'

    if (config.mode === 'supervised') {
      return `💰 *PAYMENT RECEIPT RECEIVED*
─────────────────
📋 Order: ${orderNum}
👤 Customer: ${sessionData.customerName || 'N/A'}
📍 City: ${sessionData.city || 'N/A'}

🧾 *Receipt Details:*
   Amount: ${extractedAmount}
   Expected: ${expectedAmount}
   Bank: ${receipt.bank || 'N/A'}
   TxID: ${receipt.transactionId || 'N/A'}
   Date: ${receipt.date || 'N/A'}

${receipt.amount === sessionData.price ? '✅ Amount matches!' : '⚠️ Amount mismatch — please verify!'}

To verify: /confirm ${orderNum}
To reject: /reject ${orderNum}`
    } else {
      await messenger.sendMessage(
        session.fromPhone,
        `✅ *Receipt mil gayi!*\n\nHum verify kar rahe hain. 2-3 minutes mein confirm karenge. 🙏`
      )
      // Also notify owner
      if (config.ownerPhone) {
        await messenger.sendMessage(
          config.ownerPhone,
          `💰 *PAYMENT RECEIVED*\nOrder: ${orderNum}\nAmount: ${extractedAmount}\nExpected: ${expectedAmount}\n\nVerify karne ke liye:\n/confirm ${orderNum}`
        ).catch(console.error)
      }
      return null // already sent reply above
    }
  } catch (err) {
    console.error('[agentService] handlePaymentReceipt error:', err)
    return '⚠️ Receipt process karne mein masla hua. Dobara try karein.'
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TEXT MESSAGE HANDLER — routes by session state
// ═════════════════════════════════════════════════════════════════════════════

async function handleTextMessage (session, config, text, tenantId) {
  const state = session.state
  const sessionData = parseSessionData(session.sessionData)
  const isSupervised = config.mode === 'supervised'

  // Load recent message history for AI context (last 6 messages)
  const history = parseMessageHistory(session.messageHistory).slice(-6)

  // ── Abandonment detection (all COLLECTING_* states) ──────────────────────
  const COLLECTING_STATES = [
    'COLLECTING_NAME', 'COLLECTING_ADDRESS', 'COLLECTING_CITY', 'COLLECTING_PHONE',
    'COLLECTING_PRODUCT_NAME', 'COLLECTING_PRODUCT_COST', 'COLLECTING_PRODUCT_PRICE', 'COLLECTING_PRODUCT_QTY',
    'CONFIRMING_PRODUCT_MATCH'
  ]
  const ABANDON_WORDS = ['leave it', 'leave', 'cancel it', 'cancel', 'chhodo', 'choro', 'chodo',
    'band karo', 'mat karo', 'never mind', 'nevermind', 'stop', 'quit', 'abort', 'baad mein', 'nahi']

  if (COLLECTING_STATES.includes(state)) {
    const lower = text.toLowerCase().trim()
    if (ABANDON_WORDS.some(w => lower === w || lower.startsWith(w + ' ') || lower.endsWith(' ' + w))) {
      await updateSession(session.id, 'IDLE', {})
      return `✅ Session reset. Next dress photo ka intezaar hai. 📸\n\n(Tip: /help for all commands)`
    }
  }

  // ── Smart question / photo request handling for all COLLECTING states ────
  if (COLLECTING_STATES.includes(state)) {
    const handled = await handleCustomerQuestion(text, session, config, sessionData, state)
    if (handled !== null) return handled
  }

  switch (state) {
    case 'IDLE':
      return isSupervised
        ? `🤖 Ready! Forward a customer's dress photo to check availability.\n\nOr send /help for commands.`
        : `👋 *Assalam o Alaikum!*\n\nDress ka photo send karein aur hum stock check karenge. 📸`

    // ── COLLECTING_NAME ──────────────────────────────────────────────────────
    case 'COLLECTING_NAME': {
      const name = await extractField('name', text, sessionData, history)
      if (!name) {
        return isSupervised
          ? `⚠️ Name extract nahi ho saka from: "${text}"\nManually enter: /name [Customer Name]\n\nSession cancel karne ke liye type karein: *leave it*`
          : `Maafi chahta hoon, naam samajh nahi aaya. Kya aap sirf apna naam likh sakte hain?`
      }

      sessionData.customerName = name
      await updateSession(session.id, 'COLLECTING_ADDRESS', sessionData)

      return isSupervised
        ? formatSupervisedReport({
            collected: `✅ Name: ${name}`,
            sendToCustomer: `Shukriya ${name}!\n\nAb apna *complete address* share karein (ghar ka number, gali, mohalla).`,
            nextStep: 'Forward customer reply to me'
          })
        : `Shukriya *${name}*! 😊\n\nAb apna *complete address* share karein:\n(Ghar ka number, gali, mohalla)`
    }

    // ── COLLECTING_ADDRESS ───────────────────────────────────────────────────
    case 'COLLECTING_ADDRESS': {
      if (text.length < 5) {
        return isSupervised
          ? `⚠️ Address bohat short hai: "${text}". Complete address forward karein.`
          : `Please thoda detail mein address likhein (ghar number, gali, area).`
      }

      sessionData.address = text
      await updateSession(session.id, 'COLLECTING_CITY', sessionData)

      return isSupervised
        ? formatSupervisedReport({
            collected: `✅ Address: ${text}`,
            sendToCustomer: `Shukriya!\n\nAb apna *city* ka naam likhein.`,
            nextStep: 'Forward customer reply to me'
          })
        : `Perfect! 📍\n\nAb sirf apna *city* ka naam likhein:`
    }

    // ── COLLECTING_CITY ──────────────────────────────────────────────────────
    case 'COLLECTING_CITY': {
      const city = text.trim()
      sessionData.city = city

      // Calculate shipping charges
      const shippingCharge = await getShippingCharge(city, tenantId, sessionData.productId)
      sessionData.shippingCharge = shippingCharge

      await updateSession(session.id, 'COLLECTING_PHONE', sessionData)

      const totalAmount = (sessionData.price || 0) + shippingCharge
      sessionData.totalAmount = totalAmount

      return isSupervised
        ? formatSupervisedReport({
            collected: `✅ City: ${city}`,
            extra: `Shipping to ${city}: Rs. ${shippingCharge}\nTotal: Rs. ${totalAmount}`,
            sendToCustomer: `${city} — shipping charges: Rs. ${shippingCharge}\nTotal: Rs. ${totalAmount}\n\nAb apna *phone number* likhein (parcel writing ke liye).`,
            nextStep: 'Forward customer reply to me'
          })
        : `📦 *${city}* — Shipping: Rs. ${shippingCharge}\n💰 *Total: Rs. ${totalAmount}*\n\nAb apna *phone number* likhein (parcel writing ke liye):`
    }

    // ── COLLECTING_PHONE ─────────────────────────────────────────────────────
    case 'COLLECTING_PHONE': {
      const phone = extractPhone(text)
      if (!phone) {
        return isSupervised
          ? `⚠️ Valid Pakistani phone number nahi mila: "${text}"\nExample: 03001234567`
          : `Yeh phone number sahi nahi lagta.\nPlease Pakistani number likhein, jaise: *03001234567*`
      }

      sessionData.customerPhone = phone
      sessionData.actualCustomerPhone = phone

      // Create/find customer in DB
      const customer = await findOrCreateCustomer(phone, sessionData, tenantId)
      sessionData.customerId = customer.id

      // Create order in DB
      const order = await createOrder(sessionData, tenantId)
      sessionData.orderNumber = order.orderNumber

      await updateSession(session.id, 'AWAITING_PAYMENT', sessionData)
      await db.agentSession.update({
        where: { id: session.id },
        data: { pendingOrderId: order.id, customerId: customer.id }
      })

      // Get bank details for this tenant
      const bankDetails = await db.tenantBankDetail.findMany({
        where: { tenantId, isActive: true },
        orderBy: { sortOrder: 'asc' }
      })

      const bankText = bankDetails.length
        ? bankDetails.map(b =>
            `🏦 *${b.providerName}*\nAccount: ${b.accountNumber}\nTitle: ${b.accountTitle}${b.iban ? `\nIBAN: ${b.iban}` : ''}`
          ).join('\n\n')
        : 'Bank details jald share karenge.'

      const paymentMsg = `✅ *Order Registered!*\nOrder #: ${order.orderNumber}\n\n*Amount to pay: Rs. ${sessionData.totalAmount || sessionData.price}*\n\n${bankText}\n\nPayment ke baad receipt ki *photo* send karein. 📸`

      return isSupervised
        ? formatSupervisedReport({
            collected: `✅ Phone: ${phone}`,
            extra: `✅ Order created: ${order.orderNumber}\n✅ Customer saved in system`,
            sendToCustomer: paymentMsg,
            nextStep: 'Forward payment details to customer. Wait for receipt image.'
          })
        : paymentMsg
    }

    // ── VERIFYING_PAYMENT ────────────────────────────────────────────────────
    case 'VERIFYING_PAYMENT':
      return isSupervised
        ? `⏳ Payment verification pending for order ${sessionData.orderNumber}.\nUse /confirm ${sessionData.orderNumber} or /reject ${sessionData.orderNumber}`
        : `⏳ Aap ka payment verify ho raha hai. Thodi der mein update miley ga. 🙏`

    // ── CONFIRMED ────────────────────────────────────────────────────────────
    case 'CONFIRMED':
      return isSupervised
        ? `✅ Order ${sessionData.orderNumber} already confirmed. Send a new dress photo to start another order.`
        : `✅ Aap ka order confirm ho chuka hai. Jald pack karke dispatch karenge! 📦`

    // ── AWAITING_PAYMENT ─────────────────────────────────────────────────────
    case 'AWAITING_PAYMENT':
      return isSupervised
        ? `⏳ Waiting for payment receipt image for order ${sessionData.orderNumber}.`
        : `📸 Payment ke baad receipt ki *photo* send karein. Sirf text se confirm nahi hoga.`

    // ── AWAITING_STOCK_CONFIRM ───────────────────────────────────────────────
    // Supervisor replied after OOS — asking if dress is physically in stock
    case 'AWAITING_STOCK_CONFIRM': {
      const isYes = ['YES', 'JI', 'HAN', 'HA', 'Y'].includes(text.trim().toUpperCase())

      if (!isYes) {
        await updateSession(session.id, 'IDLE', {})
        return `OK. Next dress photo ka intezaar hai. 📸`
      }

      if (sessionData.productId) {
        // Restock existing — skip name collection, go straight to price
        await updateSession(session.id, 'COLLECTING_PRODUCT_COST', sessionData)
        return `💰 *Restock:* "${sessionData.productName}"\n\nPurchase/cost price per piece? (Rs.)`
      } else {
        // New product — ask for name first
        await updateSession(session.id, 'COLLECTING_PRODUCT_NAME', sessionData)
        const aiSuggestion = sessionData.identifiedDress
          ? `\n\n💡 AI suggested: "${sessionData.identifiedDress}"`
          : ''
        return `🏷️ Product ka naam kya hai?${aiSuggestion}\n\n(Example: Red Lawn Suit, Blue Chiffon Dress)`
      }
    }

    // ── COLLECTING_PRODUCT_NAME ──────────────────────────────────────────────
    case 'COLLECTING_PRODUCT_NAME': {
      const productName = text.trim()
      if (productName.length < 2) {
        return `❌ Naam bohat short hai. Product ka naam likhein. Example: *Red Lawn Suit*`
      }
      sessionData.newProductName = productName
      await updateSession(session.id, 'COLLECTING_PRODUCT_COST', sessionData)
      return `✅ Name: ${productName}\n\n💰 Purchase/cost price per piece? (Rs.)`
    }

    // ── COLLECTING_PRODUCT_COST ──────────────────────────────────────────────
    case 'COLLECTING_PRODUCT_COST': {
      const cost = parseFloat(text.replace(/[^0-9.]/g, ''))
      if (isNaN(cost) || cost <= 0) {
        return `❌ Valid amount enter karein. Example: *800*`
      }
      sessionData.productCostPrice = cost
      await updateSession(session.id, 'COLLECTING_PRODUCT_PRICE', sessionData)
      return `✅ Cost: Rs. ${cost}\n\n💰 Selling/retail price? (Rs.)`
    }

    // ── COLLECTING_PRODUCT_PRICE ─────────────────────────────────────────────
    case 'COLLECTING_PRODUCT_PRICE': {
      const price = parseFloat(text.replace(/[^0-9.]/g, ''))
      if (isNaN(price) || price <= 0) {
        return `❌ Valid amount enter karein. Example: *1200*`
      }
      if (price < sessionData.productCostPrice) {
        return `⚠️ Selling price (Rs. ${price}) cost price (Rs. ${sessionData.productCostPrice}) se kam hai. Sahi enter karein.`
      }
      sessionData.productSellingPrice = price
      await updateSession(session.id, 'COLLECTING_PRODUCT_QTY', sessionData)
      return `✅ Selling: Rs. ${price}\n\n📦 Kitne pieces stock mein hain? (quantity)`
    }

    // ── COLLECTING_PRODUCT_QTY ───────────────────────────────────────────────
    case 'COLLECTING_PRODUCT_QTY': {
      const qty = parseInt(text.replace(/[^0-9]/g, ''))
      if (isNaN(qty) || qty <= 0) {
        return `❌ Valid quantity enter karein. Example: *5*`
      }

      try {
        const result = await addProductToInventory({ tenantId, sessionData, quantity: qty })

        const updatedData = {
          ...sessionData,
          productId:           result.productId,
          productName:         result.productName,
          price:               sessionData.productSellingPrice,
          stock:               qty,
          productCostPrice:    undefined,
          productSellingPrice: undefined,
        }
        await updateSession(session.id, 'COLLECTING_NAME', updatedData)

        return (
          `✅ *${result.action}!*\n` +
          `📦 ${result.productName}\n` +
          `💰 Cost: Rs. ${sessionData.productCostPrice}  |  Sell: Rs. ${sessionData.productSellingPrice}\n` +
          `🗃️ Stock: ${qty} pieces  |  🧾 Invoice: ${result.invoiceNumber}\n\n` +
          `📋 *SEND TO CUSTOMER:*\n` +
          `"✅ Jee available hai!\n` +
          `Price: Rs. ${sessionData.productSellingPrice}\n\n` +
          `Please share:\n1. Apna naam\n2. Complete address\n3. City\n4. Phone number"\n\n` +
          `⏭️ Forward above to customer, then relay their reply`
        )
      } catch (err) {
        console.error('[agentService] addProductToInventory error:', err)
        return `⚠️ Product add karne mein masla hua: ${err.message}\nDobara try karein ya manually dashboard se add karein.`
      }
    }

    // ── CONFIRMING_PRODUCT_MATCH ─────────────────────────────────────────────
    // Supervisor manually picks which product matches the dress photo
    case 'CONFIRMING_PRODUCT_MATCH': {
      const availableProducts = sessionData._availableProducts || []

      // Natural language "add new / none / nahi" → treat as 0
      const lower = text.trim().toLowerCase()
      const isAddNew = /^(add|new|none|nahi|naya|nayi|no match|not listed|not here|new product|add new|add product)/.test(lower)
      const numStr = isAddNew ? '0' : text.trim().replace(/[^0-9]/g, '')
      const picked = parseInt(numStr, 10)

      // Reply 0 → treat as OOS / offer to add new product
      if (picked === 0) {
        const newData = { ...sessionData, _availableProducts: undefined }
        if (config.mode === 'supervised') {
          await updateSession(session.id, 'AWAITING_STOCK_CONFIRM', newData)
          return formatSupervisedReport({
            status: '❌ MARKED AS OOS',
            identified: sessionData.identifiedDress,
            sendToCustomer: `❌ Sorry, ye dress abhi available nahi hai.\n\nKoi aur dress ka photo bhejein! 🙏`,
            nextStep: `Reply *YES* to add this dress to inventory, or send another dress photo`
          })
        }
        // Direct mode: customer can't "add to inventory" — just reset
        await updateSession(session.id, 'IDLE', {})
        return `❌ Sorry, ye dress abhi available nahi hai.\n\nKoi aur dress ka photo bhejein! 🙏`
      }

      // Valid product number picked
      if (!isNaN(picked) && picked >= 1 && picked <= availableProducts.length) {
        const chosen = availableProducts[picked - 1]

        // Fetch full product record to get current stock
        const product = await db.product.findUnique({ where: { id: chosen.id } })
        if (!product || product.currentQuantity <= 0) {
          // Product exists but now OOS — treat same as OOS path
          const newData = {
            ...sessionData,
            identifiedDress: sessionData.identifiedDress,
            productId: chosen.id,
            productName: chosen.name,
            price: chosen.price,
            stock: 0,
            _availableProducts: undefined
          }
          await updateSession(session.id, 'AWAITING_STOCK_CONFIRM', newData)
          return formatSupervisedReport({
            status: '❌ OUT OF STOCK',
            product: chosen.name,
            identified: sessionData.identifiedDress,
            sendToCustomer: `❌ Sorry, ye dress abhi available nahi hai.\n\nKoi aur dress ka photo bhejein! 🙏`,
            nextStep: `Reply *YES* to restock "${chosen.name}", or send another dress photo`
          })
        }

        // In stock — move to order collection
        const updatedData = {
          ...sessionData,
          productId: product.id,
          productName: product.name,
          price: product.currentRetailPrice,
          stock: product.currentQuantity,
          _availableProducts: undefined
        }
        await updateSession(session.id, 'COLLECTING_NAME', updatedData)

        // Send the product's stored image for visual confirmation
        try {
          const hasImg = await db.productImage.findFirst({
            where: { productId: product.id, isPrimary: true },
            select: { id: true }
          })
          if (hasImg) {
            const imgUrl = getProductPublicImageUrl(product.id)
            const caption = config.mode === 'supervised'
              ? `✅ Matched: ${product.name} — Rs. ${product.currentRetailPrice || 'TBD'}`
              : `📦 ${product.name} — Rs. ${product.currentRetailPrice || 'TBD'}`
            await messenger.sendMediaMessage(session.fromPhone, caption, imgUrl)
          }
        } catch (imgErr) {
          console.warn('[agentService] Could not send matched-product image:', imgErr.message)
        }

        if (config.mode === 'supervised') {
          return formatSupervisedReport({
            status: '✅ PRODUCT MATCHED',
            product: product.name,
            stock: `${product.currentQuantity} remaining`,
            price: `Rs. ${product.currentRetailPrice || 'TBD'}`,
            identified: sessionData.identifiedDress,
            sendToCustomer: `✅ Jee available hai!\nPrice: Rs. ${product.currentRetailPrice || 'confirm karte hain'}\n\nPlease share:\n1. Apna naam\n2. Complete address\n3. City\n4. Phone number (parcel ke liye)`,
            nextStep: 'Forward customer reply back to me'
          })
        }
        // Direct mode — talk to the customer
        return `✅ *Jee available hai!*\n\n📦 *${product.name}*\n💰 Price: Rs. ${product.currentRetailPrice || 'TBD'}\n\n` +
               `Apna order confirm karne ke liye please apna naam share karein.`
      }

      // Invalid input — re-show the list
      const productChoices = availableProducts
        .map((p, i) => `${i + 1}. ${p.name} — Rs. ${p.price || 'N/A'} (${p.qty} in stock)`)
        .join('\n')
      return `❌ Valid number enter karein (1-${availableProducts.length}) ya 0 for OOS:\n\n${productChoices}`
    }

    default:
      return isSupervised
        ? `Send a dress photo to check stock, or /help for commands.`
        : `👋 Dress ka photo send karein! 📸`
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

async function getOrCreateConfig (tenantId) {
  let config = await db.agentConfig.findUnique({ where: { tenantId } })

  if (!config) {
    config = await db.agentConfig.create({
      data: {
        tenantId,
        mode: process.env.AGENT_MODE || 'supervised',
        ownerPhone: normalizePhone(process.env.AGENT_OWNER_PHONE || ''),
        aiProvider: process.env.AI_PROVIDER || 'anthropic',
        aiModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        isEnabled: true
      }
    })
  }

  return config
}

async function getOrCreateSession (fromPhone, tenantId, mode) {
  // Find existing active session
  let session = await db.agentSession.findFirst({
    where: { tenantId, fromPhone: normalizePhone(fromPhone), isActive: true }
  })

  if (!session || new Date(session.expiresAt) < new Date()) {
    // Create new session (or re-create expired one)
    if (session) {
      await db.agentSession.update({ where: { id: session.id }, data: { isActive: false } })
    }

    session = await db.agentSession.create({
      data: {
        tenantId,
        fromPhone: normalizePhone(fromPhone),
        state: 'IDLE',
        sessionData: '{}',
        messageHistory: '[]',
        mode,
        isActive: true,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS)
      }
    })
  }

  return session
}

async function saveMessage (sessionId, direction, messageType, content, imageUrl = null) {
  return db.agentMessage.create({
    data: { sessionId, direction, messageType, content, imageUrl }
  })
}

async function setSessionState (sessionId, state) {
  return db.agentSession.update({ where: { id: sessionId }, data: { state } })
}

async function updateSession (sessionId, state, sessionData) {
  return db.agentSession.update({
    where: { id: sessionId },
    data: { state, sessionData: JSON.stringify(sessionData) }
  })
}

function parseSessionData (raw) {
  try { return JSON.parse(raw || '{}') } catch { return {} }
}

function parseMessageHistory (raw) {
  try { return JSON.parse(raw || '[]') } catch { return [] }
}

async function getSessionDataForOrder (orderId) {
  try {
    const session = await db.agentSession.findFirst({
      where: { pendingOrderId: orderId, isActive: true }
    })
    return session ? parseSessionData(session.sessionData) : null
  } catch {
    return null
  }
}

async function extractField (field, text, sessionData, history = []) {
  // Build conversation context from recent message history
  const historyContext = history.length > 0
    ? `Recent conversation:\n${history.map(m => `${m.direction === 'INBOUND' ? 'Customer' : 'Agent'}: ${m.content}`).join('\n')}\n\n`
    : ''

  const prompt = `${historyContext}Extract the customer's ${field} from this latest message: "${text}"
Reply with ONLY the extracted ${field}, nothing else. If not found, reply "null".`

  const result = await aiService.chat(
    [{ role: 'user', content: prompt }],
    { maxTokens: 50 }
  )

  const val = result.trim()
  return (val === 'null' || val === '') ? null : val
}

function extractPhone (text) {
  // Match Pakistani phone numbers
  const match = text.match(/(?:\+92|0092|0)?3[0-9]{9}/)
  if (!match) return null
  const digits = match[0].replace(/\D/g, '')
  // Normalize to 923XXXXXXXXX format
  if (digits.startsWith('92')) return digits
  if (digits.startsWith('0')) return '92' + digits.slice(1)
  return '92' + digits
}

function normalizePhone (phone) {
  if (!phone) return ''
  // Web-channel identifiers ("web-<uuid>") are not phone numbers — leave them
  // alone. Stripping non-digits would corrupt the session key.
  if (typeof phone === 'string' && phone.startsWith('web-')) return phone
  const digits = String(phone).replace(/\D/g, '')
  if (digits.startsWith('92')) return digits
  if (digits.startsWith('0')) return '92' + digits.slice(1)
  return digits
}

async function getShippingCharge (city, tenantId, productId) {
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { shippingCityCharges: true }
    })

    if (!tenant?.shippingCityCharges) return 0

    const charges = JSON.parse(tenant.shippingCityCharges)
    const cityKey = city.toLowerCase().trim()

    // Try exact match first
    for (const [key, charge] of Object.entries(charges)) {
      if (key.toLowerCase() === cityKey) return Number(charge)
    }

    // Try partial match
    for (const [key, charge] of Object.entries(charges)) {
      if (key.toLowerCase().includes(cityKey) || cityKey.includes(key.toLowerCase())) {
        return Number(charge)
      }
    }

    return 0
  } catch {
    return 0
  }
}

async function findOrCreateCustomer (phone, sessionData, tenantId) {
  const existingCustomer = await db.customer.findUnique({
    where: { phoneNumber_tenantId: { phoneNumber: phone, tenantId } }
  })

  if (existingCustomer) {
    // Update name/address if we have newer info
    return db.customer.update({
      where: { id: existingCustomer.id },
      data: {
        name: sessionData.customerName || existingCustomer.name,
        address: sessionData.address || existingCustomer.address,
        city: sessionData.city || existingCustomer.city
      }
    })
  }

  return db.customer.create({
    data: {
      tenantId,
      phoneNumber: phone,
      name: sessionData.customerName || null,
      address: sessionData.address || null,
      city: sessionData.city || null
    }
  })
}

async function createOrder (sessionData, tenantId) {
  const { generateOrderNumber } = require('../utils/orderNumberGenerator')

  // Find a default form for this tenant (required by schema)
  const form = await db.form.findFirst({ where: { tenantId } })
  if (!form) throw new Error('No form found for tenant — please create one first.')

  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { ownerId: true } })

  const orderNumber = await generateOrderNumber(tenantId)

  const formData = JSON.stringify({
    customerName: sessionData.customerName,
    address: sessionData.address,
    city: sessionData.city,
    phone: sessionData.customerPhone,
    product: sessionData.productName,
    price: sessionData.price,
    source: 'WhatsApp AI Agent'
  })

  return db.order.create({
    data: {
      orderNumber,
      tenantId,
      formId: form.id,
      businessOwnerId: tenant.ownerId,
      customerId: sessionData.customerId || null,
      status: 'PENDING',
      formData,
      shippingCharges: sessionData.shippingCharge || 0,
      selectedProducts: sessionData.productId ? JSON.stringify([sessionData.productId]) : null,
      productQuantities: sessionData.productId ? JSON.stringify({ [sessionData.productId]: 1 }) : null,
      productPrices: sessionData.productId ? JSON.stringify({ [sessionData.productId]: sessionData.price }) : null
    }
  })
}

function formatPackingNotification (order) {
  let data = {}
  try { data = JSON.parse(order.formData || '{}') } catch {}

  return `📦 *NEW ORDER TO PACK*
─────────────────
🔢 Order: ${order.orderNumber}
👤 Customer: ${data.customerName || 'N/A'}
📍 Address: ${data.address || 'N/A'}, ${data.city || 'N/A'}
📞 Phone: ${data.phone || 'N/A'}
👗 Item: ${data.product || 'N/A'}
💰 Amount: Rs. ${order.shippingCharges ? (data.price || 0) + order.shippingCharges : data.price || 0}
✅ Payment: VERIFIED

Reply "packed ✅" when done.`
}

function formatSupervisedReport ({ status, product, stock, price, identified, collected, extra, sendToCustomer, nextStep }) {
  const lines = ['🤖 *AGENT REPORT*', '─────────────────']
  if (status) lines.push(status)
  if (product) lines.push(`📦 Product: ${product}`)
  if (stock) lines.push(`📊 Stock: ${stock}`)
  if (price) lines.push(`💰 Price: ${price}`)
  if (identified) lines.push(`🔍 Identified: ${identified}`)
  if (collected) lines.push(collected)
  if (extra) lines.push(extra)
  if (sendToCustomer) {
    lines.push('')
    lines.push('📋 *SEND TO CUSTOMER:*')
    lines.push(`"${sendToCustomer}"`)
  }
  if (nextStep) {
    lines.push('')
    lines.push(`⏭️ ${nextStep}`)
  }
  return lines.join('\n')
}

function getProductPublicImageUrl (productId) {
  const base = (process.env.WEBHOOK_BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
  return `${base}/api/images/public/product/${productId}`
}

function getReAskPromptText (state) {
  const map = {
    COLLECTING_NAME:          'Apna naam share karein.',
    COLLECTING_ADDRESS:       'Apna complete address share karein.',
    COLLECTING_CITY:          'Apna city ka naam likhein.',
    COLLECTING_PHONE:         'Apna phone number likhein.',
    COLLECTING_PRODUCT_NAME:  'Product ka naam batain.',
    COLLECTING_PRODUCT_COST:  'Purchase/cost price batain (Rs.).',
    COLLECTING_PRODUCT_PRICE: 'Selling price batain (Rs.).',
    COLLECTING_PRODUCT_QTY:   'Kitne pieces hain?',
  }
  return map[state] || 'Requested information share karein.'
}

function isCommand (text) {
  return text && text.trim().startsWith('/')
}

module.exports = { processMessage }
