/**
 * Backfill Payment records for supplier payments that were recorded as
 * accounting transactions only (advance-only) and never had a Payment row.
 * This makes them appear on the Supplier Dashboard.
 *
 * Usage: node scripts/backfill-supplier-advance-payments.js [--dry-run]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const prisma = require('../lib/db');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  // Find transactions that look like supplier payments (have purchaseInvoiceId,
  // description mentions SUPPLIER_PAYMENT) but have no linked Payment
  const transactions = await prisma.transaction.findMany({
    where: {
      purchaseInvoiceId: { not: null },
      description: { contains: 'SUPPLIER_PAYMENT', mode: 'insensitive' },
      payment: null
    },
    include: {
      transactionLines: { include: { account: true } },
      purchaseInvoice: { select: { id: true, supplierId: true, invoiceNumber: true, tenantId: true } }
    },
    orderBy: { date: 'asc' }
  });

  console.log(`Found ${transactions.length} transaction(s) with purchaseInvoiceId and SUPPLIER_PAYMENT but no Payment row.`);
  if (transactions.length === 0) {
    return;
  }

  const year = new Date().getFullYear();
  const baseCount = await prisma.payment.count({ where: { tenantId: transactions[0]?.purchaseInvoice?.tenantId } });
  let nextSeq = baseCount + 1;

  for (const txn of transactions) {
    const invoice = txn.purchaseInvoice;
    if (!invoice?.supplierId) {
      console.log(`  Skip txn ${txn.id}: invoice has no supplierId`);
      continue;
    }

    // Payment amount = debit on AP (Accounts Payable, typically 2000)
    const apLine = txn.transactionLines.find(
      (l) => l.debitAmount > 0 && (l.account?.code === '2000' || l.account?.type === 'LIABILITY')
    );
    const amount = apLine ? apLine.debitAmount : 0;
    if (amount <= 0) {
      console.log(`  Skip txn ${txn.id}: could not determine amount from transaction lines`);
      continue;
    }

    const paymentNumber = `PAY-${year}-${String(nextSeq).padStart(4, '0')}`;
    nextSeq += 1;

    console.log(`  Txn ${txn.id} (${txn.description?.slice(0, 50)}...): amount=${amount}, supplierId=${invoice.supplierId}, invoice=${invoice.invoiceNumber}`);

    if (DRY_RUN) {
      console.log(`    [DRY-RUN] Would create Payment: ${paymentNumber}, date=${txn.date.toISOString().slice(0, 10)}, amount=${amount}, method=Advance`);
      continue;
    }

    await prisma.payment.create({
      data: {
        paymentNumber,
        date: txn.date,
        type: 'SUPPLIER_PAYMENT',
        amount,
        paymentMethod: 'Advance',
        accountId: null,
        tenantId: invoice.tenantId,
        supplierId: invoice.supplierId,
        purchaseInvoiceId: invoice.id,
        transactionId: txn.id
      }
    });
    console.log(`    Created Payment ${paymentNumber}`);
  }
}

main()
  .then(() => {
    console.log(DRY_RUN ? 'Dry run done.' : 'Backfill done.');
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
