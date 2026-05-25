/**
 * One-off migration: for every existing Form, ensure it has both
 *   - "Customer Phone"  (renamed from "Phone Number" if present)
 *   - "Shipping Phone"  (inserted if missing)
 *
 * Usage:
 *   node scripts/add-shipping-phone-field.js [businessCode?]
 *
 * Idempotent — safe to re-run.
 */
const prisma = require('../lib/db')

;(async () => {
  const businessCode = process.argv[2]
  const tenantFilter = businessCode
    ? { businessCode }
    : undefined

  const tenants = tenantFilter
    ? await prisma.tenant.findMany({ where: tenantFilter, select: { id: true, businessName: true } })
    : await prisma.tenant.findMany({ select: { id: true, businessName: true } })

  if (tenants.length === 0) {
    console.error('No tenants matched')
    process.exit(1)
  }

  for (const t of tenants) {
    console.log(`\n── Tenant: ${t.businessName} (${t.id})`)
    const forms = await prisma.form.findMany({
      where: { tenantId: t.id },
      include: { fields: true }
    })

    for (const form of forms) {
      console.log(`  Form: "${form.name}" — ${form.fields.length} fields`)
      const byLabel = {}
      form.fields.forEach(f => { byLabel[f.label.toLowerCase()] = f })

      // 1. Rename "Phone Number" → "Customer Phone" if no Customer Phone yet
      const hasCustomerPhone = !!byLabel['customer phone']
      const legacyPhone = byLabel['phone number']
      if (!hasCustomerPhone && legacyPhone) {
        await prisma.formField.update({
          where: { id: legacyPhone.id },
          data: { label: 'Customer Phone' }
        })
        console.log('    ✓ Renamed "Phone Number" → "Customer Phone"')
      } else if (hasCustomerPhone) {
        console.log('    · "Customer Phone" already present')
      } else {
        // no phone at all — insert Customer Phone
        const maxOrder = Math.max(0, ...form.fields.map(f => f.order || 0))
        await prisma.formField.create({
          data: {
            label: 'Customer Phone',
            fieldType: 'PHONE',
            isRequired: true,
            placeholder: 'e.g. 03001234567',
            order: 1,
            formId: form.id
          }
        })
        console.log('    ✓ Inserted "Customer Phone" (no existing phone field)')
      }

      // 2. Insert Shipping Phone if not present
      const hasShippingPhone = !!byLabel['shipping phone']
      if (!hasShippingPhone) {
        // Place it right after the customer/legacy phone if possible
        const after = byLabel['customer phone'] || byLabel['phone number']
        const afterOrder = after ? (after.order || 1) : 1
        // Shift subsequent fields by 1 so Shipping Phone fits at afterOrder+1
        const toShift = await prisma.formField.findMany({
          where: { formId: form.id, order: { gt: afterOrder } }
        })
        for (const fld of toShift) {
          await prisma.formField.update({
            where: { id: fld.id },
            data: { order: (fld.order || 0) + 1 }
          })
        }
        await prisma.formField.create({
          data: {
            label: 'Shipping Phone',
            fieldType: 'PHONE',
            isRequired: true,
            placeholder: 'Courier contact (same as customer if no other)',
            order: afterOrder + 1,
            formId: form.id
          }
        })
        console.log('    ✓ Inserted "Shipping Phone"')
      } else {
        console.log('    · "Shipping Phone" already present')
      }
    }
  }

  console.log('\nDone.')
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
