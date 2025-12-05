require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Import data from JSON files to PostgreSQL
async function importData() {
  console.log('🔄 Importing data to PostgreSQL...\n');
  
  const prisma = new PrismaClient();
  const exportDir = path.join(__dirname, '..', 'data-export');

  if (!fs.existsSync(exportDir)) {
    console.error('❌ Export directory not found. Run export-sqlserver-data.js first.');
    process.exit(1);
  }

  try {
    // Import in order of dependencies
    const imports = [
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

    for (const { name, model } of imports) {
      const filePath = path.join(exportDir, `${name}.json`);
      
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Skipping ${name} - file not found`);
        continue;
      }

      console.log(`📦 Importing ${name}...`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (data.length === 0) {
        console.log(`⚠️  No data to import for ${name}`);
        continue;
      }

      // Use createMany for better performance
      // Note: createMany doesn't work with relations, so we'll use individual creates
      let imported = 0;
      for (const record of data) {
        try {
          await model.create({ data: record });
          imported++;
        } catch (error) {
          // Skip duplicates or handle errors
          if (error.code === 'P2002') {
            console.log(`⚠️  Skipping duplicate ${name} record: ${record.id}`);
          } else {
            console.error(`❌ Error importing ${name} record:`, error.message);
          }
        }
      }
      
      console.log(`✅ Imported ${imported}/${data.length} ${name} records`);
    }

    console.log('\n✅ Data import completed successfully!');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

importData();

