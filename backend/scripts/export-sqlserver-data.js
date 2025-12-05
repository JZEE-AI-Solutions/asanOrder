require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../lib/db');

// Export all data from SQL Server to JSON files
async function exportData() {
  console.log('🔄 Exporting data from SQL Server...\n');
  
  const exportDir = path.join(__dirname, '..', 'data-export');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  try {
    // Export in order of dependencies
    const exports = [
      { name: 'users', model: prisma.user },
      { name: 'tenants', model: prisma.tenant },
      { name: 'forms', model: prisma.form },
      { name: 'form_fields', model: prisma.formField },
      { name: 'products', model: prisma.product },
      { name: 'purchase_invoices', model: prisma.purchaseInvoice },
      { name: 'purchase_items', model: prisma.purchaseItem },
      { name: 'product_logs', model: prisma.productLog },
      { name: 'customers', model: prisma.customer },
      { name: 'customer_logs', model: prisma.customerLog },
      { name: 'orders', model: prisma.order },
      { name: 'returns', model: prisma.return },
      { name: 'return_items', model: prisma.returnItem },
    ];

    for (const { name, model } of exports) {
      console.log(`📦 Exporting ${name}...`);
      const data = await model.findMany();
      const filePath = path.join(exportDir, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ Exported ${data.length} ${name} records`);
    }

    console.log('\n✅ Data export completed successfully!');
    console.log(`📁 Export directory: ${exportDir}`);
    
  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

exportData();

