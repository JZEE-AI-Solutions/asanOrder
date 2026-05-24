/**
 * One-off cleanup: delete all products + related rows for a tenant.
 * Usage:  node scripts/delete-tenant-products.js <businessCode>
 */
const db = require('../lib/db')

;(async () => {
  const businessCode = process.argv[2]
  if (!businessCode) {
    console.error('Usage: node scripts/delete-tenant-products.js <businessCode>')
    process.exit(1)
  }
  const tenant = await db.tenant.findUnique({
    where: { businessCode },
    select: { id: true, businessName: true }
  })
  if (!tenant) {
    console.error(`No tenant with businessCode=${businessCode}`)
    process.exit(1)
  }
  console.log(`Tenant: ${tenant.businessName} (${tenant.id})`)

  const products = await db.product.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true }
  })
  if (products.length === 0) {
    console.log('No products to delete.')
    process.exit(0)
  }
  console.log(`Will delete ${products.length} product(s):`)
  products.forEach(p => console.log('  -', p.name, '  id=' + p.id))
  const pids = products.map(p => p.id)

  // Best-effort cascade cleanup (some tables may not have FK, others have onDelete: Cascade)
  await db.$transaction([
    db.productImage.deleteMany({ where: { productId: { in: pids } } }),
    db.productLog.deleteMany({ where: { productId: { in: pids } } }),
    db.purchaseItem.deleteMany({ where: { productId: { in: pids } } }),
    db.product.deleteMany({ where: { id: { in: pids } } })
  ])
  console.log(`✅ Deleted ${pids.length} products + related rows.`)
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
