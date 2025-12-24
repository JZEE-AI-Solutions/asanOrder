# Quick Testing Reference Guide

## Account Codes Reference

| Code | Name | Type | Purpose |
|------|------|------|---------|
| 1000 | Cash | ASSET | Cash payments |
| 1100 | Bank Account | ASSET | Bank transfer payments |
| 1210 | Customer Advance Balance | ASSET | Customer advances paid to us |
| 1220 | Supplier Advance Balance | LIABILITY | Supplier advances received from them |
| 1230 | Advance to Suppliers | ASSET | Advances we paid to suppliers |
| 1300 | Inventory | ASSET | Product purchases |
| 2000 | Accounts Payable | LIABILITY | Amounts we owe suppliers |
| 3001 | Opening Balance Equity | EQUITY | Opening balance adjustments |

---

## Balance Type Meanings

### Supplier Balance Types:
1. **We Owe Supplier (Accounts Payable)**
   - Positive balance
   - We need to pay them
   - Shown as "Pending: Rs. X" in red
   - Credits Accounts Payable (2000)

2. **Supplier Owes Us (Advance Received)**
   - Negative balance (shown as positive advance)
   - They paid us advance
   - Shown as "Advance: Rs. X" in green
   - Credits Supplier Advance Balance (1220)

---

## Transaction Flow Reference

### Purchase Invoice Creation:
```
Debit: Inventory (1300) - Purchase Amount
Credit: Accounts Payable (2000) - Purchase Amount
```

### Advance Usage:
```
Debit: Supplier Advance Balance (1220) - Advance Used
Credit: Accounts Payable (2000) - Advance Used
```

### Cash Payment:
```
Debit: Accounts Payable (2000) - Payment Amount
Credit: Cash (1000) - Payment Amount
```

### Bank Payment:
```
Debit: Accounts Payable (2000) - Payment Amount
Credit: Bank Account (1100) - Payment Amount
```

### Payment Method Change (Cash → Bank):
```
Credit: Cash (1000) - Amount
Debit: Bank Account (1100) - Amount
```

---

## Verification Checklist

### After Each Operation:

#### Supplier Operations:
- [ ] Supplier balance correct
- [ ] Chart of Accounts updated
- [ ] Journal entry created (if balance set)
- [ ] Ledger shows transaction

#### Purchase Operations:
- [ ] Purchase invoice created
- [ ] Inventory increased
- [ ] Accounts Payable updated
- [ ] Payment records created (if paid)
- [ ] Product balance updated
- [ ] Journal entries created

#### Payment Operations:
- [ ] Payment record created/updated
- [ ] Accounts Payable adjusted
- [ ] Cash/Bank adjusted
- [ ] Advance balance adjusted (if used)
- [ ] Journal entry created
- [ ] Transaction linked to invoice

---

## Common Issues to Watch For

1. **Negative Total Payables**
   - Should only sum positive pending balances
   - Advances (negative) should not be included

2. **Unbalanced Transactions**
   - Always verify Debits = Credits
   - Check transaction lines sum to zero

3. **Incorrect Account Types**
   - Supplier Advance Balance (1220) is LIABILITY
   - Advance to Suppliers (1230) is ASSET
   - Don't confuse them

4. **Payment Method Mapping**
   - Cash → Account 1000
   - Bank Transfer/Cheque → Account 1100
   - Other methods → Default to Cash (1000)

5. **Product Balance**
   - Should update on purchase creation
   - Should update on purchase edit (quantity change)
   - Should not update on payment operations

---

## Testing Order Recommendation

1. **Setup Phase:**
   - Create suppliers with different balance types
   - Verify initial accounting state

2. **Purchase Phase:**
   - Create purchases with various payment scenarios
   - Verify accounting after each purchase

3. **Payment Phase:**
   - Make payments from purchase cards
   - Verify accounting after each payment

4. **Edit Phase:**
   - Edit purchases
   - Edit payments
   - Verify adjustment transactions

5. **Verification Phase:**
   - Check all account balances
   - Verify journal entries
   - Check product balances
   - Verify supplier balances

---

## Expected Behaviors

### Advance Auto-Usage:
- If purchase amount ≤ available advance: Use all advance, status "Fully Paid"
- If purchase amount > available advance: Use all advance, show payment fields for remainder

### Payment Status:
- Fully Paid: Total payments ≥ Invoice amount
- Partially Paid: Total payments < Invoice amount and > 0
- Unpaid: Total payments = 0

### Supplier Balance Display:
- Negative balance (advance): "Advance: Rs. X" in green
- Positive balance (pending): "Pending: Rs. X" in red

---

## Debugging Tips

1. **Check Journal Entries:**
   - Every operation should create journal entries
   - Verify transaction descriptions are clear

2. **Check Account Ledgers:**
   - Running balances should be correct
   - Each transaction should show proper debit/credit

3. **Check Payment Records:**
   - Should be linked to purchase invoice
   - Should show correct payment method
   - Should show correct amount

4. **Check Supplier Balance:**
   - Calculate manually: Opening + Purchases - Payments
   - Should match displayed balance

5. **Check Product Balance:**
   - Should match sum of all purchase quantities
   - Should update on purchase edit

---

## Test Data Examples

### Supplier Test Data:
```
Supplier A: Advance Rs. 10,000
Supplier B: Pending Rs. 15,000
Supplier C: Advance Rs. 20,000
```

### Purchase Test Data:
```
PI-001: Rs. 8,000 (fully from advance)
PI-002: Rs. 5,000 (Rs. 2,000 advance + Rs. 3,000 cash)
PI-003: Rs. 12,000 (fully cash)
PI-004: Rs. 7,000 (unpaid)
```

### Payment Test Data:
```
Payment 1: Rs. 3,000 (Cash)
Payment 2: Rs. 7,000 (Bank Transfer)
Payment 3: Rs. 5,000 (Advance Balance)
```

---

## Quick Verification Commands

### Check Account Balance:
```
Navigate to: Accounting → Settings → Chart of Accounts
Click: View Ledger for account
Verify: Running balance is correct
```

### Check Supplier Balance:
```
Navigate to: Business Owner Dashboard → Suppliers
Verify: Balance shown matches calculation
```

### Check Purchase Payments:
```
Navigate to: Business Owner Dashboard → Purchases
Click: View Details on purchase
Verify: Payments section shows all payments
```

### Check Journal Entries:
```
Navigate to: Accounting → Transactions
Filter: By date range
Verify: All transactions appear with correct descriptions
```

---

## Success Criteria

✅ All test cases pass
✅ All accounting entries balanced
✅ All account balances correct
✅ All product balances accurate
✅ All supplier balances correct
✅ All payments linked to invoices
✅ All journal entries have clear descriptions
✅ No negative total payables (unless intentional)
✅ All transactions properly linked

