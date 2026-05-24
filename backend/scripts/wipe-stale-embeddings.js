/**
 * Wipe all ProductEmbedding rows for a tenant (or all tenants) so the
 * backfill script regenerates them with the current pipeline.
 *
 * Usage: node scripts/wipe-stale-embeddings.js [tenantBusinessCode?]
 */
const db = require('../lib/db')

;(async () => {
  const businessCode = process.argv[2]
  if (businessCode) {
    const t = await db.tenant.findUnique({
      where: { businessCode }, select: { id: true, businessName: true }
    })
    if (!t) { console.error('Tenant not found'); process.exit(1) }
    const r = await db.productEmbedding.deleteMany({
      where: { product: { tenantId: t.id } }
    })
    console.log(`Deleted ${r.count} embedding rows for tenant ${t.businessName} (${t.id}).`)
  } else {
    const r = await db.productEmbedding.deleteMany({})
    console.log(`Deleted ${r.count} embedding rows across all tenants.`)
  }
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
