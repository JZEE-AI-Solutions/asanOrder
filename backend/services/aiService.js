/**
 * aiService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single AI abstraction layer. Swap between Anthropic (Claude) and OpenAI
 * by setting AI_PROVIDER=anthropic|openai in .env.
 *
 * All agent code imports THIS file — never the vendor SDKs directly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase()

// ── Lazy-load the right SDK ──────────────────────────────────────────────────
let anthropicClient = null
let openaiClient = null

function getAnthropicClient () {
  if (!anthropicClient) {
    const Anthropic = require('@anthropic-ai/sdk')
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return anthropicClient
}

function getOpenAIClient () {
  if (!openaiClient) {
    const OpenAI = require('openai')
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

function getModel (overrideModel) {
  if (overrideModel) return overrideModel
  if (provider === 'anthropic') {
    return process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
  }
  return process.env.OPENAI_MODEL || 'gpt-4o'
}

// ── Core: chat() ─────────────────────────────────────────────────────────────
/**
 * Send a chat message and get a text response.
 *
 * @param {Array}  messages  - [{role:'user'|'assistant', content: string|Array}]
 * @param {Object} options
 * @param {string} options.systemPrompt  - System/instruction prompt
 * @param {string} options.model         - Override model
 * @param {number} options.maxTokens     - Max tokens (default 1024)
 * @returns {Promise<string>}            - AI text response
 */
async function chat (messages, options = {}) {
  const { systemPrompt = '', model, maxTokens = 1024 } = options

  try {
    if (provider === 'anthropic') {
      const client = getAnthropicClient()
      const response = await client.messages.create({
        model: getModel(model),
        max_tokens: maxTokens,
        system: systemPrompt,
        messages
      })
      return response.content[0]?.text || ''
    } else {
      const client = getOpenAIClient()
      const msgs = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages
      const response = await client.chat.completions.create({
        model: getModel(model),
        max_tokens: maxTokens,
        messages: msgs
      })
      return response.choices[0]?.message?.content || ''
    }
  } catch (err) {
    console.error(`[aiService] chat error (${provider}):`, err.message)
    throw err
  }
}

// ── Core: analyzeImage() ─────────────────────────────────────────────────────
/**
 * Analyze an image (base64 or URL) and return a text description / answer.
 *
 * @param {Object} image
 * @param {string} image.base64   - base64-encoded image data (without data: prefix)
 * @param {string} image.url      - OR a public image URL
 * @param {string} image.mimeType - e.g. "image/jpeg"
 * @param {string} prompt         - Question to ask about the image
 * @param {Object} options        - Same as chat() options
 * @returns {Promise<string>}
 */
async function analyzeImage (image, prompt, options = {}) {
  const { systemPrompt = '', model, maxTokens = 1024 } = options

  try {
    if (provider === 'anthropic') {
      const client = getAnthropicClient()

      // Build image content block
      let imageBlock
      if (image.base64) {
        imageBlock = {
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mimeType || 'image/jpeg',
            data: image.base64
          }
        }
      } else {
        imageBlock = {
          type: 'image',
          source: { type: 'url', url: image.url }
        }
      }

      const response = await client.messages.create({
        model: getModel(model),
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [imageBlock, { type: 'text', text: prompt }]
        }]
      })
      return response.content[0]?.text || ''
    } else {
      const client = getOpenAIClient()

      // Build OpenAI image content
      let imageContent
      if (image.base64) {
        imageContent = {
          type: 'image_url',
          image_url: { url: `data:${image.mimeType || 'image/jpeg'};base64,${image.base64}` }
        }
      } else {
        imageContent = { type: 'image_url', image_url: { url: image.url } }
      }

      const msgs = []
      if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })
      msgs.push({
        role: 'user',
        content: [imageContent, { type: 'text', text: prompt }]
      })

      const response = await client.chat.completions.create({
        model: getModel(model),
        max_tokens: maxTokens,
        messages: msgs
      })
      return response.choices[0]?.message?.content || ''
    }
  } catch (err) {
    console.error(`[aiService] analyzeImage error (${provider}):`, err.message)
    throw err
  }
}

// ── Core: analyzeImages() ────────────────────────────────────────────────────
/**
 * Like analyzeImage but accepts an array of images. Useful for visual
 * comparison: "Image 1 is the customer's photo. Images 2-N are inventory
 * products. Which one matches?"
 *
 * @param {Array<{base64?:string, url?:string, mimeType?:string}>} images
 * @param {string} prompt
 * @param {Object} options - { systemPrompt, model, maxTokens }
 * @returns {Promise<string>}
 */
async function analyzeImages (images, prompt, options = {}) {
  const { systemPrompt = '', model, maxTokens = 1024 } = options
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('analyzeImages: images[] required')
  }

  try {
    if (provider === 'anthropic') {
      const client = getAnthropicClient()
      const imageBlocks = images.map(img => img.base64
        ? { type: 'image', source: { type: 'base64', media_type: img.mimeType || 'image/jpeg', data: img.base64 } }
        : { type: 'image', source: { type: 'url', url: img.url } })

      const response = await client.messages.create({
        model: getModel(model),
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [...imageBlocks, { type: 'text', text: prompt }]
        }]
      })
      return response.content[0]?.text || ''
    } else {
      const client = getOpenAIClient()
      const imageContents = images.map(img => img.base64
        ? { type: 'image_url', image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}` } }
        : { type: 'image_url', image_url: { url: img.url } })

      const msgs = []
      if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt })
      msgs.push({
        role: 'user',
        content: [...imageContents, { type: 'text', text: prompt }]
      })

      const response = await client.chat.completions.create({
        model: getModel(model),
        max_tokens: maxTokens,
        messages: msgs
      })
      return response.choices[0]?.message?.content || ''
    }
  } catch (err) {
    console.error(`[aiService] analyzeImages error (${provider}):`, err.message)
    throw err
  }
}

// ── Core: extractJSON() ──────────────────────────────────────────────────────
/**
 * Ask the AI to extract structured JSON from text/image.
 * Returns parsed object or null on failure.
 *
 * @param {string} prompt       - Instruction including input data
 * @param {Object} options      - Same options as chat()
 * @returns {Promise<Object|null>}
 */
async function extractJSON (prompt, options = {}) {
  const systemPrompt = `You are a data extraction assistant.
Always respond with valid JSON only — no markdown, no explanation, no code fences.
If you cannot extract the requested data, return: {"error": "reason"}`

  try {
    const raw = await chat(
      [{ role: 'user', content: prompt }],
      { ...options, systemPrompt, maxTokens: 512 }
    )

    // Strip accidental markdown fences
    const cleaned = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    return JSON.parse(cleaned)
  } catch (err) {
    console.error('[aiService] extractJSON parse error:', err.message)
    return null
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the active provider name for logging/display.
 */
function getProviderInfo () {
  return {
    provider,
    model: getModel(),
    anthropicKey: !!process.env.ANTHROPIC_API_KEY,
    openaiKey: !!process.env.OPENAI_API_KEY
  }
}

module.exports = { chat, analyzeImage, analyzeImages, extractJSON, getProviderInfo }
