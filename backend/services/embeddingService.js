/**
 * embeddingService.js — Phase 1 Re-ID preprocessing pipeline (v2)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * For each input image we compute TWO descriptors:
 *
 *   embedding (768-d, L2-normalised)  ── visual texture/style via CLIP-Large
 *   meanLab   (3-d, CIE Lab)          ── dominant color of the garment
 *
 * The agent uses BOTH at match time:
 *   - cosine similarity on `embedding` → finds visually-similar candidates
 *   - Lab ΔE on `meanLab`              → rejects color mismatches that CLIP
 *                                         can't tell apart
 *
 * Pipeline:
 *   (1) Background removal      ── @imgly/background-removal-node
 *   (2) Tight bounding box on opaque pixels
 *   (3) Torso crop              ── upper 10% → 60% of bbox height,
 *                                  middle 70% horizontally (kameez region)
 *   (4) Multi-crop              ── 5 tiles (center + 4 corners) at 224×224
 *   (5) CLIP-ViT-Large-Patch14  ── 5 × 768-d → mean-pool → L2-normalise
 *   (6) Lab mean color          ── computed on the torso-crop pixels
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path = require('path')
const sharp = require('sharp')

process.env.TRANSFORMERS_CACHE = process.env.TRANSFORMERS_CACHE ||
  path.join(__dirname, '..', '.model-cache')

const MODEL_ID = process.env.CLIP_MODEL_ID || 'Xenova/clip-vit-large-patch14'
const EMBED_DIM = 768
const CROP_SIZE = 224

let xfPromise = null
function getTransformers () {
  if (!xfPromise) xfPromise = import('@xenova/transformers')
  return xfPromise
}

let modelPromise = null
function getModel () {
  if (modelPromise) return modelPromise
  modelPromise = (async () => {
    const xf = await getTransformers()
    const { AutoProcessor, CLIPVisionModelWithProjection, env } = xf
    if (env) {
      env.allowRemoteModels = true
      env.cacheDir = process.env.TRANSFORMERS_CACHE
    }
    console.log(`[embeddingService] Loading ${MODEL_ID} (one-time download)…`)
    const t0 = Date.now()
    const processor = await AutoProcessor.from_pretrained(MODEL_ID)
    const model     = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { quantized: true })
    console.log(`[embeddingService] Model ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    return { processor, model }
  })().catch(err => { modelPromise = null; throw err })
  return modelPromise
}

let bgRemovalPromise = null
function getBackgroundRemover () {
  if (!bgRemovalPromise) bgRemovalPromise = import('@imgly/background-removal-node')
  return bgRemovalPromise
}

// ── sRGB → CIE Lab (D65 illuminant) ─────────────────────────────────────────
function rgbToLab (r, g, b) {
  r /= 255; g /= 255; b /= 255
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722)
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const fx = x > 0.008856 ? Math.cbrt(x) : (7.787 * x + 16 / 116)
  const fy = y > 0.008856 ? Math.cbrt(y) : (7.787 * y + 16 / 116)
  const fz = z > 0.008856 ? Math.cbrt(z) : (7.787 * z + 16 / 116)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** Euclidean ΔE in Lab. ΔE < 5 = very similar, 5-15 = noticeable, 15+ = different colors. */
function labDeltaE (a, b) {
  if (!a || !b || a.length < 3 || b.length < 3) return Infinity
  const dL = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2]
  return Math.sqrt(dL * dL + da * da + db * db)
}

/** Compute mean Lab color of opaque pixels (alpha > 16) in an RGBA raw buffer. */
function meanLabFromRgba (data, channels) {
  let sumL = 0, sumA = 0, sumB = 0, n = 0
  const stride = channels
  for (let i = 0; i < data.length; i += stride) {
    if (stride < 4 || data[i + 3] > 16) {
      const [L, A, B] = rgbToLab(data[i], data[i + 1], data[i + 2])
      sumL += L; sumA += A; sumB += B; n++
    }
  }
  if (n === 0) return [0, 0, 0]
  return [sumL / n, sumA / n, sumB / n]
}

/**
 * Crop the image to the bounding box of opaque pixels, then take the
 * upper-torso slice (10%–60% of bbox height, center 70% width) — i.e. the
 * kameez region, excluding head/legs/dupatta-spread.
 */
async function torsoCrop (buf) {
  const img = sharp(buf).ensureAlpha()
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const w = info.width, h = info.height, ch = info.channels
  let minX = w, minY = h, maxX = 0, maxY = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * ch + 3]
      if (a > 16) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  // No alpha info — fall back to full image.
  if (minX >= maxX || minY >= maxY) {
    return { buf: await sharp(buf).flatten({ background: { r: 255, g: 255, b: 255 } }).png().toBuffer(),
             meanLab: meanLabFromRgba(data, ch) }
  }

  const bw = maxX - minX, bh = maxY - minY
  // Kameez region: ~10–60% of body height, center 70% of width.
  const tTop  = minY + Math.round(bh * 0.10)
  const tBot  = minY + Math.round(bh * 0.60)
  const tLeft = minX + Math.round(bw * 0.15)
  const tW    = Math.max(8, Math.round(bw * 0.70))
  const tH    = Math.max(8, tBot - tTop)

  const torsoBuf = await sharp(buf)
    .extract({ left: tLeft, top: tTop, width: tW, height: tH })
    .png()
    .toBuffer()

  // Mean Lab on the segmented (still has alpha) torso buffer.
  const torsoRaw = await sharp(torsoBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const meanLab = meanLabFromRgba(torsoRaw.data, torsoRaw.info.channels)

  // Then flatten alpha to white for CLIP (it doesn't understand transparency).
  const flat = await sharp(torsoBuf)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .png()
    .toBuffer()

  return { buf: flat, meanLab }
}

const N_TILES = 5

/**
 * Compute per-tile CLIP embeddings + mean Lab for the given image.
 *
 * @param {Object} image
 * @param {string} image.base64
 * @param {string} [image.mimeType]
 * @returns {Promise<{ tiles: number[][], meanLab: number[] }>}
 *          tiles is an array of length N_TILES, each a 768-d L2-normalized vector.
 */
async function embedImage ({ base64, mimeType }) {
  if (!base64) throw new Error('embedImage: base64 required')

  const rawBuf = Buffer.from(base64, 'base64')

  // (1) Background removal.
  let segmentedBuf
  try {
    const { removeBackground } = await getBackgroundRemover()
    const blob = new Blob([rawBuf], { type: mimeType || 'image/jpeg' })
    const outBlob = await removeBackground(blob, {
      output: { format: 'image/png', quality: 0.9 },
      model: 'small'
    })
    segmentedBuf = Buffer.from(await outBlob.arrayBuffer())
  } catch (err) {
    console.warn('[embeddingService] BG removal failed, using raw image:', err.message)
    segmentedBuf = rawBuf
  }

  // (2-3) Tight bbox + torso crop.
  let { buf: torsoBuf, meanLab } = await torsoCrop(segmentedBuf)

  // Fallback: if BG removal yielded an empty mask (Lab all-zero), recompute
  // Lab on the unsegmented raw image so the gate still has a real signal.
  if (meanLab[0] === 0 && meanLab[1] === 0 && meanLab[2] === 0) {
    console.warn('[embeddingService] BG removal yielded empty mask; recomputing Lab from raw image')
    try {
      const { data, info } = await sharp(rawBuf).raw().toBuffer({ resolveWithObject: true })
      meanLab = meanLabFromRgba(data, info.channels)
    } catch (e) {
      console.warn('[embeddingService] Lab fallback failed:', e.message)
    }
    // Also fall back the embedding source to the raw image so CLIP sees something.
    torsoBuf = await sharp(rawBuf)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toBuffer()
  }

  // (4) Resize torso to a canvas large enough for N_TILES overlapping 224×224 tiles.
  const baseDim = Math.max(CROP_SIZE + 112, 336)
  const canvas = await sharp(torsoBuf)
    .resize(baseDim, baseDim, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer()

  const offset = baseDim - CROP_SIZE
  const crops = [
    { left: Math.floor(offset / 2), top: Math.floor(offset / 2) },
    { left: 0,      top: 0 },
    { left: offset, top: 0 },
    { left: 0,      top: offset },
    { left: offset, top: offset }
  ]

  // (5) Embed each tile and L2-normalize.
  const { processor, model } = await getModel()
  const xf = await getTransformers()
  const { RawImage } = xf

  const tiles = []
  for (const c of crops) {
    const tileBuf = await sharp(canvas)
      .extract({ left: c.left, top: c.top, width: CROP_SIZE, height: CROP_SIZE })
      .png()
      .toBuffer()
    const blob = new Blob([tileBuf], { type: 'image/png' })
    const img = await RawImage.fromBlob(blob)
    const inputs = await processor(img)
    const out = await model(inputs)
    const data = out.image_embeds.data
    const v = new Array(data.length)
    let sumSq = 0
    for (let i = 0; i < data.length; i++) { v[i] = data[i]; sumSq += data[i] * data[i] }
    const norm = Math.sqrt(sumSq) || 1
    for (let i = 0; i < v.length; i++) v[i] /= norm
    tiles.push(v)
  }

  return { tiles, meanLab }
}

/** Flatten N_TILES × D tile vectors to a single Float[] of length N_TILES*D. */
function flattenTiles (tiles) {
  const out = []
  for (const t of tiles) for (const x of t) out.push(x)
  return out
}

/** Reverse of flattenTiles. Returns an array of N tile-vectors of length D each. */
function unflattenTiles (flat, dim = EMBED_DIM) {
  const n = Math.floor(flat.length / dim)
  const out = []
  for (let i = 0; i < n; i++) out.push(flat.slice(i * dim, (i + 1) * dim))
  return out
}

/**
 * Max pairwise cosine similarity between two sets of L2-normalised vectors.
 * Robust to localised image corruption (watermarks, folds, occlusions):
 * one clean tile pair gives a high score even if other tiles diverge.
 */
function maxPairwiseCosine (tilesA, tilesB) {
  let best = -1
  for (const a of tilesA) {
    for (const b of tilesB) {
      const s = cosineSim(a, b)
      if (s > best) best = s
    }
  }
  return best < 0 ? 0 : best
}

/** Cosine similarity for L2-normalised vectors. */
function cosineSim (a, b) {
  if (!a || !b) return 0
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

module.exports = {
  embedImage, cosineSim, labDeltaE,
  flattenTiles, unflattenTiles, maxPairwiseCosine,
  getModel,
  EMBED_DIM, MODEL_ID, N_TILES
}
