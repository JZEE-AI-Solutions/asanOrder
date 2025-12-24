# Comprehensive Test Cases: Supplier, Purchase, Payment & Accounting Integration

## Test Environment Setup
- Tenant: Test Tenant
- Chart of Accounts should be initialized
- All accounts should have zero balance initially (or known opening balances)

---

## Test Case 1: Supplier Creation with Advance Payment (Supplier Owes Us)

### Scenario
Create a supplier who has already paid us an advance of Rs. 10,000.

### Steps
1. Navigate to Suppliers → Add Supplier
2. Enter:
   - Name: "Supplier A - Advance"
   - Balance Type: "Supplier Owes Us (Advance Received - They paid us advance)"
   - Balance Amount: 10,000
3. Save

### Expected Accounting Impact
**Transaction Created:**
- Debit: Opening Balance Equity (3001) - Rs. 10,000
- Credit: Supplier Advance Balance (1220, LIABILITY) - Rs. 10,000

### Verification Points
- [ ] Supplier appears in supplier list
- [ ] Supplier shows "Advance: Rs. 10,000" in green
- [ ] Chart of Accounts shows:
  - Supplier Advance Balance (1220): Rs. 10,000 (Credit balance)
  - Opening Balance Equity (3001): Rs. -10,000 (Debit balance)
- [ ] Ledger for Supplier Advance Balance shows the transaction
- [ ] Ledger for Opening Balance Equity shows the transaction

---

## Test Case 2: Supplier Creation with Pending Amount (We Owe Supplier)

### Scenario
Create a supplier to whom we owe Rs. 15,000.

### Steps
1. Navigate to Suppliers → Add Supplier
2. Enter:
   - Name: "Supplier B - Pending"
   - Balance Type: "We Owe Supplier (Accounts Payable - We need to pay them)"
   - Balance Amount: 15,000
3. Save

### Expected Accounting Impact
**Transaction Created:**
- Debit: Opening Balance Equity (3001) - Rs. 15,000
- Credit: Accounts Payable (2000, LIABILITY) - Rs. 15,000

### Verification Points
- [ ] Supplier appears in supplier list
- [ ] Supplier shows "Pending: Rs. 15,000" in red
- [ ] Chart of Accounts shows:
  - Accounts Payable (2000): Rs. 15,000 (Credit balance)
  - Opening Balance Equity (3001): Rs. -25,000 (Debit balance, cumulative)
- [ ] Ledger for Accounts Payable shows the transaction
- [ ] Accounting Dashboard shows "Total Payables: Rs. 15,000"

---

## Test Case 3: Edit Supplier - Change from Advance to Pending

### Scenario
Edit Supplier A to change from advance (they owe us) to pending (we owe them).

### Steps
1. Navigate to Suppliers → Click Edit on "Supplier A - Advance"
2. Change:
   - Balance Type: "We Owe Supplier (Accounts Payable)"
   - Balance Amount: 5,000
3. Save

### Expected Accounting Impact
**Adjustment Transaction Created:**
- Debit: Supplier Advance Balance (1220) - Rs. 10,000 (reverse old)
- Credit: Opening Balance Equity (3001) - Rs. 10,000 (reverse old)
- Debit: Opening Balance Equity (3001) - Rs. 5,000 (new)
- Credit: Accounts Payable (2000) - Rs. 5,000 (new)

**Net Effect:**
- Supplier Advance Balance: Rs. 0 (was Rs. 10,000)
- Accounts Payable: Rs. 5,000 (was Rs. 0)
- Opening Balance Equity: Rs. -5,000 (was Rs. -10,000)

### Verification Points
- [ ] Supplier shows "Pending: Rs. 5,000" in red
- [ ] Chart of Accounts reflects the changes
- [ ] Adjustment transaction appears in journal
- [ ] Ledgers show correct running balances

---

## Test Case 4: Create Purchase Invoice - Using Full Advance

### Scenario
Create a purchase invoice from Supplier A (who has Rs. 10,000 advance) for Rs. 8,000, fully utilizing advance.

### Steps
1. Navigate to Purchases → Add Purchase
2. Enter:
   - Supplier: "Supplier A - Advance" (select from autocomplete)
   - Invoice Number: "PI-001"
   - Date: Today
   - Add Product: "Product X", Quantity: 10, Unit Price: 800, Total: 8,000
3. Verify:
   - Available Advance: Rs. 10,000
   - Purchase Amount: Rs. 8,000
   - Advance Used: Rs. 8,000 (auto)
   - Payment Status: "Fully Paid"
   - Payment Amount: Not shown (fully covered by advance)
4. Save

### Expected Accounting Impact
**Transaction 1 - Purchase Invoice:**
- Debit: Inventory (1300) - Rs. 8,000
- Credit: Accounts Payable (2000) - Rs. 8,000

**Transaction 2 - Advance Usage:**
- Debit: Supplier Advance Balance (1220) - Rs. 8,000
- Credit: Accounts Payable (2000) - Rs. 8,000

**Payment Record:**
- Payment Method: "Advance Balance"
- Amount: Rs. 8,000

### Verification Points
- [ ] Purchase invoice created successfully
- [ ] Payment record shows "Advance Balance" method
- [ ] Supplier advance balance reduced: Rs. 2,000 remaining (10,000 - 8,000)
- [ ] Accounts Payable: Net Rs. 0 (8,000 - 8,000)
- [ ] Inventory increased by Rs. 8,000
- [ ] Purchase card shows "Fully Paid"
- [ ] Journal entries show both transactions
- [ ] Product balance increased by 10 units

---

## Test Case 5: Create Purchase Invoice - Partial Advance + Cash Payment

### Scenario
Create a purchase invoice from Supplier A (Rs. 2,000 advance remaining) for Rs. 5,000, using Rs. 2,000 advance and Rs. 3,000 cash.

### Steps
1. Navigate to Purchases → Add Purchase
2. Enter:
   - Supplier: "Supplier A - Advance"
   - Invoice Number: "PI-002"
   - Date: Today
   - Add Product: "Product Y", Quantity: 5, Unit Price: 1,000, Total: 5,000
3. Verify:
   - Available Advance: Rs. 2,000
   - Purchase Amount: Rs. 5,000
   - Advance Used: Rs. 2,000 (auto)
   - Payment Status: "Partially Paid"
   - Payment Amount: Rs. 3,000
   - Payment Method: "Cash"
4. Save

### Expected Accounting Impact
**Transaction 1 - Purchase Invoice:**
- Debit: Inventory (1300) - Rs. 5,000
- Credit: Accounts Payable (2000) - Rs. 5,000

**Transaction 2 - Advance Usage:**
- Debit: Supplier Advance Balance (1220) - Rs. 2,000
- Credit: Accounts Payable (2000) - Rs. 2,000

**Transaction 3 - Cash Payment:**
- Debit: Accounts Payable (2000) - Rs. 3,000
- Credit: Cash (1000) - Rs. 3,000

**Payment Records:**
1. Payment Method: "Advance Balance", Amount: Rs. 2,000
2. Payment Method: "Cash", Amount: Rs. 3,000

### Verification Points
- [ ] Purchase invoice created
- [ ] Two payment records created (advance + cash)
- [ ] Supplier advance balance: Rs. 0 (fully utilized)
- [ ] Accounts Payable: Net Rs. 0 (5,000 - 2,000 - 3,000)
- [ ] Cash decreased by Rs. 3,000
- [ ] Inventory increased by Rs. 5,000
- [ ] Purchase card shows "Partially Paid" or "Fully Paid" (depending on remaining)
- [ ] Journal entries show all three transactions
- [ ] Product balance increased by 5 units

---

## Test Case 6: Create Purchase Invoice - No Advance, Full Cash Payment

### Scenario
Create a purchase invoice from Supplier B (we owe Rs. 15,000) for Rs. 12,000, paid fully in cash.

### Steps
1. Navigate to Purchases → Add Purchase
2. Enter:
   - Supplier: "Supplier B - Pending"
   - Invoice Number: "PI-003"
   - Date: Today
   - Add Product: "Product Z", Quantity: 20, Unit Price: 600, Total: 12,000
3. Verify:
   - Available Advance: Rs. 0 (no advance)
   - Purchase Amount: Rs. 12,000
   - Payment Status: "Fully Paid"
   - Payment Amount: Rs. 12,000
   - Payment Method: "Cash"
4. Save

### Expected Accounting Impact
**Transaction 1 - Purchase Invoice:**
- Debit: Inventory (1300) - Rs. 12,000
- Credit: Accounts Payable (2000) - Rs. 12,000

**Transaction 2 - Cash Payment:**
- Debit: Accounts Payable (2000) - Rs. 12,000
- Credit: Cash (1000) - Rs. 12,000

**Payment Record:**
- Payment Method: "Cash", Amount: Rs. 12,000

### Verification Points
- [ ] Purchase invoice created
- [ ] Payment record created
- [ ] Accounts Payable: Net Rs. 3,000 (15,000 + 12,000 - 12,000)
- [ ] Cash decreased by Rs. 12,000
- [ ] Inventory increased by Rs. 12,000
- [ ] Purchase card shows "Fully Paid"
- [ ] Journal entries show both transactions
- [ ] Product balance increased by 20 units

---

## Test Case 7: Create Purchase Invoice - No Payment (Unpaid)

### Scenario
Create a purchase invoice from Supplier B for Rs. 7,000, unpaid.

### Steps
1. Navigate to Purchases → Add Purchase
2. Enter:
   - Supplier: "Supplier B - Pending"
   - Invoice Number: "PI-004"
   - Date: Today
   - Add Product: "Product W", Quantity: 7, Unit Price: 1,000, Total: 7,000
3. Verify:
   - Available Advance: Rs. 0
   - Purchase Amount: Rs. 7,000
   - Payment Status: "Unpaid"
   - Payment Amount: Not shown
4. Save

### Expected Accounting Impact
**Transaction - Purchase Invoice:**
- Debit: Inventory (1300) - Rs. 7,000
- Credit: Accounts Payable (2000) - Rs. 7,000

**No Payment Record Created**

### Verification Points
- [ ] Purchase invoice created
- [ ] No payment record created
- [ ] Accounts Payable: Net Rs. 10,000 (3,000 + 7,000)
- [ ] Inventory increased by Rs. 7,000
- [ ] Purchase card shows "Unpaid"
- [ ] Journal entry shows only purchase transaction
- [ ] Product balance increased by 7 units

---

## Test Case 8: Make Payment from Purchase Card - Using Advance

### Scenario
Make payment for PI-004 (Rs. 7,000 unpaid) using supplier advance (if available) or cash.

### Steps
1. Navigate to Purchases → Find "PI-004"
2. Click "Make Payment"
3. Enter:
   - Date: Today
   - Verify Payment Summary shows:
     - Invoice Total: Rs. 7,000
     - Pending Before Payment: Rs. 7,000
     - From Advance: Rs. 0 (if no advance) or available amount
     - Cash/Bank Payment: Rs. 7,000
     - Remaining After Payment: Rs. 0
   - Payment Method: "Bank Transfer"
   - Amount: Rs. 7,000
4. Save

### Expected Accounting Impact
**Transaction - Payment:**
- Debit: Accounts Payable (2000) - Rs. 7,000
- Credit: Bank Account (1100) - Rs. 7,000

**Payment Record:**
- Payment Method: "Bank Transfer", Amount: Rs. 7,000

### Verification Points
- [ ] Payment record created
- [ ] Accounts Payable: Net Rs. 3,000 (10,000 - 7,000)
- [ ] Bank Account decreased by Rs. 7,000
- [ ] Purchase card shows "Fully Paid"
- [ ] Payment appears in "View Payments" section
- [ ] Journal entry shows payment transaction
- [ ] Transaction linked to purchase invoice

---

## Test Case 9: Edit Purchase Invoice - Increase Amount

### Scenario
Edit PI-001 to increase amount from Rs. 8,000 to Rs. 10,000.

### Steps
1. Navigate to Purchases → Find "PI-001"
2. Click "Edit"
3. Change:
   - Product Quantity: 10 → 12.5 (or add new product)
   - Total Amount: Rs. 8,000 → Rs. 10,000
4. Save

### Expected Accounting Impact
**Adjustment Transaction:**
- Debit: Inventory (1300) - Rs. 2,000 (increase)
- Credit: Accounts Payable (2000) - Rs. 2,000 (increase)

### Verification Points
- [ ] Purchase invoice updated
- [ ] Adjustment transaction created
- [ ] Inventory increased by additional Rs. 2,000
- [ ] Accounts Payable increased by Rs. 2,000
- [ ] Purchase card shows updated amount
- [ ] Journal shows adjustment transaction
- [ ] Product balance updated accordingly

---

## Test Case 10: Edit Purchase Invoice - Decrease Amount

### Scenario
Edit PI-002 to decrease amount from Rs. 5,000 to Rs. 4,000.

### Steps
1. Navigate to Purchases → Find "PI-002"
2. Click "Edit"
3. Change:
   - Product Quantity or Price
   - Total Amount: Rs. 5,000 → Rs. 4,000
4. Save

### Expected Accounting Impact
**Adjustment Transaction:**
- Debit: Inventory (1300) - Rs. 0, Credit: Rs. 1,000 (decrease)
- Debit: Accounts Payable (2000) - Rs. 0, Credit: Rs. 1,000 (decrease)

### Verification Points
- [ ] Purchase invoice updated
- [ ] Adjustment transaction created
- [ ] Inventory decreased by Rs. 1,000
- [ ] Accounts Payable decreased by Rs. 1,000
- [ ] Purchase card shows updated amount
- [ ] Journal shows adjustment transaction
- [ ] Product balance updated accordingly

---

## Test Case 11: Edit Payment - Increase Amount

### Scenario
Edit payment for PI-002 to increase from Rs. 3,000 to Rs. 4,000 (cash payment).

### Steps
1. Navigate to Purchases → Find "PI-002"
2. Click "View Details" or navigate to invoice details
3. Find payment record (Cash, Rs. 3,000)
4. Click "Edit Payment" (pencil icon)
5. Change:
   - Amount: Rs. 3,000 → Rs. 4,000
   - Payment Method: "Cash" (or change to "Bank Transfer")
6. Save

### Expected Accounting Impact
**Adjustment Transaction:**
- If same method (Cash):
  - Debit: Accounts Payable (2000) - Rs. 1,000 (increase payment)
  - Credit: Cash (1000) - Rs. 1,000 (increase payment)
- If method changed (Cash → Bank):
  - Credit: Cash (1000) - Rs. 3,000 (reverse old)
  - Debit: Cash (1000) - Rs. 4,000 (new payment)
  - Debit: Accounts Payable (2000) - Rs. 1,000 (increase)
  - Credit: Bank Account (1100) - Rs. 4,000 (new payment)
  - Credit: Accounts Payable (2000) - Rs. 3,000 (reverse old)

### Verification Points
- [ ] Payment record updated
- [ ] Adjustment transaction created
- [ ] Accounts Payable adjusted correctly
- [ ] Cash/Bank accounts adjusted correctly
- [ ] Journal shows adjustment transaction
- [ ] Transaction linked to purchase invoice

---

## Test Case 12: Edit Payment - Decrease Amount

### Scenario
Edit payment for PI-003 to decrease from Rs. 12,000 to Rs. 10,000.

### Steps
1. Navigate to Purchases → Find "PI-003"
2. Click "View Details"
3. Find payment record (Cash, Rs. 12,000)
4. Click "Edit Payment"
5. Change:
   - Amount: Rs. 12,000 → Rs. 10,000
6. Save

### Expected Accounting Impact
**Adjustment Transaction:**
- Credit: Accounts Payable (2000) - Rs. 2,000 (reduce payment)
- Debit: Cash (1000) - Rs. 2,000 (get money back)

### Verification Points
- [ ] Payment record updated
- [ ] Adjustment transaction created
- [ ] Accounts Payable increased by Rs. 2,000
- [ ] Cash increased by Rs. 2,000
- [ ] Purchase card shows updated payment status
- [ ] Journal shows adjustment transaction

---

## Test Case 13: Edit Payment - Change Payment Method Only

### Scenario
Edit payment for PI-003 to change from Cash to Bank Transfer (same amount).

### Steps
1. Navigate to Purchases → Find "PI-003"
2. Click "View Details"
3. Find payment record (Cash, Rs. 10,000)
4. Click "Edit Payment"
5. Change:
   - Payment Method: "Cash" → "Bank Transfer"
   - Amount: Rs. 10,000 (unchanged)
6. Save

### Expected Accounting Impact
**Payment Method Change Transaction:**
- Credit: Cash (1000) - Rs. 10,000 (money moved out)
- Debit: Bank Account (1100) - Rs. 10,000 (money moved in)

### Verification Points
- [ ] Payment record updated (method changed)
- [ ] Payment method change transaction created
- [ ] Cash increased by Rs. 10,000
- [ ] Bank Account decreased by Rs. 10,000
- [ ] Accounts Payable unchanged
- [ ] Journal shows payment method change transaction

---

## Test Case 14: Complex Scenario - Multiple Purchases with Mixed Payments

### Scenario
1. Supplier C created with Rs. 20,000 advance
2. Purchase 1: Rs. 15,000 (Rs. 15,000 advance + Rs. 0 cash)
3. Purchase 2: Rs. 8,000 (Rs. 5,000 advance + Rs. 3,000 cash)
4. Purchase 3: Rs. 12,000 (unpaid)
5. Make payment for Purchase 3: Rs. 7,000 (bank transfer)
6. Edit Purchase 2: Increase to Rs. 10,000
7. Edit payment for Purchase 2: Change from Cash to Bank, increase to Rs. 5,000

### Steps
Execute all steps sequentially and verify accounting after each step.

### Expected Final State
- Supplier C Advance Balance: Rs. 0 (20,000 - 15,000 - 5,000)
- Accounts Payable: Rs. 5,000 (12,000 - 7,000)
- Inventory: Rs. 33,000 (15,000 + 8,000 + 10,000)
- Cash: Decreased by Rs. 3,000 (original payment)
- Bank Account: Decreased by Rs. 12,000 (7,000 + 5,000)

### Verification Points
- [ ] All transactions appear in journal
- [ ] All accounts show correct balances
- [ ] All payments linked to correct invoices
- [ ] Product balances correct
- [ ] Supplier balance correct

---

## Test Case 15: Product Balance Verification

### Scenario
Verify product balances are correctly updated with each purchase.

### Steps
1. Note initial product balance (check `currentQuantity` field in Product model)
2. Create purchase with Product X, Quantity: 10
3. Verify:
   - Product balance increased by 10
   - Product log entry created
   - `currentQuantity` field updated
4. Edit purchase, change quantity to 15
5. Verify:
   - Product balance increased by additional 5 (total +15 from initial)
   - Product log entry created for the change
6. Edit purchase, change quantity to 12
7. Verify:
   - Product balance decreased by 3 (net +12 from initial)
   - Product log entry shows the adjustment

### Expected Behavior
- **On Purchase Creation:**
  - If product exists: `currentQuantity` increases by purchase quantity
  - If product doesn't exist: New product created with `currentQuantity = purchase quantity`
  - Product log entry created with action "PURCHASE"

- **On Purchase Edit (Quantity Increase):**
  - `currentQuantity` increases by the difference
  - Product log entry created showing old and new quantities

- **On Purchase Edit (Quantity Decrease):**
  - `currentQuantity` decreases by the difference
  - Product log entry created showing the reduction

### Verification Points
- [ ] Product balance (`currentQuantity`) updates on purchase creation
- [ ] Product balance updates on purchase edit (increase)
- [ ] Product balance updates on purchase edit (decrease)
- [ ] Product balance is accurate in product list
- [ ] Product log entries are created for all changes
- [ ] Product log shows correct old/new quantities
- [ ] Product log references the purchase invoice
- [ ] Payment operations do NOT affect product balance

---

## Test Case 16: Accounting Dashboard Verification

### Scenario
Verify all accounting summaries are correct after all transactions.

### Steps
1. Navigate to Accounting Dashboard
2. Verify:
   - Total Receivables: Should match sum of customer AR balances
   - Total Payables: Should match sum of positive supplier pending balances (exclude advances)
   - Cash Position: Should match Cash + Bank Account balances
   - Net Balance: Should be balanced

### Verification Points
- [ ] Total Payables excludes supplier advances (negative balances)
- [ ] Total Payables includes only positive pending amounts
- [ ] Cash Position is accurate
- [ ] All calculations are correct

---

## Test Case 17: Chart of Accounts Verification

### Scenario
Verify all accounts show correct balances after all test cases.

### Expected Account Balances (Cumulative from all tests):
- **Assets:**
  - Cash (1000): Should reflect all cash payments
  - Bank Account (1100): Should reflect all bank payments
  - Inventory (1300): Should reflect all purchase amounts
  - Advance to Suppliers (1230): Should reflect supplier advances (if any)

- **Liabilities:**
  - Accounts Payable (2000): Should reflect net payables
  - Supplier Advance Balance (1220): Should reflect supplier advances received

- **Equity:**
  - Opening Balance Equity (3001): Should reflect all opening balance adjustments

### Verification Points
- [ ] All account balances are correct
- [ ] Debits = Credits (balanced)
- [ ] Ledgers show correct running balances
- [ ] Transaction descriptions are clear

---

## Test Case 18: Supplier Balance Calculation

### Scenario
Verify supplier balance calculation is correct after all operations.

### Steps
1. For each supplier, verify:
   - Opening Balance (if set)
   - Total Purchase Invoices
   - Total Payments Made
   - Current Balance = Opening + Purchases - Payments

### Verification Points
- [ ] Supplier balance matches calculation
- [ ] Advance balances shown correctly (negative)
- [ ] Pending balances shown correctly (positive)
- [ ] Balance updates correctly after each operation

---

## Test Case 19: Payment Method Change Impact

### Scenario
Verify accounting impact when payment method changes.

### Steps
1. Create payment with Cash
2. Verify Cash decreased, AP decreased
3. Edit payment, change to Bank Transfer
4. Verify Cash increased, Bank decreased, AP unchanged
5. Edit payment, change amount and method simultaneously
6. Verify all accounts adjusted correctly

### Verification Points
- [ ] Payment method change creates correct transaction
- [ ] Old account credited correctly
- [ ] New account debited correctly
- [ ] AP adjusted if amount also changed

---

## Test Case 20: Edge Cases

### Scenario 1: Purchase Amount = Available Advance
- Create purchase exactly equal to available advance
- Verify advance fully utilized, payment status "Fully Paid"

### Scenario 2: Purchase Amount < Available Advance
- Create purchase less than available advance
- Verify advance partially utilized, remaining advance available

### Scenario 3: Multiple Payments for Same Invoice
- Create purchase (unpaid)
- Make payment 1: Rs. 5,000
- Make payment 2: Rs. 3,000
- Verify both payments recorded, invoice shows correct status

### Scenario 4: Edit Payment to Zero
- Try to edit payment amount to Rs. 0
- Should show validation error

### Scenario 5: Payment Exceeding Invoice Amount
- Try to make payment exceeding invoice total
- Should show validation error

### Verification Points
- [ ] All edge cases handled correctly
- [ ] Validation errors shown where appropriate
- [ ] Accounting remains balanced

---

## Test Checklist Summary

### Supplier Operations
- [ ] Add supplier with advance
- [ ] Add supplier with pending
- [ ] Edit supplier balance (advance to pending)
- [ ] Edit supplier balance (pending to advance)
- [ ] Edit supplier balance (same type, different amount)

### Purchase Operations
- [ ] Create purchase with full advance
- [ ] Create purchase with partial advance + cash
- [ ] Create purchase with no advance, full cash
- [ ] Create purchase unpaid
- [ ] Edit purchase (increase amount)
- [ ] Edit purchase (decrease amount)
- [ ] Edit purchase (change products)

### Payment Operations
- [ ] Make payment from purchase card (cash)
- [ ] Make payment from purchase card (bank)
- [ ] Make payment using advance
- [ ] Edit payment (increase amount)
- [ ] Edit payment (decrease amount)
- [ ] Edit payment (change method only)
- [ ] Edit payment (change amount + method)

### Accounting Verification
- [ ] All transactions balanced (Debits = Credits)
- [ ] Account balances correct
- [ ] Ledgers show correct running balances
- [ ] Journal entries linked to invoices
- [ ] Chart of Accounts accurate
- [ ] Accounting Dashboard summaries correct

### Product Balance
- [ ] Product balance updates on purchase
- [ ] Product balance updates on purchase edit
- [ ] Product balance accurate

---

## Notes
- Always verify accounting after each operation
- Check journal entries for proper descriptions
- Verify transaction linking to purchase invoices
- Ensure all accounts remain balanced
- Product balances should match inventory transactions

