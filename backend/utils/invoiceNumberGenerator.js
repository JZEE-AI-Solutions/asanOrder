const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Generate a new invoice number in the format: 4-digit business code-3 char month-2 digit year-sequence
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<string>} - The generated invoice number
 */
async function generateInvoiceNumber(tenantId) {
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

    // Count existing purchase invoices for this tenant in the current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const existingInvoicesCount = await prisma.purchaseInvoice.count({
      where: {
        tenantId: tenantId,
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      }
    });

    // Generate sequence number (starts from 1)
    const sequence = existingInvoicesCount + 1;
    const sequenceStr = sequence.toString().padStart(3, '0');

    // Generate invoice number
    const invoiceNumber = `${tenant.businessCode}-${monthName}-${year}-${sequenceStr}`;

    return invoiceNumber;
  } catch (error) {
    console.error('Error generating invoice number:', error);
    throw error;
  }
}

/**
 * Generate a new return number in the format: 4-digit business code-3 char month-2 digit year-sequence
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<string>} - The generated return number
 */
async function generateReturnNumber(tenantId) {
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

    // Count existing returns for this tenant in the current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const existingReturnsCount = await prisma.return.count({
      where: {
        tenantId: tenantId,
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      }
    });

    // Generate sequence number (starts from 1)
    const sequence = existingReturnsCount + 1;
    const sequenceStr = sequence.toString().padStart(3, '0');

    // Generate return number
    const returnNumber = `${tenant.businessCode}-${monthName}-${year}-${sequenceStr}`;

    return returnNumber;
  } catch (error) {
    console.error('Error generating return number:', error);
    throw error;
  }
}

module.exports = { generateInvoiceNumber, generateReturnNumber };
