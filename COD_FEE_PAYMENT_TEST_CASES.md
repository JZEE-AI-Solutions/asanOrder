# Comprehensive Test Cases: COD Fee Payment Configuration

## Test Environment Setup
- Tenant: Test Tenant
- Chart of Accounts should be initialized
- Logistics Company with COD fee calculation configured
- Products with known prices
- Test orders in PENDING status

---

## Test Case 1: Order Confirmation - Business Owner Pays COD Fee

### Objective
Verify that when business owner pays COD fee, the order total does NOT include COD fee, and accounting entries are created correctly.

### Steps
1. Create a PENDING order with:
   - Products: 2 units @ Rs. 1,000 each = Rs. 2,000
   - Shipping: Rs. 200
   - Payment: Rs. 500 (partial)
   - COD Amount: Rs. 1,700
   - Logistics Company: Configured with 2.5% COD fee
   - Expected COD Fee: Rs. 42.50 (1,700 * 2.5%)

2. Confirm order with `codFeePaidBy: 'BUSINESS_OWNER'`

3. Verify order details:
   - Status: CONFIRMED
   - `codFeePaidBy`: 'BUSINESS_OWNER'
   - `codFee`: Rs. 42.50
   - `codAmount`: Rs. 1,700

### Expected Results
- ✅ Order confirmed successfully
- ✅ Order total = Rs. 2,200 (Products + Shipping, NO COD fee)
- ✅ COD fee stored but NOT added to order total

### Accounting Verification
**AR Transaction:**
- Debit: Accounts Receivable (1200) - Rs. 2,200
- Credit: Sales Revenue (4000) - Rs. 2,000
- Credit: Shipping Revenue (4200) - Rs. 200
- ❌ COD Fee Revenue (4400) - NOT created

**COD Fee Expense Transaction:**
- Debit: COD Fee Expense (5200) - Rs. 42.50
- Credit: COD Fee Payable (2200) - Rs. 42.50

**Prepayment Transaction (if paymentAmount > 0):**
- Debit: Cash/Bank Account - Rs. 500
- Credit: Accounts Receivable - Rs. 500

### Database Verification
- [ ] `Order.status` = 'CONFIRMED'
- [ ] `Order.codFeePaidBy` = 'BUSINESS_OWNER'
- [ ] `Order.codFee` = 42.50
- [ ] `Order.codAmount` = 1700
- [ ] `Transaction` records created (AR + COD Expense + Prepayment)
- [ ] `TransactionLine` records balanced (Debits = Credits)
- [ ] Account balances updated correctly

---

## Test Case 2: Order Confirmation - Customer Pays COD Fee

### Objective
Verify that when customer pays COD fee, the order total INCLUDES COD fee, and accounting entries include COD Fee Revenue.

### Steps
1. Create a PENDING order with:
   - Products: 2 units @ Rs. 1,000 each = Rs. 2,000
   - Shipping: Rs. 200
   - Payment: Rs. 500 (partial)
   - COD Amount: Rs. 1,700
   - Logistics Company: Configured with 2.5% COD fee
   - Expected COD Fee: Rs. 42.50

2. Confirm order with `codFeePaidBy: 'CUSTOMER'`

3. Verify order details:
   - Status: CONFIRMED
   - `codFeePaidBy`: 'CUSTOMER'
   - `codFee`: Rs. 42.50
   - `codAmount`: Rs. 1,700

### Expected Results
- ✅ Order confirmed successfully
- ✅ Order total = Rs. 2,242.50 (Products + Shipping + COD fee)
- ✅ COD fee added to order total

### Accounting Verification
**AR Transaction:**
- Debit: Accounts Receivable (1200) - Rs. 2,242.50 (INCLUDES COD fee)
- Credit: Sales Revenue (4000) - Rs. 2,000
- Credit: Shipping Revenue (4200) - Rs. 200
- ✅ Credit: COD Fee Revenue (4400) - Rs. 42.50

**COD Fee Expense Transaction:**
- Debit: COD Fee Expense (5200) - Rs. 42.50 (business still pays logistics)
- Credit: COD Fee Payable (2200) - Rs. 42.50

**Prepayment Transaction:**
- Debit: Cash/Bank Account - Rs. 500
- Credit: Accounts Receivable - Rs. 500

### Database Verification
- [ ] `Order.status` = 'CONFIRMED'
- [ ] `Order.codFeePaidBy` = 'CUSTOMER'
- [ ] `Order.codFee` = 42.50
- [ ] `Order.codAmount` = 1700
- [ ] `Transaction` records created (AR + COD Expense + Prepayment)
- [ ] `TransactionLine` with COD Fee Revenue (4400) exists
- [ ] Account balances updated correctly

---

## Test Case 3: Order Edit - Change COD Fee Payment Preference

### Objective
Verify that COD fee payment preference can be changed in edit mode.

### Steps
1. Create and confirm an order with `codFeePaidBy: 'BUSINESS_OWNER'`

2. Edit the order and change `codFeePaidBy` to 'CUSTOMER'

3. Verify the change:
   - `codFeePaidBy` updated to 'CUSTOMER'

4. Edit again and change back to 'BUSINESS_OWNER'

5. Verify the change:
   - `codFeePaidBy` updated to 'BUSINESS_OWNER'

### Expected Results
- ✅ Order can be edited
- ✅ `codFeePaidBy` field can be updated
- ✅ Changes persist in database

### Database Verification
- [ ] `Order.codFeePaidBy` updated correctly
- [ ] `Order.updatedAt` timestamp updated

---

## Test Case 4: Customer Balance Calculation with COD Fee

### Objective
Verify that customer balance calculations correctly include/exclude COD fee based on payment preference.

### Steps
1. Create two orders for the same customer:
   - Order A: Customer pays COD fee (`codFeePaidBy: 'CUSTOMER'`)
   - Order B: Business pays COD fee (`codFeePaidBy: 'BUSINESS_OWNER'`)

2. Calculate customer balance

3. Verify:
   - Order A total includes COD fee
   - Order B total does NOT include COD fee

### Expected Results
- ✅ Customer balance calculation includes COD fee when customer pays
- ✅ Customer balance calculation excludes COD fee when business pays
- ✅ Pending amount calculated correctly for each order

### Database Verification
- [ ] `Customer.totalOrders` = 2
- [ ] `Customer.totalSpent` includes COD fee from Order A only
- [ ] Balance service returns correct order totals

---

## Test Case 5: Profit Calculation Validation

### Objective
Verify that profit calculations correctly handle COD fee revenue and expense.

### Steps
1. Create two orders:
   - Order A: Customer pays COD fee
   - Order B: Business pays COD fee

2. Calculate profit statistics

3. Verify:
   - Order A revenue includes COD fee
   - Order B revenue does NOT include COD fee
   - Both orders have COD fee expense
   - Total profit calculated correctly

### Expected Results
- ✅ Revenue includes COD fee when customer pays
- ✅ Revenue excludes COD fee when business pays
- ✅ COD fee expense recorded for both scenarios
- ✅ Profit = Revenue - Cost (including COD fee expense)
- ✅ Total profit accounts for both scenarios correctly

### Profit Calculation Details
**Order A (Customer Pays):**
- Revenue: Products + Shipping + COD Fee = 2,000 + 200 + 42.50 = 2,242.50
- Cost: Product Cost + Shipping Cost = 1,200 + 200 = 1,400
- COD Fee Expense: 42.50 (reduces profit)
- Profit: 2,242.50 - 1,400 - 42.50 = 800

**Order B (Business Pays):**
- Revenue: Products + Shipping = 2,000 + 200 = 2,200
- Cost: Product Cost + Shipping Cost = 1,200 + 200 = 1,400
- COD Fee Expense: 42.50 (reduces profit)
- Profit: 2,200 - 1,400 - 42.50 = 757.50

**Total Profit:**
- Total Revenue: 2,242.50 + 2,200 = 4,442.50
- Total Cost: 1,400 + 1,400 = 2,800
- Total COD Fee Expense: 42.50 + 42.50 = 85
- Total Profit: 4,442.50 - 2,800 - 85 = 1,557.50

### Database Verification
- [ ] Profit service returns correct revenue for each order
- [ ] Profit service includes COD fee in revenue when customer pays
- [ ] Profit service excludes COD fee from revenue when business pays
- [ ] Total profit calculated correctly

---

## Test Case 6: Edge Cases

### 6.1 Order Without COD Fee
**Objective:** Verify system handles orders without COD fee gracefully.

**Steps:**
1. Create order with full prepayment (no COD amount)
2. Confirm order with any `codFeePaidBy` preference
3. Verify COD fee fields are null

**Expected Results:**
- ✅ Order confirmed successfully
- ✅ `codFee` = null
- ✅ `codAmount` = null
- ✅ `codFeePaidBy` = 'BUSINESS_OWNER' (default)
- ✅ No COD fee accounting entries created

### 6.2 Default Behavior
**Objective:** Verify default behavior when `codFeePaidBy` not provided.

**Steps:**
1. Create order with COD amount
2. Confirm order without specifying `codFeePaidBy`
3. Verify defaults to 'BUSINESS_OWNER'

**Expected Results:**
- ✅ Order confirmed successfully
- ✅ `codFeePaidBy` = 'BUSINESS_OWNER' (default)
- ✅ Order total does NOT include COD fee

### 6.3 Order Total Calculation in UI
**Objective:** Verify frontend calculates order total correctly.

**Steps:**
1. View order with `codFeePaidBy: 'CUSTOMER'`
2. Verify displayed order total includes COD fee
3. View order with `codFeePaidBy: 'BUSINESS_OWNER'`
4. Verify displayed order total does NOT include COD fee

**Expected Results:**
- ✅ UI shows correct order total based on `codFeePaidBy`
- ✅ Real-time calculation updates when preference changes

---

## Test Summary Checklist

### Pre-Test Setup
- [ ] Backend server running
- [ ] Database accessible
- [ ] Test tenant created
- [ ] Chart of accounts initialized
- [ ] Logistics company configured
- [ ] Test products created

### Test Execution
- [ ] Test Case 1: Business Owner Pays COD Fee - PASSED
- [ ] Test Case 2: Customer Pays COD Fee - PASSED
- [ ] Test Case 3: Order Edit - Change Preference - PASSED
- [ ] Test Case 4: Customer Balance Calculation - PASSED
- [ ] Test Case 5: Profit Calculation Validation - PASSED
- [ ] Test Case 6: Edge Cases - PASSED

### Post-Test Validation
- [ ] All accounting entries balanced (Debits = Credits)
- [ ] Account balances correct
- [ ] Order totals calculated correctly
- [ ] Profit calculations accurate
- [ ] No data corruption
- [ ] All relationships intact

---

## Running the Tests

### Using Jest (Recommended)
```bash
cd backend
npm test -- cod-fee-payment.test.js
```

### Using Node.js (Standalone)
```bash
cd backend
node tests/cod-fee-payment.test.js
```

### Test Coverage
```bash
cd backend
npm run test:coverage -- cod-fee-payment.test.js
```

---

## Expected Test Results

### Test Case 1: Business Owner Pays COD Fee ✅
- Order confirmed with BUSINESS_OWNER preference
- Order total = 2,200 (no COD fee)
- Accounting entries created correctly
- COD Fee Revenue NOT created
- COD Fee Expense created

### Test Case 2: Customer Pays COD Fee ✅
- Order confirmed with CUSTOMER preference
- Order total = 2,242.50 (includes COD fee)
- Accounting entries created correctly
- COD Fee Revenue created
- COD Fee Expense created

### Test Case 3: Order Edit ✅
- COD fee payment preference can be changed
- Changes persist in database

### Test Case 4: Customer Balance ✅
- Balance includes COD fee when customer pays
- Balance excludes COD fee when business pays

### Test Case 5: Profit Calculation ✅
- Revenue includes COD fee when customer pays
- Revenue excludes COD fee when business pays
- Total profit calculated correctly

### Test Case 6: Edge Cases ✅
- Orders without COD fee handled gracefully
- Default behavior works correctly
- UI calculations correct

---

## Notes

1. **COD Fee Calculation**: Based on logistics company configuration (percentage, range-based, or fixed)
2. **Accounting Impact**: COD fee affects revenue when customer pays, expense always recorded
3. **Profit Impact**: COD fee revenue increases profit when customer pays, expense always reduces profit
4. **Backward Compatibility**: Existing orders without `codFeePaidBy` default to 'BUSINESS_OWNER'
5. **Edit Mode**: COD fee payment preference can be changed in edit mode for confirmed orders

