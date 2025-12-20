const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkShippingConfig() {
  try {
    console.log('🔍 Checking Shipping Configuration in Database...\n');

    // Get all tenants
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        businessName: true,
        shippingCityCharges: true,
        shippingQuantityRules: true
      }
    });

    for (const tenant of tenants) {
      console.log(`\n📦 Tenant: ${tenant.businessName} (ID: ${tenant.id})`);
      console.log('─'.repeat(60));

      // Check city charges
      if (tenant.shippingCityCharges) {
        try {
          const cityCharges = JSON.parse(tenant.shippingCityCharges);
          console.log('\n🏙️  City Charges:');
          if (cityCharges.cityCharges) {
            console.log('   Format: { cityCharges: {...}, defaultCityCharge: ... }');
            console.log('   Default City Charge:', cityCharges.defaultCityCharge || 'Not set');
            console.log('   City-Specific Charges:');
            Object.entries(cityCharges.cityCharges || {}).forEach(([city, charge]) => {
              if (city !== 'default') {
                console.log(`      ${city}: Rs. ${charge}`);
              }
            });
          } else {
            console.log('   Format: { CityName: charge, ... }');
            Object.entries(cityCharges).forEach(([city, charge]) => {
              if (city !== 'default') {
                console.log(`      ${city}: Rs. ${charge}`);
              } else {
                console.log(`      default: Rs. ${charge}`);
              }
            });
          }
        } catch (e) {
          console.log('   ❌ Error parsing city charges:', e.message);
          console.log('   Raw data:', tenant.shippingCityCharges);
        }
      } else {
        console.log('\n🏙️  City Charges: Not configured');
      }

      // Check quantity rules
      if (tenant.shippingQuantityRules) {
        try {
          const quantityRules = JSON.parse(tenant.shippingQuantityRules);
          console.log('\n📊 Quantity Rules:');
          if (Array.isArray(quantityRules)) {
            console.log('   Format: Array of rules');
            quantityRules.forEach((rule, index) => {
              console.log(`   Rule ${index + 1}: ${rule.min || 1}-${rule.max === null || rule.max === undefined ? '∞' : rule.max} items = Rs. ${rule.charge}`);
            });
          } else if (quantityRules.quantityRules) {
            console.log('   Format: { quantityRules: [...], defaultQuantityCharge: ... }');
            console.log('   Default Quantity Charge:', quantityRules.defaultQuantityCharge || 'Not set');
            console.log('   Rules:');
            quantityRules.quantityRules.forEach((rule, index) => {
              console.log(`      Rule ${index + 1}: ${rule.min || 1}-${rule.max === null || rule.max === undefined ? '∞' : rule.max} items = Rs. ${rule.charge}`);
            });
          } else {
            console.log('   Unknown format:', quantityRules);
          }
        } catch (e) {
          console.log('   ❌ Error parsing quantity rules:', e.message);
          console.log('   Raw data:', tenant.shippingQuantityRules);
        }
      } else {
        console.log('\n📊 Quantity Rules: Not configured');
      }

      // Check products with custom shipping
      const productsWithCustomShipping = await prisma.product.findMany({
        where: {
          tenantId: tenant.id,
          useDefaultShipping: false
        },
        select: {
          id: true,
          name: true,
          shippingQuantityRules: true,
          useDefaultShipping: true
        }
      });

      if (productsWithCustomShipping.length > 0) {
        console.log('\n🛍️  Products with Custom Shipping:');
        for (const product of productsWithCustomShipping) {
          console.log(`\n   Product: ${product.name} (ID: ${product.id})`);
          if (product.shippingQuantityRules) {
            try {
              const rules = JSON.parse(product.shippingQuantityRules);
              if (Array.isArray(rules) && rules.length > 0) {
                rules.forEach((rule, index) => {
                  console.log(`      Rule ${index + 1}: ${rule.min || 1}-${rule.max === null || rule.max === undefined ? '∞' : rule.max} items = Rs. ${rule.charge}`);
                });
              } else {
                console.log('      ⚠️  Empty rules array');
              }
            } catch (e) {
              console.log('      ❌ Error parsing rules:', e.message);
              console.log('      Raw data:', product.shippingQuantityRules);
            }
          } else {
            console.log('      ⚠️  No rules configured (empty)');
          }
        }
      } else {
        console.log('\n🛍️  Products with Custom Shipping: None');
      }

      // Check "Kameez Shalwar" specifically
      const kameezShalwar = await prisma.product.findFirst({
        where: {
          tenantId: tenant.id,
          name: {
            contains: 'Kameez',
            mode: 'insensitive'
          }
        },
        select: {
          id: true,
          name: true,
          shippingQuantityRules: true,
          useDefaultShipping: true
        }
      });

      if (kameezShalwar) {
        console.log('\n🎯 Kameez Shalwar Product:');
        console.log(`   ID: ${kameezShalwar.id}`);
        console.log(`   Name: ${kameezShalwar.name}`);
        console.log(`   Use Default Shipping: ${kameezShalwar.useDefaultShipping}`);
        if (kameezShalwar.shippingQuantityRules) {
          try {
            const rules = JSON.parse(kameezShalwar.shippingQuantityRules);
            if (Array.isArray(rules) && rules.length > 0) {
              console.log('   Custom Rules:');
              rules.forEach((rule, index) => {
                console.log(`      Rule ${index + 1}: ${rule.min || 1}-${rule.max === null || rule.max === undefined ? '∞' : rule.max} items = Rs. ${rule.charge}`);
              });
            } else {
              console.log('   ⚠️  Empty rules array');
            }
          } catch (e) {
            console.log('   ❌ Error parsing rules:', e.message);
            console.log('   Raw data:', kameezShalwar.shippingQuantityRules);
          }
        } else {
          console.log('   ⚠️  No shippingQuantityRules field (null)');
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Database check complete');
  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkShippingConfig();

