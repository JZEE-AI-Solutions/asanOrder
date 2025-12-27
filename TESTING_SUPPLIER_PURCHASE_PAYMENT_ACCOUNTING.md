# Comprehensive Test Cases: Supplier, Purchase, Payment & Accounting Integration

## Test Environment Setup
- Tenant: Test Tenant
- Chart of Accounts should be initialized
- All accounts should have zero balance initially (or known opening balances)
- **Multiple Cash/Bank Accounts**: The system now supports multiple cash and bank accounts. Users can create and select from multiple payment accounts during purchase and payment operations.
- **Payment Account Selection**: Instead of hardcoded "Cash" or "Bank Transfer", users must select a specific payment account (Cash or Bank type) from a dropdown.
- **Quick Add Account**: Users can create new cash/bank accounts on-the-fly from purchase and payment forms.

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
   - Payment Account: Not shown (no cash/bank payment needed)
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
   - Payment Status: "Partially Paid" or "Fully Paid" (if remaining = 0)
   - Cash/Bank Payment (Rs.): Rs. 3,000
   - Payment Account: Select a Cash account (e.g., "Main Cash" or create new via "Quick Add Account")
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
- Credit: Selected Cash Account (e.g., "Main Cash") - Rs. 3,000

**Payment Records:**
1. Payment Method: "Advance Balance", Amount: Rs. 2,000 (no payment record, only accounting entry)
2. Payment Method: "Cash" (derived from account type), Amount: Rs. 3,000, Account: Selected Cash Account

### Verification Points
- [ ] Purchase invoice created
- [ ] One payment record created (cash payment only; advance usage is accounting entry only)
- [ ] Supplier advance balance: Rs. 0 (fully utilized)
- [ ] Accounts Payable: Net Rs. 0 (5,000 - 2,000 - 3,000)
- [ ] Selected Cash Account decreased by Rs. 3,000
- [ ] Inventory increased by Rs. 5,000
- [ ] Purchase card shows "Fully Paid" (if remaining = 0)
- [ ] Journal entries show all transactions (purchase + advance usage + cash payment)
- [ ] Product balance increased by 5 units
- [ ] Payment record shows correct account name (not just "Cash")

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
   - Cash/Bank Payment (Rs.): Rs. 12,000
   - Payment Account: Select a Cash or Bank account (e.g., "Main Cash" or "Primary Bank Account")
   - **Quick Add Account**: Can create new account on-the-fly if needed
4. Save

### Expected Accounting Impact
**Transaction 1 - Purchase Invoice:**
- Debit: Inventory (1300) - Rs. 12,000
- Credit: Accounts Payable (2000) - Rs. 12,000

**Transaction 2 - Cash/Bank Payment:**
- Debit: Accounts Payable (2000) - Rs. 12,000
- Credit: Selected Payment Account (Cash or Bank) - Rs. 12,000

**Payment Record:**
- Payment Method: "Cash" or "Bank Transfer" (derived from account type), Amount: Rs. 12,000, Account: Selected Payment Account

### Verification Points
- [ ] Purchase invoice created
- [ ] Payment record created with correct account reference
- [ ] Accounts Payable: Net Rs. 3,000 (15,000 + 12,000 - 12,000)
- [ ] Selected Payment Account decreased by Rs. 12,000
- [ ] Inventory increased by Rs. 12,000
- [ ] Purchase card shows "Fully Paid"
- [ ] Journal entries show both transactions
- [ ] Product balance increased by 20 units
- [ ] Payment record shows account name (not just generic "Cash" or "Bank Transfer")

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
3. Verify Payment Summary (at top of modal) shows:
   - Invoice Total: Rs. 7,000
   - Pending Before Payment: Rs. 7,000
   - From Advance: Rs. 0 (if no advance) or available amount
   - Cash/Bank Payment: Rs. 7,000
   - Remaining After Payment: Rs. 0
4. Enter:
   - Date: Today
   - Amount: Rs. 7,000
   - Payment Account: Select a Bank account (e.g., "Primary Bank Account" or create new via "Quick Add Account")
5. Save

### Expected Accounting Impact
**Transaction - Payment:**
- Debit: Accounts Payable (2000) - Rs. 7,000
- Credit: Selected Bank Account (e.g., "Primary Bank Account") - Rs. 7,000

**Payment Record:**
- Payment Method: "Bank Transfer" (derived from account type), Amount: Rs. 7,000, Account: Selected Bank Account

### Verification Points
- [ ] Payment record created with correct account reference
- [ ] Accounts Payable: Net Rs. 3,000 (10,000 - 7,000)
- [ ] Selected Bank Account decreased by Rs. 7,000
- [ ] Purchase card shows "Fully Paid"
- [ ] Payment appears in "View Payments" section with account name
- [ ] Journal entry shows payment transaction with account name
- [ ] Transaction linked to purchase invoice
- [ ] Payment record shows account name (not just generic "Bank Transfer")

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
3. Find payment record (shows account name, Rs. 3,000)
4. Click "Edit Payment" (pencil icon)
5. Change:
   - Amount: Rs. 3,000 → Rs. 4,000
   - Payment Account: Keep same account OR change to different Cash/Bank account
6. Save

### Expected Accounting Impact
**Adjustment Transaction:**
- If same account (only amount changed):
  - Debit: Accounts Payable (2000) - Rs. 1,000 (increase payment)
  - Credit: Same Payment Account - Rs. 1,000 (increase payment)
- If account changed (Cash → Bank or Bank → Cash):
  - **Step 1 - Account Transfer:**
    - Credit: Old Payment Account - Rs. 3,000 (money moved out)
    - Debit: New Payment Account - Rs. 3,000 (money moved in)
  - **Step 2 - Amount Adjustment:**
    - Debit: Accounts Payable (2000) - Rs. 1,000 (increase payment)
    - Credit: New Payment Account - Rs. 1,000 (increase payment)

### Verification Points
- [ ] Payment record updated with new amount and account (if changed)
- [ ] Adjustment transaction(s) created correctly
- [ ] Accounts Payable adjusted correctly
- [ ] Payment accounts adjusted correctly (old account credited, new account debited if changed)
- [ ] Journal shows adjustment transaction(s)
- [ ] Transaction linked to purchase invoice
- [ ] Payment record shows updated account name

---

## Test Case 12: Edit Payment - Decrease Amount

### Scenario
Edit payment for PI-003 to decrease from Rs. 12,000 to Rs. 10,000.

### Steps
1. Navigate to Purchases → Find "PI-003"
2. Click "View Details"
3. Find payment record (shows account name, Rs. 12,000)
4. Click "Edit Payment"
5. Change:
   - Amount: Rs. 12,000 → Rs. 10,000
   - Payment Account: Keep same account
6. Save

### Expected Accounting Impact
**Adjustment Transaction:**
- Credit: Accounts Payable (2000) - Rs. 2,000 (reduce payment)
- Debit: Same Payment Account - Rs. 2,000 (get money back)

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
3. Find payment record (shows account name, Rs. 10,000)
4. Click "Edit Payment"
5. Change:
   - Payment Account: Change from Cash account to Bank account (or vice versa)
   - Amount: Rs. 10,000 (unchanged)
6. Save

### Expected Accounting Impact
**Payment Account Change Transaction:**
- Credit: Old Payment Account (e.g., "Main Cash") - Rs. 10,000 (money moved out)
- Debit: New Payment Account (e.g., "Primary Bank Account") - Rs. 10,000 (money moved in)

### Verification Points
- [ ] Payment record updated (account changed, payment method derived from new account type)
- [ ] Payment account change transaction created
- [ ] Old Payment Account increased by Rs. 10,000 (money returned)
- [ ] New Payment Account decreased by Rs. 10,000 (money moved)
- [ ] Accounts Payable unchanged
- [ ] Journal shows payment account change transaction
- [ ] Payment record shows new account name

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
- Cash Accounts: Decreased by Rs. 3,000 (original payment from selected cash account)
- Bank Accounts: Decreased by Rs. 12,000 (7,000 + 5,000 from selected bank accounts)

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
  - Cash Accounts (accountSubType: CASH): Should reflect all cash payments from respective accounts
  - Bank Accounts (accountSubType: BANK): Should reflect all bank payments from respective accounts
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

## Test Case 21: Purchase Invoice with Returns - Reduce AP Method

### Scenario
Create a purchase invoice with both purchases and returns, using "Reduce Accounts Payable" method for returns.

### Steps
1. Navigate to Purchases → Add Purchase
2. Enter:
   - Supplier: "Supplier B - Pending"
   - Invoice Number: "PI-005"
   - Date: Today
3. **Add Purchase Items:**
   - Product: "Product A", Quantity: 10, Unit Price: 1,000, Total: 10,000
   - Product: "Product B", Quantity: 5, Unit Price: 500, Total: 2,500
   - Purchase Total: Rs. 12,500
4. **Add Return Items:**
   - Click "Add Return Item"
   - Product: "Product A", Quantity: 2, Unit Price: 1,000, Total: 2,000
   - Return Total: Rs. 2,000
5. **Return Handling Method:**
   - Select: "Reduce Accounts Payable"
6. Verify:
   - Purchase Total: Rs. 12,500
   - Return Total: Rs. 2,000
   - Net Amount: Rs. 10,500
7. Set Payment Status: "Unpaid"
8. Save

### Expected Accounting Impact
**Transaction - Purchase Invoice (Combined):**
- Debit: Inventory (1300) - Rs. 12,500 (purchases)
- Credit: Inventory (1300) - Rs. 2,000 (returns)
- Debit: Accounts Payable (2000) - Rs. 2,000 (returns reduce AP)
- Credit: Accounts Payable (2000) - Rs. 12,500 (purchases)

**Net Effect:**
- Inventory: +Rs. 10,500 (12,500 - 2,000)
- Accounts Payable: +Rs. 10,500 (12,500 - 2,000)

### Verification Points
- [ ] Purchase invoice created successfully
- [ ] Return record created with returnType: 'SUPPLIER'
- [ ] Return items linked to purchase invoice
- [ ] Inventory increased by net amount (Rs. 10,500)
- [ ] Accounts Payable increased by net amount (Rs. 10,500)
- [ ] Product A quantity: +8 units (10 - 2)
- [ ] Product B quantity: +5 units
- [ ] Product logs created for both purchases and returns
- [ ] Journal entry shows combined transaction
- [ ] Net amount displayed correctly in invoice

---

## Test Case 22: Purchase Invoice with Returns - Refund Method

### Scenario
Create a purchase invoice with returns, using "Refund to Account" method.

### Steps
1. Navigate to Purchases → Add Purchase
2. Enter:
   - Supplier: "Supplier B - Pending"
   - Invoice Number: "PI-006"
   - Date: Today
3. **Add Purchase Items:**
   - Product: "Product C", Quantity: 8, Unit Price: 800, Total: 6,400
4. **Add Return Items:**
   - Product: "Product C", Quantity: 1, Unit Price: 800, Total: 800
5. **Return Handling Method:**
   - Select: "Refund to Account"
   - Payment Account: Select a Cash account (e.g., "Main Cash")
6. Verify:
   - Purchase Total: Rs. 6,400
   - Return Total: Rs. 800
   - Net Amount: Rs. 5,600
7. Set Payment Status: "Unpaid"
8. Save

### Expected Accounting Impact
**Transaction - Purchase Invoice (Combined):**
- Debit: Inventory (1300) - Rs. 6,400 (purchases)
- Credit: Inventory (1300) - Rs. 800 (returns)
- Debit: Selected Cash Account - Rs. 800 (refund)
- Credit: Accounts Payable (2000) - Rs. 6,400 (purchases)

**Net Effect:**
- Inventory: +Rs. 5,600 (6,400 - 800)
- Accounts Payable: +Rs. 5,600 (6,400 - 0, refund doesn't affect AP)
- Selected Cash Account: -Rs. 800 (money refunded)

### Verification Points
- [ ] Purchase invoice created successfully
- [ ] Return record created
- [ ] Inventory increased by net amount (Rs. 5,600)
- [ ] Accounts Payable increased by Rs. 5,600 (not affected by refund)
- [ ] Selected Cash Account decreased by Rs. 800
- [ ] Product C quantity: +7 units (8 - 1)
- [ ] Product logs show DECREASE action for return
- [ ] Journal entry shows refund transaction
- [ ] Return handling method stored correctly

---

## Test Case 23: Purchase Invoice - Returns Only (No Purchases)

### Scenario
Create a purchase invoice with only return items (no new purchases).

### Steps
1. Navigate to Purchases → Add Purchase
2. Enter:
   - Supplier: "Supplier B - Pending"
   - Invoice Number: "PI-007"
   - Date: Today
3. **Skip Purchase Items** (or leave empty - but system requires at least one)
   - Note: System may require at least one purchase item. If so, add minimal item.
4. **Add Return Items:**
   - Product: "Product A", Quantity: 3, Unit Price: 1,000, Total: 3,000
   - Product: "Product B", Quantity: 2, Unit Price: 500, Total: 1,000
   - Return Total: Rs. 4,000
5. **Return Handling Method:**
   - Select: "Reduce Accounts Payable"
6. Verify:
   - Net Amount: Rs. 0 (if purchase total = return total) or negative
   - System should validate: return total cannot exceed purchase total
7. Save (if validation allows)

### Expected Accounting Impact
**If Allowed:**
- Credit: Inventory (1300) - Rs. 4,000 (returns)
- Debit: Accounts Payable (2000) - Rs. 4,000 (reduces AP)

### Verification Points
- [ ] System validates return total ≤ purchase total
- [ ] If validation fails, appropriate error shown
- [ ] If allowed, accounting entries created correctly
- [ ] Inventory decreased by return amount
- [ ] Accounts Payable decreased by return amount
- [ ] Product quantities decreased correctly
- [ ] Product logs created for returns

---

## Test Case 24: Scan Invoice Integration - Purchase and Returns

### Scenario
Use scan invoice functionality in Add Purchase page to extract both purchase and return items.

### Prerequisites
- Have an invoice image or text ready for scanning
- Invoice should contain both positive quantities (purchases) and negative quantities (returns)

### Steps
1. Navigate to Purchases → Add Purchase
2. Click "Scan Invoice" button (top right, with camera icon)
3. Upload invoice image or use camera
4. Wait for AI processing
5. Verify extracted data:
   - Purchase items populated in "Products" section
   - Return items populated in "Return Items" section
   - Invoice details (number, date) pre-filled if available
6. Review and edit extracted items if needed
7. Select return handling method (if returns exist)
8. Complete form and save

### Expected Behavior
- Scan modal opens from Add Purchase page
- AI extracts products (positive quantities) and returns (negative quantities)
- Both sections populated automatically
- User can edit before saving
- Form submission includes both purchase and return items

### Verification Points
- [ ] Scan button visible in Add Purchase page header
- [ ] Scan modal opens correctly
- [ ] Purchase items extracted and populated
- [ ] Return items extracted and populated
- [ ] Invoice details pre-filled (if available)
- [ ] User can edit extracted data
- [ ] Form saves with both purchases and returns
- [ ] Accounting entries created correctly
- [ ] Inventory updated correctly

---

## Test Case 25: Edit Purchase Invoice - Add Returns

### Scenario
Edit an existing purchase invoice to add return items.

### Steps
1. Navigate to Purchases → Find "PI-005" (from Test Case 21)
2. Click "Edit"
3. **Add Return Items:**
   - Click "Add Return Item"
   - Product: "Product B", Quantity: 1, Unit Price: 500, Total: 500
4. **Return Handling Method:**
   - Select: "Reduce Accounts Payable" (if not already selected)
5. Verify:
   - Old Return Total: Rs. 2,000
   - New Return Total: Rs. 2,500
   - Net Amount updated accordingly
6. Save

### Expected Accounting Impact
**Adjustment Transaction:**
- Credit: Inventory (1300) - Rs. 500 (additional return)
- Debit: Accounts Payable (2000) - Rs. 500 (reduce AP further)

### Verification Points
- [ ] Purchase invoice updated
- [ ] Return items added successfully
- [ ] Adjustment transaction created
- [ ] Inventory decreased by additional Rs. 500
- [ ] Accounts Payable decreased by additional Rs. 500
- [ ] Product B quantity decreased by 1 unit
- [ ] Product log created for return
- [ ] Net amount recalculated correctly

---

## Test Case 26: Edit Purchase Invoice - Remove Returns

### Scenario
Edit a purchase invoice to remove return items.

### Steps
1. Navigate to Purchases → Find "PI-005"
2. Click "Edit"
3. **Remove Return Items:**
   - Delete one or all return items
4. Verify:
   - Return Total: Rs. 0 (or reduced)
   - Net Amount updated
5. Save

### Expected Accounting Impact
**Adjustment Transaction (Reversing Return):**
- Debit: Inventory (1300) - Rs. 2,500 (reverse returns)
- Credit: Accounts Payable (2000) - Rs. 2,500 (reverse AP reduction)

### Verification Points
- [ ] Return items removed successfully
- [ ] Adjustment transaction created (reversing returns)
- [ ] Inventory increased (returns reversed)
- [ ] Accounts Payable increased (returns reversed)
- [ ] Product quantities increased (returns reversed)
- [ ] Product logs show INCREASE action (reversing return)
- [ ] Net amount recalculated correctly

---

## Test Case 27: Edit Purchase Invoice - Change Return Handling Method

### Scenario
Edit a purchase invoice to change return handling method from "Reduce AP" to "Refund".

### Steps
1. Navigate to Purchases → Find "PI-005"
2. Click "Edit"
3. **Change Return Handling Method:**
   - From: "Reduce Accounts Payable"
   - To: "Refund to Account"
   - Select Payment Account: Choose a Cash account
4. Verify return items still present
5. Save

### Expected Accounting Impact
**Step 1 - Reverse Old Method:**
- Debit: Inventory (1300) - Rs. 2,500 (reverse return)
- Credit: Accounts Payable (2000) - Rs. 2,500 (reverse AP reduction)

**Step 2 - Apply New Method:**
- Credit: Inventory (1300) - Rs. 2,500 (return)
- Debit: Selected Cash Account - Rs. 2,500 (refund)

**Net Effect:**
- Accounts Payable: +Rs. 2,500 (AP no longer reduced)
- Selected Cash Account: -Rs. 2,500 (money refunded)

### Verification Points
- [ ] Return handling method changed successfully
- [ ] Old method transaction reversed
- [ ] New method transaction created
- [ ] Accounts Payable adjusted correctly
- [ ] Cash account decreased (refund)
- [ ] Inventory unchanged (return still processed)
- [ ] Journal shows both reversal and new transaction

---

## Test Case 28: Edit Purchase Invoice - Update Return Item Quantity

### Scenario
Edit a purchase invoice to change return item quantity.

### Steps
1. Navigate to Purchases → Find "PI-005"
2. Click "Edit"
3. **Update Return Item:**
   - Find return item: "Product A", Quantity: 2
   - Change Quantity: 2 → 3
   - Return Total: Rs. 2,000 → Rs. 3,000
4. Save

### Expected Accounting Impact
**Adjustment Transaction:**
- Credit: Inventory (1300) - Rs. 1,000 (additional return)
- Debit: Accounts Payable (2000) - Rs. 1,000 (further reduce AP)

### Verification Points
- [ ] Return item quantity updated
- [ ] Adjustment transaction created
- [ ] Inventory decreased by additional Rs. 1,000
- [ ] Accounts Payable decreased by additional Rs. 1,000
- [ ] Product A quantity decreased by additional 1 unit
- [ ] Product log shows quantity change
- [ ] Net amount recalculated correctly

---

## Test Case 29: Scan Invoice - Returns Only Detection

### Scenario
Scan an invoice that contains only return items (negative quantities).

### Steps
1. Navigate to Purchases → Add Purchase
2. Click "Scan Invoice"
3. Upload invoice with only return items (negative quantities)
4. Verify:
   - Return items extracted
   - Purchase items section may be empty or minimal
5. Add at least one purchase item (if system requires)
6. Complete form and save

### Expected Behavior
- AI correctly identifies negative quantities as returns
- Return items populated in Return Items section
- System validates return total ≤ purchase total

### Verification Points
- [ ] Returns correctly identified from scan
- [ ] Return items populated correctly
- [ ] Validation works correctly
- [ ] Form can be saved with proper data

---

## Test Case 30: Inventory Validation for Returns

### Scenario
Test inventory validation when returning products that don't exist or have insufficient stock.

### Steps
1. Create purchase invoice with Product X, Quantity: 5
2. Verify Product X quantity: 5
3. Edit purchase invoice
4. Add return item: Product X, Quantity: 10 (exceeds available)
5. Try to save

### Expected Behavior
- System should warn about insufficient stock
- May allow or prevent saving based on business logic
- If allowed, inventory goes negative (or to 0)

### Verification Points
- [ ] System validates sufficient inventory for returns
- [ ] Warning shown if insufficient stock
- [ ] Product log created even if inventory goes negative
- [ ] Accounting entries created correctly regardless

---

## Test Case 31: Complex Scenario - Purchase with Returns and Multiple Payments

### Scenario
Create purchase with returns, then make payments, then edit returns.

### Steps
1. Create Purchase Invoice:
   - Purchase: Rs. 20,000
   - Returns: Rs. 3,000 (Reduce AP method)
   - Net: Rs. 17,000
   - Payment: Unpaid
2. Make Payment: Rs. 10,000 (Bank)
3. Edit Invoice:
   - Add Return: Rs. 2,000 more
   - Change Return Method: To "Refund" (Cash)
4. Make Another Payment: Rs. 5,000 (Cash)

### Expected Final State
- Inventory: Rs. 15,000 (20,000 - 3,000 - 2,000)
- Accounts Payable: Rs. 2,000 (17,000 - 10,000 - 5,000)
- Bank Account: -Rs. 10,000
- Cash Account: -Rs. 7,000 (2,000 refund + 5,000 payment)

### Verification Points
- [ ] All transactions created correctly
- [ ] Return method change handled correctly
- [ ] Payments applied correctly
- [ ] Accounts balanced
- [ ] Journal shows all transactions

---

## Test Case 32: Scan Invoice Not Available in Edit Mode

### Scenario
Verify scan invoice button is NOT available in Edit Purchase page.

### Steps
1. Navigate to Purchases → Find any invoice
2. Click "Edit"
3. Verify UI

### Expected Behavior
- No "Scan Invoice" button visible in Edit Purchase page
- Only manual entry available

### Verification Points
- [ ] Scan button NOT visible in Edit Purchase page
- [ ] Only manual entry available
- [ ] Existing return items can be edited manually

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
- [ ] Create purchase with returns (Reduce AP method)
- [ ] Create purchase with returns (Refund method)
- [ ] Create purchase with returns only (if allowed)
- [ ] Edit purchase (increase amount)
- [ ] Edit purchase (decrease amount)
- [ ] Edit purchase (change products)
- [ ] Edit purchase (add returns)
- [ ] Edit purchase (remove returns)
- [ ] Edit purchase (update return quantities)
- [ ] Edit purchase (change return handling method)

### Payment Operations
- [ ] Make payment from purchase card (select cash account)
- [ ] Make payment from purchase card (select bank account)
- [ ] Make payment using advance
- [ ] Create new payment account on-the-fly (Quick Add Account)
- [ ] Edit payment (increase amount, same account)
- [ ] Edit payment (decrease amount, same account)
- [ ] Edit payment (change account only, same amount)
- [ ] Edit payment (change amount + account)

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
- [ ] Product balance decreases on returns
- [ ] Product balance updates on return edit
- [ ] Product balance accurate

### Purchase Returns
- [ ] Return items can be added to purchase invoice
- [ ] Return handling method selection works (Reduce AP / Refund)
- [ ] Return items decrease inventory correctly
- [ ] Return items create correct accounting entries
- [ ] Return items can be edited
- [ ] Return items can be removed
- [ ] Return handling method can be changed
- [ ] Product logs created for returns
- [ ] Net amount calculation correct (purchases - returns)

### Scan Invoice Integration
- [ ] Scan button visible in Add Purchase page
- [ ] Scan button NOT visible in Edit Purchase page
- [ ] Scan extracts purchase items correctly
- [ ] Scan extracts return items correctly
- [ ] Extracted data can be edited before saving
- [ ] Invoice details pre-filled from scan
- [ ] Scan modal works correctly

---

## Notes
- Always verify accounting after each operation
- Check journal entries for proper descriptions
- Verify transaction linking to purchase invoices
- Ensure all accounts remain balanced
- Product balances should match inventory transactions
- **Multiple Payment Accounts**: Users can create and manage multiple cash and bank accounts
- **Account Selection**: Always select a specific payment account (not generic "Cash" or "Bank")
- **Quick Add Account**: New accounts can be created on-the-fly from purchase and payment forms
- **Account Names**: Payment records show actual account names (e.g., "Main Cash", "Primary Bank Account") instead of generic types
- **Account Changes**: When payment account changes, a transfer transaction is created between old and new accounts
- **Purchase Returns**: Purchase invoices can include return items that decrease inventory and adjust accounting entries
- **Return Handling Methods**: Returns can be handled via "Reduce Accounts Payable" (reduces what we owe) or "Refund to Account" (supplier refunds money)
- **Net Amount Calculation**: Purchase invoices show net amount (purchases - returns) for accurate accounting
- **Scan Invoice Integration**: Scan invoice functionality is available in Add Purchase page only (not in Edit mode)
- **Return Items in Edit Mode**: Return items can be added, removed, or updated in edit mode with proper accounting adjustments

