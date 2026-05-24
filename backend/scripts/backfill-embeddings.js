/**
 * One-off: for every product that has a primary ProductImage but no
 * ProductEmbedding row, compute the CLIP embedding and store it.
 *
 * Usage: node scripts/backfill-embeddings.js [tenantBusinessCode?]
 *
 * Examples:
 *   node scripts/backfill-embeddings.js          # all tenants
 *   node scripts/backfill-embeddings.js 1001     # only Elegant Dress Orders
 */
const db = require('../lib/db')
const embeddingService = require('../services/embeddingService')

;(async () => {
  const businessCode = process.argv[2]
  let tenantFilter = {}
  if (businessCode) {
    const t = await db.tenant.findUnique({
      where: { businessCode },
      select: { id: true, businessName: true }
    })
    if (!t) {
      console.error(`No tenant with businessCode=${businessCode}`)
      process.exit(1)
    }
    console.log(`Restricting to tenant: ${t.businessName} (${t.id})`)
    tenantFilter = { tenantId: t.id }
  }

  const need = await db.product.findMany({
    where: {
      ...tenantFilter,
      isActive: true,
      productImages: { some: { isPrimary: true } }
    },
    include: {
      productImages: {
        where: { isPrimary: true }, take: 1,
        select: { mediaData: true, mediaType: true }
      }
    }
  })

  if (need.length === 0) {
    console.log('No products need backfilling.')
    process.exit(0)
  }

  console.log(`Backfilling ${need.length} product(s)…`)
  let ok = 0, fail = 0
  for (const p of need) {
    const img = p.productImages[0]
    try {
      const base64 = Buffer.from(img.mediaData).toString('base64')
      const { tiles, meanLab } = await embeddingService.embedImage({ base64, mimeType: img.mediaType })
      const tileEmbeddings = embeddingService.flattenTiles(tiles)
      await db.productEmbedding.upsert({
        where:  { productId: p.id },
        create: { productId: p.id, tileEmbeddings, embedding: [], meanLab, model: embeddingService.MODEL_ID },
        update: { tileEmbeddings, embedding: [], meanLab, model: embeddingService.MODEL_ID, updatedAt: new Date() }
      })
      console.log(`  ✓ ${p.name}  ${tiles.length}-tiles  Lab=[${meanLab.map(x=>x.toFixed(1)).join(',')}]`)
      ok++
    } catch (e) {
      console.warn(`  ✗ ${p.name}: ${e.message}`)
      fail++
    }
  }
  console.log(`Done: ${ok} succeeded, ${fail} failed.`)
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
