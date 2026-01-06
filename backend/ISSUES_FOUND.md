# Issues Found in Return Accounting

## Issue 1: Missing Accounting Transaction for Standalone Returns

**Location:** `backend/routes/return.js` (lines 277-410)

**Problem:**
- When creating a standalone supplier return, the accounting transaction is created in a try-catch block (line 278).
- If the accounting creation fails, the code attempts to delete the return (lines 400-407).
- However, if:
  1. The accounting error is caught but the return deletion also fails
  2. There's a race condition
  3. The return was created without `returnHandlingMethod` (though this should be validated)
  
  Then the return can exist without an accounting transaction.

**Root Cause:**
- The accounting creation is outside the database transaction that creates the return.
- If accounting fails after the return is committed, the rollback doesn't happen automatically.

**Solution:**
- Move accounting creation inside the same transaction, OR
- Add better error handling and verification that accounting was created successfully
- Add a check to ensure returns always have accounting transactions before marking as APPROVED

---

## Issue 2: Duplicate Adjustment Transactions for Standalone Returns

**Location:** `backend/routes/purchaseInvoice.js` (lines 1607-2258)

**Problem:**
- When updating a purchase invoice, the code calculates `oldReturnTotal` from ALL returns on the invoice (line 1611), including standalone returns that already have their own accounting transactions.
- The code then creates adjustment transactions (lines 1994-2258) for ALL returns, without checking if they are standalone returns with their own accounting.
- This creates duplicate accounting entries:
  - Standalone return creates its own transaction (via `POST /return`)
  - Invoice update creates an adjustment transaction for the same return amount

**Root Cause:**
- The code doesn't distinguish between:
  - **Standalone returns**: Created via `POST /return` with their own accounting transactions (have `orderReturnId` in transaction)
  - **Invoice returns**: Created via `PUT /purchase-invoice/:id/with-products` without separate accounting (handled in invoice transaction)

**Example:**
1. Create standalone return `1003-JAN-26-004` → Creates transaction `TXN-2026-1767652759246` with `orderReturnId`
2. Update invoice with return items → Creates adjustment `TXN-ADJ-RETURN-2026-1767651353349` for the same amount
3. Result: Duplicate accounting entries

**Solution:**
- When calculating `oldReturnTotal`, exclude standalone returns (those with `orderReturnId` in their transactions)
- Only create adjustment transactions for returns that were created through the invoice update endpoint
- Check if a return has its own accounting transaction before including it in adjustment calculations

---

## Recommended Fixes

### Fix 1: Exclude Standalone Returns from Invoice Adjustment Calculations

In `backend/routes/purchaseInvoice.js`, modify the `oldReturnTotal` calculation to exclude standalone returns:

```javascript
// Get standalone returns (those with their own accounting transactions)
const standaloneReturns = await prisma.return.findMany({
  where: {
    purchaseInvoiceId: id,
    returnType: 'SUPPLIER',
    status: { not: 'REJECTED' }
  },
  include: {
    transactions: {
      where: {
        orderReturnId: { not: null }
      }
    }
  }
});

const standaloneReturnIds = new Set(standaloneReturns.map(r => r.id));

// Calculate oldReturnTotal excluding standalone returns
const oldReturnItems = existingInvoice.returns && existingInvoice.returns.length > 0
  ? existingInvoice.returns
      .filter(r => !standaloneReturnIds.has(r.id)) // Exclude standalone returns
      .flatMap(r => r.returnItems.map(ri => ({ ...ri, returnId: r.id })))
  : [];
const oldReturnTotal = oldReturnItems.reduce((sum, r) => sum + (parseFloat(r.purchasePrice || 0) * parseInt(r.quantity || 0)), 0);
```

### Fix 2: Add Verification for Standalone Return Accounting

In `backend/routes/return.js`, add verification after accounting creation:

```javascript
// Verify transaction was created
const createdTransaction = await prisma.transaction.findFirst({
  where: {
    orderReturnId: result.returnRecord.id,
    tenantId: tenant.id
  }
});

if (!createdTransaction) {
  throw new Error('Accounting transaction was not created successfully');
}
```

### Fix 3: Add Database Constraint or Validation

Consider adding a check that ensures all APPROVED standalone returns have accounting transactions.

