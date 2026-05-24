/**
 * productCreationService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for "fully add a product to inventory" — used by:
 *   1. WhatsApp / Web Chat agent OOS-add flow (`agentService.js`)
 *   2. Quick-Add Product page on the dashboard (`POST /api/product/quick-add`)
 *
 * Performs the complete chain in one call:
 *   - Product (create or restock)
 *   - PurchaseInvoice + PurchaseItem (so cost/profit tracking stays correct)
 *   - ProductLog (audit trail)
 *   - ProductImage (primary, if a photo is supplied)
 *   - ProductEmbedding (per-tile CLIP-Large + Lab so the agent can find it visually)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const db = require('../lib/db')
const twilioService = require('./twilioService')
const embeddingService = require('./embeddingService')

/**
 * @param {object} opts
 * @param {string} opts.tenantId
 * @param {object} opts.sessionData - must contain productCostPrice, productSellingPrice;
 *                                    optional: identifiedDress, newProductName, productId
 *                                    (null = create new; set = restock), originalImageBase64
 *                                    OR originalMediaId, originalMediaType, isStitched, stock, price
 * @param {number} opts.quantity
 * @returns {Promise<{productId, productName, invoiceNumber, action}>}
 */
async function addProductToInventory ({ tenantId, sessionData, quantity }) {
  const { generateInvoiceNumber } = require('../utils/invoiceNumberGenerator')
  const costPrice    = sessionData.productCostPrice
  const sellingPrice = sessionData.productSellingPrice
  const isRestock    = !!sessionData.productId

  let productId, productName, action

  if (isRestock) {
    // Existing product ran out — increment stock
    const updated = await db.product.update({
      where: { id: sessionData.productId },
      data: {
        currentQuantity:    { increment: quantity },
        lastPurchasePrice:  costPrice,
        currentRetailPrice: sellingPrice,
      }
    })
    productId   = updated.id
    productName = updated.name
    action      = 'Product Restocked'
  } else {
    // No matching product — create a new one
    const dressName = (sessionData.newProductName || sessionData.identifiedDress || 'Dress').substring(0, 120)
    const created = await db.product.create({
      data: {
        name:               dressName,
        description:        sessionData.identifiedDress || null,
        currentRetailPrice: sellingPrice,
        lastPurchasePrice:  costPrice,
        currentQuantity:    quantity,
        minStockLevel:      0,
        isActive:           true,
        isStitched:         !!sessionData.isStitched,
        hasVariants:        false,
        tenantId,
      }
    })
    productId   = created.id
    productName = created.name
    action      = 'Product Added'
  }

  // Purchase invoice (keeps purchase/profit tracking intact)
  const invoiceNumber = await generateInvoiceNumber(tenantId)
  const supplierName  = sessionData.supplierName || 'Quick Add'
  await db.purchaseInvoice.create({
    data: {
      invoiceNumber,
      invoiceDate:  new Date(),
      totalAmount:  costPrice * quantity,
      supplierName,
      notes:        `${action}${sessionData.identifiedDress ? ` — ${sessionData.identifiedDress}` : ''}`,
      tenantId,
      purchaseItems: {
        create: [{
          name:          productName,
          purchasePrice: costPrice,
          quantity,
          tenantId,
          productId,
        }]
      }
    }
  })

  // Product log (audit trail)
  const oldQty = isRestock ? (sessionData.stock || 0) : 0
  await db.productLog.create({
    data: {
      action:      isRestock ? 'INCREASE' : 'CREATE',
      quantity,
      oldQuantity: oldQty,
      newQuantity: oldQty + quantity,
      oldPrice:    isRestock ? (sessionData.price || 0) : 0,
      newPrice:    sellingPrice,
      reason:      `${action}`,
      reference:   `Invoice: ${invoiceNumber}`,
      tenantId,
      productId,
    }
  })

  // Save the primary image + CLIP embeddings (visual matching).
  // Source priority:
  //   1. originalImageBase64 (web chat / quick-add — already in hand)
  //   2. originalMediaId via Meta downloadMedia (WhatsApp path)
  const hasImageSource = sessionData.originalImageBase64 || sessionData.originalMediaId
  if (hasImageSource) {
    try {
      let imgBase64
      let imgMimeType = sessionData.originalMediaType || 'image/jpeg'

      if (sessionData.originalImageBase64) {
        imgBase64 = sessionData.originalImageBase64
      } else {
        const dl = await twilioService.downloadMedia(
          sessionData.originalMediaId,
          sessionData.originalMediaType || 'image/jpeg'
        )
        imgBase64 = dl.base64
        imgMimeType = dl.mimeType || imgMimeType
      }

      const imageBuffer = Buffer.from(imgBase64, 'base64')
      // Remove any existing primary image first (restock case)
      if (isRestock) {
        await db.productImage.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false }
        })
      }
      await db.productImage.create({
        data: {
          productId,
          mediaData: imageBuffer,
          mediaType: imgMimeType,
          isPrimary: true,
          sortOrder: 0
        }
      })
      console.log(`[productCreationService] ✅ Product image saved for "${productName}"`)

      // Per-tile CLIP + Lab → ProductEmbedding (drives the agent's visual search).
      try {
        const { tiles, meanLab } = await embeddingService.embedImage({
          base64: imgBase64, mimeType: imgMimeType
        })
        const tileEmbeddings = embeddingService.flattenTiles(tiles)
        await db.productEmbedding.upsert({
          where:  { productId },
          create: { productId, tileEmbeddings, embedding: [], meanLab, model: embeddingService.MODEL_ID },
          update: { tileEmbeddings, embedding: [], meanLab, model: embeddingService.MODEL_ID, updatedAt: new Date() }
        })
        console.log(`[productCreationService] ✅ Embedding+Lab stored for "${productName}" (${tiles.length} tiles, Lab=[${meanLab.map(x=>x.toFixed(1)).join(',')}])`)
      } catch (embErr) {
        console.warn(`[productCreationService] ⚠️ Embedding failed (visual matching less accurate):`, embErr.message)
      }
    } catch (imgErr) {
      console.warn(`[productCreationService] ⚠️ Could not save product image:`, imgErr.message)
      // Non-fatal — product was created successfully regardless
    }
  }

  return { productId, productName, invoiceNumber, action }
}

module.exports = { addProductToInventory }
