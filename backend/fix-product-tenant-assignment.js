const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function fixProductTenantAssignment() {
  try {
    console.log('🔧 Fixing Product Tenant Assignment...\n')

    // 1. Get all tenants
    const tenants = await prisma.tenant.findMany()
    console.log('Available tenants:')
    tenants.forEach((tenant, index) => {
      console.log(`  ${index + 1}. ${tenant.businessName} (${tenant.id})`)
    })

    // 2. Get all products and their purchase items
    const products = await prisma.product.findMany({
      include: {
        purchaseItems: {
          include: {
            purchaseInvoice: {
              select: {
                tenantId: true,
                invoiceNumber: true
              }
            }
          }
        }
      }
    })

    console.log(`\nFound ${products.length} products`)

    // 3. Fix products that have purchase items from different tenants
    let fixedCount = 0
    for (const product of products) {
      if (product.purchaseItems.length > 0) {
        // Get the most common tenant from purchase items
        const tenantCounts = {}
        product.purchaseItems.forEach(item => {
          const tenantId = item.purchaseInvoice.tenantId
          tenantCounts[tenantId] = (tenantCounts[tenantId] || 0) + 1
        })

        const mostCommonTenant = Object.keys(tenantCounts).reduce((a, b) => 
          tenantCounts[a] > tenantCounts[b] ? a : b
        )

        if (product.tenantId !== mostCommonTenant) {
          console.log(`Fixing product "${product.name}":`)
          console.log(`  Current tenant: ${product.tenantId}`)
          console.log(`  Should be tenant: ${mostCommonTenant}`)
          
          await prisma.product.update({
            where: { id: product.id },
            data: { tenantId: mostCommonTenant }
          })
          
          fixedCount++
        }
      }
    }

    console.log(`\n✅ Fixed ${fixedCount} products`)

    // 4. Update purchase items to link to products
    console.log('\n🔗 Linking purchase items to products...')
    const purchaseItems = await prisma.purchaseItem.findMany({
      where: { productId: null },
      include: {
        purchaseInvoice: {
          select: { tenantId: true }
        }
      }
    })

    let linkedCount = 0
    for (const item of purchaseItems) {
      // Find product by name and tenant
      const product = await prisma.product.findFirst({
        where: {
          name: { contains: item.name },
          tenantId: item.purchaseInvoice.tenantId
        }
      })

      if (product) {
        await prisma.purchaseItem.update({
          where: { id: item.id },
          data: { productId: product.id }
        })
        linkedCount++
        console.log(`  Linked "${item.name}" to product "${product.name}"`)
      }
    }

    console.log(`\n✅ Linked ${linkedCount} purchase items to products`)

    // 5. Final verification
    console.log('\n📊 Final verification:')
    for (const tenant of tenants) {
      const productCount = await prisma.product.count({
        where: { tenantId: tenant.id }
      })
      const purchaseItemCount = await prisma.purchaseItem.count({
        where: {
          purchaseInvoice: {
            tenantId: tenant.id
          }
        }
      })
      const linkedItemCount = await prisma.purchaseItem.count({
        where: {
          purchaseInvoice: {
            tenantId: tenant.id
          },
          productId: { not: null }
        }
      })
      
      console.log(`  ${tenant.businessName}:`)
      console.log(`    Products: ${productCount}`)
      console.log(`    Purchase Items: ${purchaseItemCount}`)
      console.log(`    Linked Items: ${linkedItemCount}`)
    }

  } catch (error) {
    console.error('❌ Error fixing product tenant assignment:', error)
  } finally {
    await prisma.$disconnect()
  }
}

fixProductTenantAssignment()
