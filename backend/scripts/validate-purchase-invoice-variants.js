/**
 * Validate purchase invoice 1004-FEB-26-007: check if two variant lines were saved
 * with correct productId and productVariantId (colour) per line.
 * Run: node scripts/validate-purchase-invoice-variants.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const prisma = require('../lib/db')

const INVOICE_NUMBER = '1004-FEB-26-007'
const EXPECTED_PRODUCT_NAME = 'prodcut seven'

async function main() {
  console.log('Querying purchase invoice:', INVOICE_NUMBER)
  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { invoiceNumber: INVOICE_NUMBER },
    include: {
      purchaseItems: {
        where: { isDeleted: false },
        orderBy: { id: 'asc' },
        include: {
          productVariant: { select: { id: true, color: true, size: true } },
          product: { select: { id: true, name: true } }
        }
      }
    }
  })

  if (!invoice) {
    console.log('Invoice not found:', INVOICE_NUMBER)
    process.exit(1)
  }

  console.log('Invoice id:', invoice.id)
  console.log('Purchase items count:', invoice.purchaseItems.length)
  console.log('')

  let ok = true
  invoice.purchaseItems.forEach((item, i) => {
    const variantColor = item.productVariant?.color ?? '(none)'
    const variantSize = item.productVariant?.size ?? '(none)'
    const hasProductId = !!item.productId
    const hasVariantId = !!item.productVariantId
    console.log(`Item ${i + 1}:`)
    console.log('  name:', item.name)
    console.log('  quantity:', item.quantity)
    console.log('  productId:', item.productId || 'NULL')
    console.log('  productVariantId:', item.productVariantId || 'NULL')
    console.log('  variant color:', variantColor)
    console.log('  variant size:', variantSize)
    if (!hasProductId || !hasVariantId || variantColor === '(none)') {
      ok = false
      console.log('  >>> ISSUE: missing productId, productVariantId, or variant color')
    }
    console.log('')
  })

  if (invoice.purchaseItems.length < 2) {
    ok = false
    console.log('ISSUE: Expected at least 2 purchase items (two colours), got', invoice.purchaseItems.length)
  }

  console.log(ok ? 'Validation: PASS (all lines have productId + variant with color)' : 'Validation: FAIL (see issues above)')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
