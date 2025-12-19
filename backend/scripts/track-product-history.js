const prisma = require('../lib/db');

async function trackProductHistory(productName) {
  try {
    console.log(`🔍 Tracking complete history for: ${productName}\n`);
    
    // Find the product
    const product = await prisma.product.findFirst({
      where: {
        name: {
          equals: productName,
          mode: 'insensitive'
        }
      }
    });

    if (!product) {
      console.log(`❌ Product "${productName}" not found in database.`);
      await prisma.$disconnect();
      return;
    }

    console.log(`📦 Product Found: ${product.name}`);
    console.log(`   ID: ${product.id}`);
    console.log(`   Current Quantity: ${product.currentQuantity}`);
    console.log(`   Last Purchase Price: Rs. ${product.lastPurchasePrice || 'N/A'}`);
    console.log(`   Current Retail Price: Rs. ${product.currentRetailPrice || 'N/A'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Get all purchase items for this product
    const purchaseItems = await prisma.purchaseItem.findMany({
      where: {
        productId: product.id,
        isDeleted: false
      },
      include: {
        purchaseInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Get all orders that contain this product
    const orders = await prisma.order.findMany({
      where: {
        tenantId: product.tenantId,
        status: { in: ['CONFIRMED', 'DISPATCHED', 'COMPLETED'] },
        selectedProducts: {
          contains: product.id
        }
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        selectedProducts: true,
        productQuantities: true,
        productPrices: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Get all product logs
    const productLogs = await prisma.productLog.findMany({
      where: {
        productId: product.id
      },
      include: {
        purchaseItem: {
          select: {
            id: true,
            name: true,
            purchaseInvoice: {
              select: {
                invoiceNumber: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Combine all events into a timeline
    const timeline = [];

    // Add purchase events
    purchaseItems.forEach(item => {
      timeline.push({
        type: 'PURCHASE',
        date: item.createdAt,
        invoiceNumber: item.purchaseInvoice.invoiceNumber,
        invoiceDate: item.purchaseInvoice.invoiceDate,
        quantity: item.quantity,
        purchasePrice: item.purchasePrice,
        totalCost: item.quantity * item.purchasePrice,
        purchaseItemId: item.id,
        invoiceId: item.purchaseInvoice.id
      });
    });

    // Add order/sale events
    orders.forEach(order => {
      try {
        const selectedProducts = typeof order.selectedProducts === 'string' 
          ? JSON.parse(order.selectedProducts) 
          : order.selectedProducts;
        const productQuantities = typeof order.productQuantities === 'string'
          ? JSON.parse(order.productQuantities)
          : order.productQuantities;
        const productPrices = typeof order.productPrices === 'string'
          ? JSON.parse(order.productPrices)
          : order.productPrices;

        const productInOrder = selectedProducts.find(p => (p.id || p) === product.id);
        if (productInOrder) {
          const quantity = productQuantities[product.id] || productInOrder.quantity || 1;
          const price = productPrices[product.id] || productInOrder.price || 0;
          
          timeline.push({
            type: 'SALE',
            date: order.createdAt,
            orderNumber: order.orderNumber,
            status: order.status,
            quantity: quantity,
            salePrice: price,
            totalRevenue: quantity * price,
            orderId: order.id
          });
        }
      } catch (e) {
        console.error(`Error parsing order ${order.orderNumber}:`, e.message);
      }
    });

    // Add log events (for inventory adjustments, edits, etc.)
    productLogs.forEach(log => {
      timeline.push({
        type: 'LOG',
        date: log.createdAt,
        action: log.action,
        quantity: log.quantity,
        oldQuantity: log.oldQuantity,
        newQuantity: log.newQuantity,
        reason: log.reason,
        reference: log.reference,
        notes: log.notes,
        purchaseItem: log.purchaseItem ? {
          invoiceNumber: log.purchaseItem.purchaseInvoice?.invoiceNumber
        } : null
      });
    });

    // Sort timeline by date
    timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Display timeline
    console.log('📅 COMPLETE HISTORY TIMELINE:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    let runningQuantity = 0;
    let purchaseCount = 0;
    let saleCount = 0;

    timeline.forEach((event, index) => {
      const date = new Date(event.date);
      const dateStr = date.toLocaleString();
      
      if (event.type === 'PURCHASE') {
        purchaseCount++;
        runningQuantity += event.quantity;
        console.log(`${index + 1}. 📥 PURCHASE - ${dateStr}`);
        console.log(`   Invoice: ${event.invoiceNumber}`);
        console.log(`   Invoice Date: ${new Date(event.invoiceDate).toLocaleDateString()}`);
        console.log(`   Quantity: +${event.quantity} units`);
        console.log(`   Purchase Price: Rs. ${event.purchasePrice.toFixed(2)} per unit`);
        console.log(`   Total Cost: Rs. ${event.totalCost.toFixed(2)}`);
        console.log(`   Stock After: ${runningQuantity} units`);
        console.log('');
      } else if (event.type === 'SALE') {
        saleCount++;
        runningQuantity = Math.max(0, runningQuantity - event.quantity);
        console.log(`${index + 1}. 📤 SALE - ${dateStr}`);
        console.log(`   Order: ${event.orderNumber}`);
        console.log(`   Status: ${event.status}`);
        console.log(`   Quantity: -${event.quantity} units`);
        console.log(`   Sale Price: Rs. ${event.salePrice.toFixed(2)} per unit`);
        console.log(`   Total Revenue: Rs. ${event.totalRevenue.toFixed(2)}`);
        console.log(`   Stock After: ${runningQuantity} units`);
        console.log('');
      } else if (event.type === 'LOG') {
        // Only show significant logs (not every single one to avoid clutter)
        if (['INCREASE', 'DECREASE', 'CREATE'].includes(event.action) || 
            event.reason?.includes('edit') || 
            event.reason?.includes('update')) {
          console.log(`${index + 1}. 📝 ${event.action} - ${dateStr}`);
          console.log(`   Reason: ${event.reason || 'N/A'}`);
          if (event.oldQuantity !== null && event.newQuantity !== null) {
            console.log(`   Quantity: ${event.oldQuantity} → ${event.newQuantity} (${event.quantity > 0 ? '+' : ''}${event.quantity})`);
          }
          if (event.reference) {
            console.log(`   Reference: ${event.reference}`);
          }
          if (event.notes) {
            console.log(`   Notes: ${event.notes}`);
          }
          console.log('');
        }
      }
    });

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY:');
    console.log(`   Total Purchases: ${purchaseCount}`);
    console.log(`   Total Sales: ${saleCount}`);
    console.log(`   Current Stock: ${product.currentQuantity} units`);
    console.log(`   Timeline Events: ${timeline.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error tracking product history:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get product name from command line argument or use default
const productName = process.argv[2] || 'Prodcut One';
trackProductHistory(productName);

