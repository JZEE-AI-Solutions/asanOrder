const prisma = require('../lib/db');
const accountingService = require('../services/accountingService');

async function fixMissingAccounts() {
  try {
    console.log('🔍 Checking all tenants for missing accounts...\n');
    
    const tenants = await prisma.tenant.findMany({
      select: { id: true, businessName: true }
    });

    let fixedCount = 0;

    for (const tenant of tenants) {
      const accounts = await prisma.account.findMany({
        where: { tenantId: tenant.id },
        select: { code: true, name: true }
      });

      const hasCash = accounts.some(a => a.code === '1000');
      const hasBank = accounts.some(a => a.code === '1100');
      const hasAR = accounts.some(a => a.code === '1200');
      const hasAP = accounts.some(a => a.code === '2000');
      const hasInventory = accounts.some(a => a.code === '1300');
      const hasSalesRevenue = accounts.some(a => a.code === '4000');

      const missingAccounts = [];
      if (!hasCash) missingAccounts.push('Cash (1000)');
      if (!hasBank) missingAccounts.push('Bank Account (1100)');
      if (!hasAR) missingAccounts.push('Accounts Receivable (1200)');
      if (!hasAP) missingAccounts.push('Accounts Payable (2000)');
      if (!hasInventory) missingAccounts.push('Inventory (1300)');
      if (!hasSalesRevenue) missingAccounts.push('Sales Revenue (4000)');

      if (missingAccounts.length > 0) {
        console.log(`⚠️  Tenant: ${tenant.businessName} (${tenant.id})`);
        console.log(`   Missing accounts: ${missingAccounts.join(', ')}`);
        console.log(`   Total accounts: ${accounts.length}`);
        
        await accountingService.initializeChartOfAccounts(tenant.id);
        console.log(`   ✅ Re-initialized chart of accounts\n`);
        fixedCount++;
      } else {
        console.log(`✅ Tenant: ${tenant.businessName} - All accounts present (${accounts.length} accounts)\n`);
      }
    }

    console.log(`\n✅ Check complete! Fixed ${fixedCount} tenant(s).`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixMissingAccounts();

