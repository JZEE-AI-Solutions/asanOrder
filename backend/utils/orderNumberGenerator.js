const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Generate a new order number in the format: 4-digit business code-3 char month-2 digit year-sequence
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<string>} - The generated order number
 */
async function generateOrderNumber(tenantId) {
  try {
    // Get tenant with business code
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { businessCode: true }
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear().toString().slice(-2); // Last 2 digits
    
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                       'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthName = monthNames[month - 1];

    // Count existing orders for this tenant in the current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const existingOrdersCount = await prisma.order.count({
      where: {
        tenantId: tenantId,
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      }
    });

    // Generate sequence number (starts from 1)
    const sequence = existingOrdersCount + 1;
    const sequenceStr = sequence.toString().padStart(3, '0');

    // Generate order number
    const orderNumber = `${tenant.businessCode}-${monthName}-${year}-${sequenceStr}`;

    return orderNumber;
  } catch (error) {
    console.error('Error generating order number:', error);
    throw error;
  }
}

module.exports = { generateOrderNumber };
