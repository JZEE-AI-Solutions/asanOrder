/**
 * Check purchase invoice and its payments (for debugging supplier dashboard).
 * Usage: node scripts/check-invoice-payments.js [invoiceNumber]
 * Example: node scripts/check-invoice-payments.js 1004-FEB-26-001
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../lib/db');

const INVOICE_NUMBER = process.argv[2] || '1004-FEB-26-001';

async function main() {
  console.log('Checking invoice:', INVOICE_NUMBER);
  console.log('');

  const invoice = await prisma.purchaseInvoice.findFirst({
    where: { invoiceNumber: INVOICE_NUMBER },
    include: {
      supplier: { select: { id: true, name: true } }
    }
  });

  if (!invoice) {
    console.log('Purchase invoice NOT FOUND:', INVOICE_NUMBER);
    process.exit(1);
  }

  console.log('--- Purchase Invoice ---');
  console.log('id:', invoice.id);
  console.log('invoiceNumber:', invoice.invoiceNumber);
  console.log('supplierId:', invoice.supplierId ?? 'NULL');
  console.log('supplier:', invoice.supplier ? `${invoice.supplier.name} (${invoice.supplier.id})` : 'N/A');
  console.log('tenantId:', invoice.tenantId);
  console.log('totalAmount:', invoice.totalAmount);
  console.log('paymentAmount:', invoice.paymentAmount);
  console.log('');

  const paymentsByInvoice = await prisma.payment.findMany({
    where: { purchaseInvoiceId: invoice.id },
    include: {
      account: { select: { id: true, name: true } }
    },
    orderBy: { date: 'asc' }
  });

  console.log('--- Payment records (payments.purchaseInvoiceId = invoice.id) ---');
  console.log('Count:', paymentsByInvoice.length);
  paymentsByInvoice.forEach((p, i) => {
    console.log(`  [${i + 1}] id: ${p.id}, paymentNumber: ${p.paymentNumber}, date: ${p.date.toISOString().slice(0, 10)}, amount: ${p.amount}, type: ${p.type}`);
    console.log(`      supplierId: ${p.supplierId ?? 'NULL'}, accountId: ${p.accountId ?? 'NULL'}, account: ${p.account?.name ?? 'N/A'}`);
  });
  console.log('');

  const paymentsBySupplier = invoice.supplierId
    ? await prisma.payment.findMany({
        where: { supplierId: invoice.supplierId, type: 'SUPPLIER_PAYMENT' },
        orderBy: { date: 'desc' },
        take: 20
      })
    : [];

  console.log('--- Recent SUPPLIER_PAYMENT for this supplier (supplierId = invoice.supplierId) ---');
  console.log('Count (max 20):', paymentsBySupplier.length);
  paymentsBySupplier.forEach((p, i) => {
    const linked = p.purchaseInvoiceId === invoice.id ? ' <-- THIS INVOICE' : '';
    console.log(`  [${i + 1}] ${p.paymentNumber}, date: ${p.date.toISOString().slice(0, 10)}, amount: ${p.amount}, purchaseInvoiceId: ${p.purchaseInvoiceId ?? 'NULL'}${linked}`);
  });
  console.log('');

  const transactions = await prisma.transaction.findMany({
    where: { purchaseInvoiceId: invoice.id },
    orderBy: { date: 'asc' }
  });

  console.log('--- Accounting transactions (transaction.purchaseInvoiceId = invoice.id) ---');
  console.log('Count:', transactions.length);
  transactions.forEach((t, i) => {
    console.log(`  [${i + 1}] id: ${t.id}, date: ${t.date.toISOString().slice(0, 10)}, description: ${t.description?.slice(0, 60)}...`);
  });

  console.log('');
  console.log('--- Summary ---');
  if (paymentsByInvoice.length === 0 && transactions.length > 0) {
    console.log('No Payment rows linked to this invoice, but there are Transaction rows.');
    console.log('This can happen if the payment was made using only "Advance balance" (no cash/bank).');
    console.log('Supplier dashboard only lists Payment records, so advance-only payments do not appear.');
  }
  if (paymentsByInvoice.some(p => !p.supplierId) && invoice.supplierId) {
    console.log('Some Payment rows have supplierId NULL but the invoice has a supplier. These will not show on that supplier dashboard.');
    console.log('Run with --fix to backfill supplierId on such payments (see fix script).');
  }
  if (paymentsByInvoice.length > 0 && paymentsByInvoice.every(p => p.supplierId) && invoice.supplierId) {
    console.log('Payments exist and have supplierId set. If they still do not show on dashboard, check tenantId or API filter.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
