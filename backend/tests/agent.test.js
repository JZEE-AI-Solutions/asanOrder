/**
 * backend/tests/agent.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive tests for the AI WhatsApp Agent.
 *
 * Coverage:
 *   - Supervised mode access control
 *   - All 8 WhatsApp commands (/help, /status, /stock, /reset, /cancel, /mode, /confirm, /reject)
 *   - Full 10-state happy path (IDLE → CONFIRMED)
 *   - Out-of-stock path
 *   - Session lifecycle (creation, TTL expiry, deactivation)
 *   - All 7 protected API endpoints
 *   - Edge cases (invalid phone, short address, invalid receipt)
 *
 * Run:
 *   npx jest tests/agent.test.js --runInBand --verbose
 * ─────────────────────────────────────────────────────────────────────────────
 */

const request = require('supertest')
const express = require('express')
const db      = require('../lib/db')
const {
  createTestTenant,
  cleanupTestData
} = require('./helpers/testHelpers')

// ─────────────────────────────────────────────────────────────────────────────
// MOCKS — must be defined before any require() that uses the mocked modules
// ─────────────────────────────────────────────────────────────────────────────

// Twilio — no real messages sent
const mockTwilio = {
  sendMessage:              jest.fn().mockResolvedValue('SM_TEST_SID'),
  sendMediaMessage:         jest.fn().mockResolvedValue('SM_TEST_MEDIA_SID'),
  downloadMedia:            jest.fn().mockResolvedValue({
    base64: Buffer.from('fake-image-data').toString('base64'),
    mimeType: 'image/jpeg'
  }),
  validateWebhookSignature: jest.fn().mockReturnValue(true),
  parseWebhookBody:         jest.fn(body => ({
    from:             (body.From || '').replace(/^whatsapp:\+?/, ''),
    to:               (body.To  || '').replace(/^whatsapp:\+?/, ''),
    text:             body.Body || '',
    numMedia:         parseInt(body.NumMedia || '0', 10),
    mediaUrl:         body.MediaUrl0 || null,
    mediaContentType: body.MediaContentType0 || null,
  })),
  stripWhatsAppPrefix: jest.fn(s => (s || '').replace(/^whatsapp:\+?/, '').replace(/\D/g, '')),
}
jest.mock('../services/twilioService', () => mockTwilio)

// Embedding service — mock so Jest never actually loads CLIP-Large.
// Returns deterministic { tiles, meanLab } so test seeds match for tile-MAX matching.
const TEST_DIM = 768
const TEST_TILES = 5
const oneHot = (i) => Array.from({ length: TEST_DIM }, (_, k) => k === 0 ? 1 : 0)  // same vec for every tile = self-match=1.0
const mockEmbedding = {
  MODEL_ID: 'clip-vit-large-patch14',
  EMBED_DIM: TEST_DIM,
  N_TILES: TEST_TILES,
  embedImage: jest.fn().mockResolvedValue({
    tiles:   Array.from({ length: TEST_TILES }, () => oneHot()),
    meanLab: [50, 0, 0]
  }),
  cosineSim: (a, b) => {
    let s = 0
    const n = Math.min(a.length, b.length)
    for (let i = 0; i < n; i++) s += a[i] * b[i]
    return s
  },
  labDeltaE: (a, b) => {
    if (!a || !b || a.length < 3 || b.length < 3) return Infinity
    const dL = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2]
    return Math.sqrt(dL * dL + da * da + db * db)
  },
  flattenTiles: (tiles) => {
    const out = []
    for (const t of tiles) for (const x of t) out.push(x)
    return out
  },
  unflattenTiles: (flat, dim = TEST_DIM) => {
    const n = Math.floor(flat.length / dim)
    const out = []
    for (let i = 0; i < n; i++) out.push(flat.slice(i * dim, (i + 1) * dim))
    return out
  },
  maxPairwiseCosine: (tilesA, tilesB) => {
    let best = -1
    for (const a of tilesA) {
      for (const b of tilesB) {
        let s = 0
        const n = Math.min(a.length, b.length)
        for (let i = 0; i < n; i++) s += a[i] * b[i]
        if (s > best) best = s
      }
    }
    return best < 0 ? 0 : best
  },
  getModel: jest.fn().mockResolvedValue({})
}
jest.mock('../services/embeddingService', () => mockEmbedding)

// AI service — predictable responses
const mockAi = {
  chat:         jest.fn().mockResolvedValue('Ahmad Khan'),
  // analyzeImage now used by handleDressPhoto for vision identification
  // (returns JSON describing the dress) AND for the broader-search picker
  // (returns "1"/"none"). Default = identification shape; picker tests use
  // mockResolvedValueOnce to override per-call.
  analyzeImage: jest.fn().mockResolvedValue(
    '{"description":"Red lawn suit with embroidery","color":"red","style":"suit","fabric":"lawn","searchKeywords":["red","lawn","embroidery"]}'
  ),
  analyzeImages: jest.fn().mockResolvedValue('none'),
  extractJSON:  jest.fn().mockResolvedValue({
    description: 'Red lawn suit with embroidery',
    color:       'red',
    style:       'suit',
    fabric:      'lawn',
    searchKeywords: ['red', 'lawn', 'embroidery'],
    // Payment receipt fields (also returned by default)
    isValid:        true,
    amount:         2500,
    bank:           'JazzCash',
    transactionId:  'TXN001',
    date:           '2026-05-17'
  }),
  getProviderInfo: jest.fn().mockReturnValue({ provider: 'openai', model: 'gpt-4o' }),
}
jest.mock('../services/aiService', () => mockAi)

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

const { processMessage } = require('../services/agentService')

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const OWNER_PHONE    = '923001234567'
const STRANGER_PHONE = '921999999999'

// ─────────────────────────────────────────────────────────────────────────────
// TEST STATE (shared across describe blocks)
// ─────────────────────────────────────────────────────────────────────────────

let testTenant, testUser
let testForm, testProduct, testOosProduct
let testApp

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Build an Express app with agent routes + mock auth injected */
function buildTestApp (user, tenant) {
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))

  const authModule = require('../middleware/auth')
  const origAuth   = authModule.authenticateToken
  const origRole   = authModule.requireRole

  // Inject mock auth
  authModule.authenticateToken = (req, res, next) => {
    req.user = { id: user.id, email: user.email, role: user.role, tenant }
    next()
  }
  authModule.requireRole = () => (req, res, next) => next()

  // Mount routes (they capture the mock middleware via closure)
  const agentRouter = require('../routes/agent')
  app.use('/api/agent', agentRouter)

  // Restore real middleware (routes already mounted with mocks)
  authModule.authenticateToken = origAuth
  authModule.requireRole       = origRole

  return app
}

/** Send a text or command to the agent via processMessage directly */
async function send (text, opts = {}) {
  return processMessage({
    fromPhone:        opts.phone    || OWNER_PHONE,
    text,
    mediaUrl:         null,
    mediaContentType: null,
    tenantId:         testTenant.id,
  })
}

/** Send an image (dress photo or receipt) */
async function sendImage (opts = {}) {
  return processMessage({
    fromPhone:        opts.phone    || OWNER_PHONE,
    text:             opts.caption  || '',
    mediaUrl:         'https://api.twilio.com/2010-04-01/Accounts/TEST/Messages/TEST/Media/TEST',
    mediaContentType: 'image/jpeg',
    tenantId:         testTenant.id,
  })
}

/** Get the current active session for OWNER_PHONE */
async function getOwnerSession () {
  return db.agentSession.findFirst({
    where: { fromPhone: OWNER_PHONE, tenantId: testTenant.id, isActive: true }
  })
}

/** Insert an agent session at a specific state (for state-specific tests) */
async function seedSession (state, sessionData = {}, extra = {}) {
  return db.agentSession.create({
    data: {
      tenantId:      testTenant.id,
      fromPhone:     OWNER_PHONE,
      state,
      sessionData:   JSON.stringify(sessionData),
      messageHistory:'[]',
      mode:          'supervised',
      isActive:      true,
      expiresAt:     new Date(Date.now() + 86_400_000),
      ...extra
    }
  })
}

/** Delete all agent sessions + messages for this tenant */
async function clearSessions () {
  const sessions = await db.agentSession.findMany({ where: { tenantId: testTenant.id } })
  for (const s of sessions) {
    await db.agentMessage.deleteMany({ where: { sessionId: s.id } })
  }
  await db.agentSession.deleteMany({ where: { tenantId: testTenant.id } })
}

/** Reset all mocks to their default return values */
function resetMocks () {
  jest.clearAllMocks()

  mockTwilio.sendMessage.mockResolvedValue('SM_TEST_SID')
  mockTwilio.sendMediaMessage.mockResolvedValue('SM_TEST_MEDIA_SID')
  mockTwilio.downloadMedia.mockResolvedValue({
    base64: Buffer.from('fake-image-data').toString('base64'),
    mimeType: 'image/jpeg'
  })
  mockTwilio.validateWebhookSignature.mockReturnValue(true)
  mockTwilio.parseWebhookBody.mockImplementation(body => ({
    from:             (body.From || '').replace(/^whatsapp:\+?/, ''),
    to:               (body.To  || '').replace(/^whatsapp:\+?/, ''),
    text:             body.Body || '',
    numMedia:         parseInt(body.NumMedia || '0', 10),
    mediaUrl:         body.MediaUrl0 || null,
    mediaContentType: body.MediaContentType0 || null,
  }))
  mockTwilio.stripWhatsAppPrefix.mockImplementation(
    s => (s || '').replace(/^whatsapp:\+?/, '').replace(/\D/g, '')
  )

  mockAi.chat.mockResolvedValue('Ahmad Khan')
  mockAi.extractJSON.mockResolvedValue({
    description: 'Red lawn suit with embroidery',
    color: 'red', style: 'suit', fabric: 'lawn',
    searchKeywords: ['red', 'lawn', 'embroidery'],
    isValid: true, amount: 2500, bank: 'JazzCash', transactionId: 'TXN001', date: '2026-05-17'
  })
  mockAi.getProviderInfo.mockReturnValue({ provider: 'openai', model: 'gpt-4o' })
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL SETUP / TEARDOWN
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Create tenant + user
  const result = await createTestTenant()
  testTenant   = result.tenant
  testUser     = result.user

  // 2. Form — required by createOrder()
  testForm = await db.form.create({
    data: {
      name:         'Agent Test Form',
      formCategory: 'SHOPPING_CART',
      tenantId:     testTenant.id,
      formLink:     `agent-test-form-${Date.now()}`,
      isPublished:  true
    }
  })

  // 3. In-stock product (matches AI keywords: red, lawn, suit)
  testProduct = await db.product.create({
    data: {
      name:               'Red Lawn Suit',
      sku:                `RLS-${Date.now()}`,
      tenantId:           testTenant.id,
      currentRetailPrice: 2500,
      lastPurchasePrice:  1500,
      currentQuantity:    10,
      isActive:           true,
      category:           'suit'
    }
  })

  // Seed embedding identical to the mock's customer tiles so dress-photo
  // upload tests trigger AUTO-MATCH (max pairwise cosine = 1.0, ΔE = 0).
  const seedTileEmbeddings = []
  for (let t = 0; t < TEST_TILES; t++) {
    for (let i = 0; i < TEST_DIM; i++) seedTileEmbeddings.push(i === 0 ? 1 : 0)
  }
  await db.productEmbedding.create({
    data: {
      productId:      testProduct.id,
      tileEmbeddings: seedTileEmbeddings,
      embedding:      [],
      meanLab:        [50, 0, 0],
      model:          'clip-vit-large-patch14'
    }
  })

  // 4. Out-of-stock product
  testOosProduct = await db.product.create({
    data: {
      name:               'Blue Chiffon Dress',
      sku:                `BCD-${Date.now()}`,
      tenantId:           testTenant.id,
      currentRetailPrice: 3200,
      lastPurchasePrice:  2000,
      currentQuantity:    0,
      isActive:           true,
      category:           'dress'
    }
  })

  // 5. Agent config for this tenant
  await db.agentConfig.create({
    data: {
      tenantId:   testTenant.id,
      mode:       'supervised',
      ownerPhone: OWNER_PHONE,
      aiProvider: 'openai',
      aiModel:    'gpt-4o',
      isEnabled:  true
    }
  })

  // 6. Express app with mocked auth
  testApp = buildTestApp(testUser, testTenant)
}, 60_000)

afterAll(async () => {
  // Clear agent tables first (foreign-key order)
  await clearSessions()
  await db.agentConfig.deleteMany({ where: { tenantId: testTenant.id } })

  // Clean the rest (existing helper covers orders, customers, products, tenant, user)
  await cleanupTestData(testTenant.id)
  await db.$disconnect()
}, 60_000)

beforeEach(async () => {
  await clearSessions()
  resetMocks()
})

// ═════════════════════════════════════════════════════════════════════════════
// 1. SUPERVISED MODE ACCESS CONTROL
// ═════════════════════════════════════════════════════════════════════════════

describe('1. Supervised mode access control', () => {
  test('owner phone gets a reply', async () => {
    const reply = await send('/help')
    expect(reply).toContain('/status')
  }, 15_000)

  test('non-owner phone is silently ignored', async () => {
    const reply = await processMessage({
      fromPhone: STRANGER_PHONE, text: 'hello',
      mediaUrl: null, mediaContentType: null, tenantId: testTenant.id
    })
    expect(reply).toBeNull()
    expect(mockTwilio.sendMessage).not.toHaveBeenCalled()
  }, 15_000)

  test('disabled agent ignores all messages', async () => {
    await db.agentConfig.update({
      where: { tenantId: testTenant.id },
      data:  { isEnabled: false }
    })
    const reply = await send('/help')
    expect(reply).toBeNull()
    // Restore
    await db.agentConfig.update({
      where: { tenantId: testTenant.id },
      data:  { isEnabled: true }
    })
  }, 15_000)
})

// ═════════════════════════════════════════════════════════════════════════════
// 2. WHATSAPP COMMANDS
// ═════════════════════════════════════════════════════════════════════════════

describe('2. WhatsApp commands', () => {
  test('/help returns full command menu', async () => {
    const reply = await send('/help')
    expect(reply).toContain('/status')
    expect(reply).toContain('/confirm')
    expect(reply).toContain('/reset')
    expect(reply).toContain('/mode')
    expect(reply).toContain('SUPERVISED')
  }, 15_000)

  test('/status returns active session + order counts', async () => {
    const reply = await send('/status')
    expect(reply).toContain('Active sessions')
    expect(reply).toContain('Pending orders')
  }, 15_000)

  test('/stock [name] returns matching products', async () => {
    const reply = await send('/stock Red Lawn')
    expect(reply).toContain('Red Lawn Suit')
    expect(reply).toMatch(/Stock: \d+/)
  }, 15_000)

  test('/stock without query returns usage hint', async () => {
    const reply = await send('/stock')
    expect(reply).toContain('Usage')
  }, 15_000)

  test('/reset clears session to IDLE', async () => {
    await seedSession('COLLECTING_NAME', { customerName: 'Old Data' })
    const reply = await send('/reset')
    expect(reply).toContain('reset')
    const session = await getOwnerSession()
    expect(session?.state).toBe('IDLE')
    expect(JSON.parse(session?.sessionData || '{}')).toEqual({})
  }, 15_000)

  test('/cancel sets session inactive', async () => {
    await seedSession('COLLECTING_CITY', {})
    const reply = await send('/cancel testing')
    expect(reply).toContain('cancel')
    const session = await db.agentSession.findFirst({
      where: { tenantId: testTenant.id, fromPhone: OWNER_PHONE }
    })
    expect(session?.state).toBe('CANCELLED')
    expect(session?.isActive).toBe(false)
  }, 15_000)

  test('/mode direct switches config', async () => {
    const reply = await send('/mode direct')
    expect(reply).toContain('direct')
    const config = await db.agentConfig.findUnique({ where: { tenantId: testTenant.id } })
    expect(config?.mode).toBe('direct')
    // Restore supervised for remaining tests
    await db.agentConfig.update({
      where: { tenantId: testTenant.id },
      data:  { mode: 'supervised' }
    })
  }, 15_000)

  test('/mode with invalid value returns usage hint', async () => {
    const reply = await send('/mode badvalue')
    expect(reply).toContain('Usage')
  }, 15_000)

  test('unknown command returns error message', async () => {
    const reply = await send('/unknown')
    expect(reply).toContain('Unknown command')
  }, 15_000)
})

// ═════════════════════════════════════════════════════════════════════════════
// 3. STATE MACHINE — SESSION STATES
// ═════════════════════════════════════════════════════════════════════════════

describe('3. State machine — individual states', () => {
  test('IDLE: text message returns ready greeting', async () => {
    const reply = await send('hello')
    expect(reply).toContain('Ready')
    const session = await getOwnerSession()
    expect(session?.state).toBe('IDLE')
  }, 15_000)

  test('IDLE → COLLECTING_NAME: in-stock dress photo', async () => {
    // AI identifies red lawn → matches testProduct (in-stock).
    // handleDressPhoto now uses analyzeImage (vision) instead of extractJSON.
    mockAi.analyzeImage.mockResolvedValueOnce(
      '{"description":"Red lawn suit","color":"red","style":"suit","fabric":"lawn","searchKeywords":["red","lawn","suit"]}'
    )
    const reply = await sendImage()
    expect(reply).toContain('AVAILABLE')
    expect(reply).toContain('Red Lawn Suit')
    const session = await getOwnerSession()
    expect(session?.state).toBe('COLLECTING_NAME')
  }, 20_000)

  test('COLLECTING_NAME: valid name → COLLECTING_ADDRESS', async () => {
    await seedSession('COLLECTING_NAME', {
      productId: testProduct.id, productName: testProduct.name, price: 2500, stock: 10
    })
    mockAi.chat.mockResolvedValueOnce('Ahmad Khan')
    const reply = await send('Ahmad Khan')
    const session = await getOwnerSession()
    expect(session?.state).toBe('COLLECTING_ADDRESS')
    expect(JSON.parse(session?.sessionData || '{}')).toMatchObject({ customerName: 'Ahmad Khan' })
    expect(reply).toContain('address')
  }, 15_000)

  test('COLLECTING_ADDRESS: valid address → COLLECTING_CITY', async () => {
    await seedSession('COLLECTING_ADDRESS', {
      productId: testProduct.id, customerName: 'Ahmad Khan'
    })
    const reply = await send('House 5, Street 3, Gulberg, Lahore')
    const session = await getOwnerSession()
    expect(session?.state).toBe('COLLECTING_CITY')
    expect(reply).toContain('city')
  }, 15_000)

  test('COLLECTING_ADDRESS: short address (<5 chars) stays in same state', async () => {
    await seedSession('COLLECTING_ADDRESS', {})
    await send('Hi')
    const session = await getOwnerSession()
    expect(session?.state).toBe('COLLECTING_ADDRESS')
  }, 15_000)

  test('COLLECTING_CITY: city → COLLECTING_PHONE with shipping info', async () => {
    await seedSession('COLLECTING_CITY', {
      productId: testProduct.id, price: 2500,
      customerName: 'Ahmad Khan', address: 'House 5, Gulberg'
    })
    const reply = await send('Lahore')
    const session = await getOwnerSession()
    expect(session?.state).toBe('COLLECTING_PHONE')
    expect(reply).toContain('phone')
  }, 15_000)

  test('COLLECTING_PHONE: valid Pakistan number → AWAITING_PAYMENT + order in DB', async () => {
    await seedSession('COLLECTING_PHONE', {
      productId:    testProduct.id,
      productName:  testProduct.name,
      price:        2500,
      customerName: 'Ahmad Khan',
      address:      'House 5, Gulberg',
      city:         'Lahore',
      shippingCharge: 200,
      totalAmount:  2700
    })
    const reply = await send('03001234567')
    const session = await getOwnerSession()
    expect(session?.state).toBe('AWAITING_PAYMENT')
    expect(session?.pendingOrderId).toBeTruthy()
    const order = await db.order.findUnique({ where: { id: session.pendingOrderId } })
    expect(order).toBeTruthy()
    expect(order?.status).toBe('PENDING')
    expect(reply).toContain('Order')
  }, 20_000)

  test('COLLECTING_PHONE: invalid number stays in same state', async () => {
    await seedSession('COLLECTING_PHONE', { price: 2500 })
    await send('not a phone number')
    const session = await getOwnerSession()
    expect(session?.state).toBe('COLLECTING_PHONE')
  }, 15_000)

  test('AWAITING_PAYMENT: text message prompts for receipt photo', async () => {
    await seedSession('AWAITING_PAYMENT', { orderNumber: 'TEST-001' })
    const reply = await send('I sent the payment')
    expect(reply).toContain('receipt')
  }, 15_000)

  test('AWAITING_PAYMENT: receipt image → VERIFYING_PAYMENT', async () => {
    const order = await db.order.create({
      data: {
        orderNumber:    `TEST-REC-${Date.now()}`,
        tenantId:       testTenant.id,
        formId:         testForm.id,
        businessOwnerId:testTenant.ownerId,
        status:         'PENDING',
        formData:       JSON.stringify({ customerName: 'Ahmad Khan', city: 'Lahore' })
      }
    })
    await seedSession('AWAITING_PAYMENT',
      { orderNumber: order.orderNumber, price: 2500, customerName: 'Ahmad Khan' },
      { pendingOrderId: order.id }
    )
    mockAi.extractJSON.mockResolvedValueOnce({
      isValid: true, amount: 2500, bank: 'JazzCash', transactionId: 'TXN001', date: '2026-05-17'
    })
    const reply = await sendImage()
    const session = await getOwnerSession()
    expect(session?.state).toBe('VERIFYING_PAYMENT')
    expect(reply).toContain('PAYMENT RECEIPT RECEIVED')
    expect(reply).toContain('/confirm')
  }, 20_000)

  test('AWAITING_PAYMENT: invalid receipt stays in same state', async () => {
    const order = await db.order.create({
      data: {
        orderNumber:     `TEST-INV-${Date.now()}`,
        tenantId:        testTenant.id,
        formId:          testForm.id,
        businessOwnerId: testTenant.ownerId,
        status:          'PENDING',
        formData:        '{}'
      }
    })
    await seedSession('AWAITING_PAYMENT', { orderNumber: order.orderNumber },
      { pendingOrderId: order.id }
    )
    mockAi.extractJSON.mockResolvedValueOnce({ isValid: false })
    await sendImage()
    const session = await getOwnerSession()
    expect(session?.state).toBe('AWAITING_PAYMENT')
  }, 20_000)

  test('VERIFYING_PAYMENT: text message gives wait response', async () => {
    await seedSession('VERIFYING_PAYMENT', { orderNumber: 'TEST-WAIT-001' })
    const reply = await send('any text')
    expect(reply).toContain('pending')
  }, 15_000)

  test('CONFIRMED: text message gives already-confirmed response', async () => {
    await seedSession('CONFIRMED', { orderNumber: 'DONE-001' })
    const reply = await send('hello')
    expect(reply).toContain('confirm')
  }, 15_000)
})

// ═════════════════════════════════════════════════════════════════════════════
// 4. /CONFIRM AND /REJECT COMMANDS
// ═════════════════════════════════════════════════════════════════════════════

describe('4. /confirm and /reject commands', () => {
  test('/confirm ORDER → CONFIRMED, packing + delivery team notified', async () => {
    const orderNum = `CONF-${Date.now()}`
    const order = await db.order.create({
      data: {
        orderNumber:     orderNum,
        tenantId:        testTenant.id,
        formId:          testForm.id,
        businessOwnerId: testTenant.ownerId,
        status:          'PAYMENT_RECEIVED',
        formData:        JSON.stringify({
          customerName: 'Ahmad Khan', address: 'Gulberg', city: 'Lahore',
          phone: '03001234567', product: 'Red Lawn Suit', price: 2500
        })
      }
    })
    await db.agentConfig.update({
      where: { tenantId: testTenant.id },
      data:  { packingTeamPhone: '923009999999', deliveryTeamPhone: '923008888888' }
    })
    const reply = await send(`/confirm ${orderNum}`)

    expect(reply).toContain('CONFIRMED')
    expect(reply).toContain('Packing team')
    expect(reply).toContain('Delivery team')

    // Twilio called for packing + delivery
    const calls = mockTwilio.sendMessage.mock.calls
    const packingCall   = calls.find(c => c[0] === '923009999999')
    const deliveryCall  = calls.find(c => c[0] === '923008888888')
    expect(packingCall).toBeDefined()
    expect(packingCall[1]).toContain('NEW ORDER TO PACK')
    expect(deliveryCall).toBeDefined()
    expect(deliveryCall[1]).toContain('DISPATCH ALERT')

    // DB updated
    const updated = await db.order.findUnique({ where: { id: order.id } })
    expect(updated?.status).toBe('CONFIRMED')
    expect(updated?.paymentVerified).toBe(true)

    // Restore phones
    await db.agentConfig.update({
      where: { tenantId: testTenant.id },
      data:  { packingTeamPhone: null, deliveryTeamPhone: null }
    })
  }, 20_000)

  test('/confirm with wrong order number returns not-found error', async () => {
    const reply = await send('/confirm WRONG-ORDER-999')
    expect(reply).toContain('not found')
  }, 15_000)

  test('/reject reverts order to PENDING and resets session to AWAITING_PAYMENT', async () => {
    const orderNum = `REJ-${Date.now()}`
    const order = await db.order.create({
      data: {
        orderNumber:     orderNum,
        tenantId:        testTenant.id,
        formId:          testForm.id,
        businessOwnerId: testTenant.ownerId,
        status:          'PAYMENT_RECEIVED',
        formData:        '{}'
      }
    })
    const session = await seedSession('VERIFYING_PAYMENT',
      { orderNumber: orderNum }, { pendingOrderId: order.id }
    )
    const reply = await send(`/reject ${orderNum}`)

    expect(reply).toContain('rejected')
    const updSession = await db.agentSession.findUnique({ where: { id: session.id } })
    expect(updSession?.state).toBe('AWAITING_PAYMENT')
    const updOrder = await db.order.findUnique({ where: { id: order.id } })
    expect(updOrder?.status).toBe('PENDING')
  }, 20_000)
})

// ═════════════════════════════════════════════════════════════════════════════
// 5. OUT-OF-STOCK PATH
// ═════════════════════════════════════════════════════════════════════════════

describe('5. Out-of-stock path', () => {
  beforeEach(async () => {
    // Temporarily make ALL products OOS
    await db.product.updateMany({
      where: { tenantId: testTenant.id },
      data:  { currentQuantity: 0 }
    })
  })

  afterEach(async () => {
    // Restore testProduct stock
    await db.product.update({
      where: { id: testProduct.id },
      data:  { currentQuantity: 10 }
    })
  })

  test('OOS dress photo → AWAITING_STOCK_CONFIRM state + OOS message + YES prompt (supervised)', async () => {
    mockAi.analyzeImage.mockResolvedValueOnce(
      '{"description":"Red lawn suit","color":"red","style":"suit","fabric":"lawn","searchKeywords":["red","lawn","suit"]}'
    )
    // Broader-search picker — returns "none" (no auto-match found)
    mockAi.analyzeImage.mockResolvedValueOnce('none')
    mockAi.chat.mockResolvedValueOnce('none')

    const reply = await sendImage()
    const session = await getOwnerSession()
    // In supervised mode: state moves to AWAITING_STOCK_CONFIRM (not IDLE)
    expect(session?.state).toBe('AWAITING_STOCK_CONFIRM')
    expect(reply).toContain('OUT OF STOCK')
    expect(reply).toContain('YES')
  }, 20_000)

  test('OOS reply mentions "nahi hai" (Urdu OOS message)', async () => {
    mockAi.analyzeImage.mockResolvedValueOnce(
      '{"description":"Blue dress","color":"blue","style":"suit","fabric":"chiffon","searchKeywords":["blue","chiffon"]}'
    )
    mockAi.analyzeImage.mockResolvedValueOnce('none')
    mockAi.chat.mockResolvedValueOnce('none')

    const reply = await sendImage()
    // Supervised reply contains "OUT OF STOCK" or the send-to-customer text
    expect(reply).toMatch(/OUT OF STOCK|nahi hai/i)
  }, 20_000)
})

// ═════════════════════════════════════════════════════════════════════════════
// 6. SESSION LIFECYCLE
// ═════════════════════════════════════════════════════════════════════════════

describe('6. Session lifecycle', () => {
  test('session is auto-created on first message', async () => {
    const before = await db.agentSession.count({ where: { tenantId: testTenant.id } })
    await send('hello')
    const after = await db.agentSession.count({ where: { tenantId: testTenant.id } })
    expect(after).toBe(before + 1)
  }, 15_000)

  test('inbound + outbound messages saved to AgentMessage table', async () => {
    await send('/help')
    const session = await db.agentSession.findFirst({ where: { tenantId: testTenant.id } })
    const msgs = await db.agentMessage.findMany({ where: { sessionId: session?.id } })
    expect(msgs.some(m => m.direction === 'INBOUND')).toBe(true)
    expect(msgs.some(m => m.direction === 'OUTBOUND')).toBe(true)
  }, 15_000)

  test('expired session is replaced by a new one', async () => {
    // Create session that expired in the past
    const expired = await db.agentSession.create({
      data: {
        tenantId:      testTenant.id,
        fromPhone:     OWNER_PHONE,
        state:         'COLLECTING_NAME',
        sessionData:   '{"customerName":"Old"}',
        messageHistory:'[]',
        mode:          'supervised',
        isActive:      true,
        expiresAt:     new Date(Date.now() - 1_000) // already expired
      }
    })
    await send('hello')
    // Old session deactivated
    const old = await db.agentSession.findUnique({ where: { id: expired.id } })
    expect(old?.isActive).toBe(false)
    // New session in IDLE
    const newSession = await getOwnerSession()
    expect(newSession?.id).not.toBe(expired.id)
    expect(newSession?.state).toBe('IDLE')
  }, 15_000)

  test('TTL is refreshed on every message', async () => {
    const before = new Date(Date.now() + 23 * 3600_000) // 23h from now
    await seedSession('IDLE', {})
    await send('/status')
    const session = await getOwnerSession()
    // expiresAt should be after the "before" time (refreshed to ~24h)
    expect(new Date(session?.expiresAt) > before).toBe(true)
  }, 15_000)
})

// ═════════════════════════════════════════════════════════════════════════════
// 7. PROTECTED API ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

describe('7. Protected API endpoints', () => {
  test('GET /api/agent/status → 200 with stats', async () => {
    const res = await request(testApp).get('/api/agent/status')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('isEnabled')
    expect(res.body).toHaveProperty('mode')
    // Response shape: { stats: { activeSessions, pendingOrders, pendingPayments, totalOrdersToday } }
    expect(res.body).toHaveProperty('stats')
    expect(res.body.stats).toHaveProperty('activeSessions')
    expect(res.body.stats).toHaveProperty('pendingOrders')
  }, 15_000)

  test('GET /api/agent/config → 200 with config fields', async () => {
    const res = await request(testApp).get('/api/agent/config')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('mode')
    expect(res.body).toHaveProperty('ownerPhone')
    expect(res.body).toHaveProperty('aiProvider')
    expect(res.body).toHaveProperty('isEnabled')
  }, 15_000)

  test('PUT /api/agent/config → 200 and persists changes', async () => {
    const res = await request(testApp)
      .put('/api/agent/config')
      .send({
        mode:       'direct',
        ownerPhone: OWNER_PHONE,
        aiProvider: 'anthropic',
        aiModel:    'claude-3-5-sonnet-20241022',
        isEnabled:  true
      })
    expect(res.status).toBe(200)
    const config = await db.agentConfig.findUnique({ where: { tenantId: testTenant.id } })
    expect(config?.mode).toBe('direct')
    expect(config?.aiProvider).toBe('anthropic')
    // Restore
    await db.agentConfig.update({
      where: { tenantId: testTenant.id },
      data:  { mode: 'supervised', aiProvider: 'openai' }
    })
  }, 15_000)

  test('GET /api/agent/sessions → 200 with sessions array', async () => {
    const res = await request(testApp).get('/api/agent/sessions')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.sessions)).toBe(true)
  }, 15_000)

  test('GET /api/agent/sessions?active=true → only active sessions', async () => {
    // One active, one inactive
    await seedSession('IDLE', {})
    await db.agentSession.create({
      data: {
        tenantId: testTenant.id, fromPhone: '921111111111',
        state: 'CANCELLED', sessionData: '{}', messageHistory: '[]',
        mode: 'supervised', isActive: false,
        expiresAt: new Date(Date.now() + 86_400_000)
      }
    })
    const res = await request(testApp).get('/api/agent/sessions?active=true')
    expect(res.status).toBe(200)
    expect(res.body.sessions.every(s => s.isActive === true)).toBe(true)
  }, 15_000)

  test('GET /api/agent/sessions/:id → 200 with messages array', async () => {
    const session = await seedSession('IDLE', {})
    await db.agentMessage.create({
      data: { sessionId: session.id, direction: 'INBOUND', messageType: 'TEXT', content: 'hello' }
    })
    const res = await request(testApp).get(`/api/agent/sessions/${session.id}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.messages)).toBe(true)
    expect(res.body.messages.length).toBeGreaterThan(0)
  }, 15_000)

  test('POST /api/agent/sessions/:id/reset → 200, state=IDLE', async () => {
    const session = await seedSession('COLLECTING_NAME', { customerName: 'TestUser' })
    const res = await request(testApp).post(`/api/agent/sessions/${session.id}/reset`)
    expect(res.status).toBe(200)
    const updated = await db.agentSession.findUnique({ where: { id: session.id } })
    expect(updated?.state).toBe('IDLE')
    expect(JSON.parse(updated?.sessionData || '{}')).toEqual({})
  }, 15_000)

  test('POST /api/agent/sessions/:id/cancel → 200, isActive=false', async () => {
    const session = await seedSession('AWAITING_PAYMENT', {})
    const res = await request(testApp).post(`/api/agent/sessions/${session.id}/cancel`)
    expect(res.status).toBe(200)
    const updated = await db.agentSession.findUnique({ where: { id: session.id } })
    expect(updated?.state).toBe('CANCELLED')
    expect(updated?.isActive).toBe(false)
  }, 15_000)

  test('POST /api/agent/test → 200 with AI reply', async () => {
    mockAi.chat.mockResolvedValueOnce('Assalam o Alaikum! Main aap ki madad ke liye hazir hoon.')
    const res = await request(testApp)
      .post('/api/agent/test')
      .send({ message: 'Say hello in Urdu.' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body).toHaveProperty('provider')
    expect(res.body).toHaveProperty('reply')
    expect(typeof res.body.reply).toBe('string')
  }, 15_000)
})
