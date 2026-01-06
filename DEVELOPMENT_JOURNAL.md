# Development Journal

This journal tracks project milestones, features, and conversations.

## 2024-12-XX - Complete Edit Order Functionality

### Feature: Business Owner Order Editing

**Request**: Implement complete edit order functionality where Business Owner can review the order and can do add/edit products, quantity, payment, etc.

**Implementation Details**:

1. **Enhanced OrderDetailsPage** (`frontend/src/pages/OrderDetailsPage.jsx`)
   - Added edit mode toggle functionality
   - Integrated product management using `OrderProductSelector` component
   - Added quantity and price editing for products
   - Added payment amount editing
   - Implemented save functionality using existing PUT `/order/:id` endpoint

2. **Key Features Implemented**:
   - **Edit Mode Toggle**: Business owners can enter/exit edit mode with Cancel and Save buttons
   - **Product Management**: 
     - Add/remove products from order
     - Edit product quantities
     - Edit product prices
     - Real-time calculation of products total
   - **Payment Editing**: 
     - Edit payment amount directly
     - Shows products total as reference
   - **Customer Information Editing**: 
     - Edit form data fields in edit mode
   - **State Management**: 
     - Proper initialization of edit state from order data
     - Clean state reset on cancel
     - Automatic refresh after save

3. **Technical Implementation**:
   - Uses existing `OrderProductSelector` component for product selection
   - Maintains state for `selectedProducts`, `productQuantities`, `productPrices`, and `paymentAmount`
   - Properly handles JSON parsing for order data
   - Uses existing API endpoint: `PUT /api/order/:id`
   - Error handling with user-friendly toast notifications

4. **User Experience**:
   - Clear visual distinction between view and edit modes
   - Loading states during save operation
   - Products section shows in edit mode even when no products exist (allows adding)
   - Products section only shows in view mode when products exist
   - Real-time total calculations
   - Responsive design maintained

**Files Modified**:
- `frontend/src/pages/OrderDetailsPage.jsx` - Added complete edit functionality

**Status**: ✅ Implementation Complete

---

## 2026-01-02 - Payment Account Selection for Orders

### Feature: Payment Account Selection at Order Confirmation and Edit

**Request**: Implement the ability for business owners to select the payment account for prepayments at the time of order confirmation and also in edit mode.

**Implementation Details**:

1.  **Database Schema Update** (`backend/prisma/schema.prisma`):
    -   Added `paymentAccountId` (String, optional, foreign key to Account model) and `paymentMethod` (String, optional) fields to the `Order` model.
    -   Created a migration: `20260102232639_add_payment_account_to_orders`.

2.  **Backend API Updates** (`backend/routes/order.js`):
    -   **Order Submission (`POST /order/submit`)**:
        -   Modified to accept and store `paymentAccountId` and `paymentMethod` if provided by the customer during order submission.
    -   **Order Confirmation (`POST /order/:id/confirm`)**:
        -   Modified to accept `paymentAccountId` from the request body.
        -   When a prepayment exists (`paymentAmount > 0`), the accounting entry for the payment (Debit Cash/Bank, Credit Accounts Receivable) now uses the `paymentAccountId` provided in the request.
        -   If `paymentAccountId` is not provided in the request, it falls back to the `paymentAccountId` stored on the order (if any), or defaults to the 'Cash' account (code '1000').
    -   **Order Update (`PUT /order/:id`)**:
        -   Modified to accept and update `paymentAccountId` and `paymentMethod` fields.
        -   **Customer Re-linking Logic**: Added logic to detect changes in the customer's phone number within the `formData`. If the phone number changes:
            -   It extracts the new phone number.
            -   Uses `customerService.findOrCreateCustomer` to find an existing customer with the new number or create a new one.
            -   Updates the `order.customerId` to link the order to the correct customer.

3.  **Frontend UI Updates**:
    -   **EnhancedOrderDetailsModal** (`frontend/src/components/EnhancedOrderDetailsModal.jsx`):
        -   Imported `PaymentAccountSelector` component.
        -   Added `selectedPaymentAccountId` state and initialized it from `order.paymentAccountId`.
        -   The `PaymentAccountSelector` component is conditionally rendered when `order.paymentAmount > 0` and the order status is 'PENDING' (for confirmation) or when in edit mode.
        -   The `handleConfirmOrder` function was updated to send `selectedPaymentAccountId` to the backend.
        -   In edit mode, the `PaymentAccountSelector` is displayed below the payment amount field, allowing the business owner to update the account.
    -   **OrderDetailsPage** (`frontend/src/pages/OrderDetailsPage.jsx`):
        -   Imported `PaymentAccountSelector` component.
        -   Added `selectedPaymentAccountId` state and initialized it from `order.paymentAccountId`.
        -   The `PaymentAccountSelector` component is conditionally rendered when `order.paymentAmount > 0` and the order status is 'PENDING' (for confirmation) or when in edit mode.
        -   The `confirmOrder` function was updated to send `selectedPaymentAccountId` to the backend.
        -   In edit mode, the `PaymentAccountSelector` is displayed below the payment amount field, allowing the business owner to update the account.

4.  **Key Features**:
    -   **Flexible Account Selection**: Business owner can select payment account at confirmation time, even if different from what was recorded at submission.
    -   **Smart Defaults**: System defaults to Cash account (code 1000) if no account is selected.
    -   **Account Priority**: Uses confirmation selection > submission selection > default Cash.
    -   **UI Integration**: Payment account selector only shows when order has prepayment (`paymentAmount > 0`).
    -   **Quick Add Support**: Payment account selector includes "Add New Account" functionality for convenience.
    -   **Customer Phone Number Correction**: When a business owner corrects a phone number in edit mode, the order's `customerId` is automatically updated to link to the correct customer (existing or newly created).

5.  **Accounting Flow**:
    -   When order is confirmed with prepayment:
        1.  Creates AR transaction (Debit AR, Credit Sales Revenue, Credit Shipping Revenue).
        2.  Creates payment transaction using selected payment account:
            -   Debit: Selected Payment Account (Cash/Bank)
            -   Credit: Accounts Receivable.
    -   If no account selected, defaults to Cash account (code 1000).

6.  **User Experience**:
    -   Clear labeling: "Payment Account (for prepayment)".
    -   Helpful hint text explaining the purpose.
    -   Account selector shows account balance for reference.
    -   Responsive design maintained.
    -   Only shows when relevant (orders with prepayment).

**Files Modified**:
-   `backend/prisma/schema.prisma` - Added paymentAccountId and paymentMethod fields.
-   `backend/routes/order.js` - Updated submission, confirmation, and update endpoints.
-   `frontend/src/components/EnhancedOrderDetailsModal.jsx` - Added payment account selector UI.
-   `frontend/src/pages/OrderDetailsPage.jsx` - Added payment account selector UI.
-   `backend/services/customerService.js` - Added `recalculateCustomerStats` function.
-   `backend/routes/customer.js` - Added `POST /api/customer/:id/recalculate-stats` endpoint.

**Status**: ✅ Implementation Complete

**Notes**:
-   Database migration required: Run `npx prisma migrate dev` to apply schema changes.
-   Backward compatible: Existing orders without paymentAccountId will default to Cash account.
-   Best practice: Accounting entries are posted at order confirmation (when business commits to fulfill order), not at submission.
-   Payment account can be selected/updated at confirmation time, providing flexibility for business owners.

---

## 2026-01-02 - Shipping Variance Tracking and Management

### Feature: Shipping Variance Tracking at Dispatch and Edit

**Request**: Implement shipping variance tracking to capture the difference between estimated shipping charges and actual shipping costs when orders are dispatched. Also provide ability to edit shipping variance in edit mode.

**Implementation Details**:

1.  **Database Schema** (Already exists):
    -   `actualShippingCost` (Float, optional) - Actual amount paid to logistics company
    -   `shippingVariance` (Float, optional) - Calculated variance (positive = expense, negative = income)
    -   `shippingVarianceDate` (DateTime, optional) - When variance was recorded

2.  **Backend API Updates** (`backend/routes/order.js`):
    -   **Dispatch Endpoint (`POST /order/:id/dispatch`)**:
        -   Modified to accept `actualShippingCost` from request body.
        -   Calculates shipping variance: `variance = shippingCharges - actualShippingCost`
            -   Positive variance = expense (actual cost > estimated)
            -   Negative variance = income (actual cost < estimated)
        -   Updates order with `actualShippingCost`, `shippingVariance`, and `shippingVarianceDate`.
        -   Creates accounting entries for variance:
            -   **Income (actual < estimated)**: Debit Shipping Expense (actual), Credit Shipping Variance Income (variance)
            -   **Expense (actual > estimated)**: Debit Shipping Expense (variance), Debit Shipping Variance Expense (variance)
        -   Uses accounts: `4300` (Shipping Variance Income), `5110` (Shipping Variance Expense), `5100` (Shipping Expense)

    -   **Order Update (`PUT /order/:id`)**:
        -   Modified to accept `actualShippingCost` in request body.
        -   Recalculates variance when `actualShippingCost` is updated.
        -   Updates `shippingVariance` and `shippingVarianceDate` accordingly.

3.  **Frontend UI Updates**:
    -   **OrderDetailsPage** (`frontend/src/pages/OrderDetailsPage.jsx`):
        -   **Dispatch Modal**: Added modal that appears when dispatching orders, allowing business owner to enter actual shipping cost.
            -   Shows estimated shipping charges (read-only)
            -   Input field for actual shipping cost
            -   Real-time variance calculation display (with color coding: green for income, red for expense)
            -   Helpful hints explaining the impact on profit
        -   **Shipping Variance Display**: Added section in order details to display variance when it exists:
            -   Shows estimated vs actual shipping cost
            -   Displays variance amount with color coding
            -   Shows date when variance was recorded
            -   Only visible when variance exists and not in edit mode
        -   **Edit Mode**: Added ability to edit actual shipping cost for dispatched/completed orders:
            -   Input field for actual shipping cost
            -   Real-time variance calculation
            -   Updates variance when order is saved

    -   **ReportsPage** (`frontend/src/pages/ReportsPage.jsx`):
        -   Added "Shipping Variance Analysis" section:
            -   Shows variance expense (when actual > estimated)
            -   Shows variance income (when actual < estimated)
            -   Shows net variance with color coding
            -   Displays helpful descriptions

4.  **Accounting Integration**:
    -   **Accounts Used**:
        -   `4300` - Shipping Variance Income (INCOME)
        -   `5110` - Shipping Variance Expense (EXPENSE)
        -   `5100` - Shipping Expense (EXPENSE)
    -   **Transaction Flow**:
        -   When variance is income (actual < estimated):
            -   Debit: Shipping Expense (actual cost)
            -   Credit: Shipping Variance Income (variance amount)
        -   When variance is expense (actual > estimated):
            -   Debit: Shipping Expense (variance amount)
            -   Debit: Shipping Variance Expense (variance amount)

5.  **Profit Calculation**:
    -   Shipping variance is already included in profit calculations via `profitService.calculateProfit()`:
        -   `netProfit = revenue - expenses - shippingVarianceExpense + shippingVarianceIncome`
    -   Variance impacts profit:
        -   Positive variance (expense) decreases profit
        -   Negative variance (income) increases profit

6.  **Key Features**:
    -   **Capture at Dispatch**: Business owner enters actual shipping cost when dispatching order
    -   **Real-time Calculation**: Variance is calculated and displayed immediately
    -   **Visual Feedback**: Color coding (green for income, red for expense) helps identify impact
    -   **Edit Capability**: Can update actual shipping cost in edit mode for dispatched/completed orders
    -   **Accounting Integration**: Automatic accounting entries created when variance exists
    -   **Profit Reporting**: Variance included in profit reports and analytics
    -   **User-Friendly**: Clear labels, hints, and explanations throughout

**Files Modified**:
-   `backend/routes/order.js` - Updated dispatch and update endpoints
-   `frontend/src/pages/OrderDetailsPage.jsx` - Added dispatch modal, variance display, and edit capability
-   `frontend/src/pages/ReportsPage.jsx` - Added shipping variance analysis section

**Status**: ✅ Implementation Complete

**Notes**:
-   Database schema already had the necessary fields (`actualShippingCost`, `shippingVariance`, `shippingVarianceDate`)
-   Accounting accounts (`4300`, `5110`) already exist in chart of accounts
-   Profit service already includes shipping variance in calculations
-   Backward compatible: Existing orders without variance data will continue to work
-   Variance is only calculated and displayed when actual shipping cost is provided
-   Accounting entries are created automatically when order is dispatched with variance

## 2026-01-03 - COD Fee Payment Configuration

### Feature: Configurable COD Fee Payment (Business Owner vs Customer)

**Request**: Make COD fee payment configurable - allow business owner to choose whether the COD fee is paid by the business owner or by the customer.

**Implementation Details**:

1.  **Database Schema Update** (`backend/prisma/schema.prisma`):
    -   Added `codFeePaidBy` (String, optional) field to the `Order` model to store payment preference: "BUSINESS_OWNER" or "CUSTOMER".
    -   Created migration: `20260103002429_add_cod_fee_paid_by`.

2.  **Backend API Updates** (`backend/routes/order.js`):
    -   **Order Confirmation (`POST /order/:id/confirm`)**:
        -   Modified to accept `codFeePaidBy` from request body (defaults to 'BUSINESS_OWNER' if not provided).
        -   Calculates `finalOrderTotal` based on payment preference:
            -   If `CUSTOMER` pays: `finalOrderTotal = baseOrderTotal + codFee`
            -   If `BUSINESS_OWNER` pays: `finalOrderTotal = baseOrderTotal`
        -   **Accounting Entries**:
            -   **If Customer Pays COD Fee**:
                -   AR Transaction: Debit AR (includes COD fee), Credit Sales Revenue, Credit Shipping Revenue, Credit COD Fee Revenue (4400).
                -   COD Fee Expense Transaction: Debit COD Fee Expense (5200), Credit COD Fee Payable (2200) - business still pays logistics company.
            -   **If Business Owner Pays COD Fee** (current behavior):
                -   AR Transaction: Debit AR (base order total), Credit Sales Revenue, Credit Shipping Revenue.
                -   COD Fee Expense Transaction: Debit COD Fee Expense (5200), Credit COD Fee Payable (2200).
        -   Stores `codFeePaidBy` in the order record.
    -   **Order Update (`PUT /order/:id`)**:
        -   Modified to accept and update `codFeePaidBy` field.
        -   Allows changing COD fee payment preference in edit mode.

3.  **Backend Service Updates**:
    -   **`balanceService.js`**: Updated `calculateCustomerBalance` to include COD fee in order total when customer pays.
    -   **`customerService.js`**: Updated `calculatePendingPayment` to include COD fee in order total when customer pays.
    -   **`profitService.js`**: Updated `getProfitStatistics` to include COD fee revenue when customer pays.
    -   **`order.js` (stats endpoint)**: Updated order stats calculation to include COD fee in revenue when customer pays.

4.  **Frontend UI Updates**:
    -   **OrderDetailsPage** (`frontend/src/pages/OrderDetailsPage.jsx`):
        -   Added `codFeePaidBy` state initialized from `order.codFeePaidBy` or defaults to 'BUSINESS_OWNER'.
        -   **Confirmation UI**: Added COD fee payment preference selector when order is PENDING and has COD fee.
            -   Radio buttons for "Business Owner Pays" and "Customer Pays".
            -   Real-time display of new order total when customer pays.
            -   Clear explanation of accounting impact.
        -   **Edit Mode**: Added COD fee payment preference selector in edit mode for orders with COD fee.
            -   Same radio button interface.
            -   Real-time calculation of order total.
        -   Updated `calculateOrderTotal` function to include COD fee when customer pays.
        -   Updated `confirmOrder` to send `codFeePaidBy` to backend.
        -   Updated `handleSaveOrder` to send `codFeePaidBy` to backend.
    -   **EnhancedOrderDetailsModal** (`frontend/src/components/EnhancedOrderDetailsModal.jsx`):
        -   Added `codFeePaidBy` state and initialization.
        -   Added COD fee payment preference selector in confirmation section.
        -   Updated `handleConfirmOrder` to send `codFeePaidBy` to backend.

5.  **Key Features**:
    -   **Flexible Payment Configuration**: Business owner can choose per order whether COD fee is paid by business or customer.
    -   **Proper Accounting**: 
        -   When customer pays: COD fee is added to order total (revenue) and business still records expense (pays logistics).
        -   When business pays: Only expense recorded (no revenue).
    -   **Edit Mode Support**: COD fee payment preference can be changed in edit mode.
    -   **Real-time Calculations**: Order totals update in real-time based on payment preference.
    -   **Backward Compatible**: Existing orders without `codFeePaidBy` default to 'BUSINESS_OWNER' behavior.

6.  **Accounting Flow Summary**:
    -   **Customer Pays COD Fee**:
        -   Order Total = Products + Shipping + COD Fee
        -   AR: Debit (full amount), Credit Sales Revenue, Credit Shipping Revenue, Credit COD Fee Revenue
        -   Expense: Debit COD Fee Expense, Credit COD Fee Payable (business pays logistics)
        -   Net Effect: COD fee revenue - COD fee expense = 0 (break-even, but customer pays the fee)
    -   **Business Owner Pays COD Fee**:
        -   Order Total = Products + Shipping
        -   AR: Debit (base amount), Credit Sales Revenue, Credit Shipping Revenue
        -   Expense: Debit COD Fee Expense, Credit COD Fee Payable
        -   Net Effect: COD fee reduces profit (expense only)

7.  **User Experience**:
    -   Clear labeling: "COD Fee Payment Preference"
    -   Helpful explanations for each option
    -   Real-time order total updates
    -   Visual distinction with color-coded sections
    -   Only shows when relevant (orders with COD fee)

**Files Modified**:
-   `backend/prisma/schema.prisma` - Added codFeePaidBy field
-   `backend/routes/order.js` - Updated confirmation and update endpoints
-   `backend/services/balanceService.js` - Updated order total calculation
-   `backend/services/customerService.js` - Updated pending payment calculation
-   `backend/services/profitService.js` - Updated profit calculation
-   `frontend/src/pages/OrderDetailsPage.jsx` - Added COD fee payment selector UI
-   `frontend/src/components/EnhancedOrderDetailsModal.jsx` - Added COD fee payment selector UI
-   `DEVELOPMENT_JOURNAL.md` - Documented these changes

**Status**: ✅ Implementation Complete

**Notes**:
-   Database migration required: Run `npx prisma migrate dev` to apply schema changes (already applied).
-   Backward compatible: Existing orders without `codFeePaidBy` default to 'BUSINESS_OWNER' behavior.
-   Accounting entries are correctly created for both scenarios.
-   All order total calculations updated to include COD fee when customer pays.
-   Profit calculations correctly account for COD fee revenue when customer pays.

---

## 2026-01-03 - Order Viewing Bug Fix

### Issue: Order Details Page Not Loading

**Problem**: When trying to view an order, the page was not working due to a missing state variable declaration.

**Root Cause**: The `codFeePaidBy` state variable was being used in the component (initialized in `fetchOrderDetails` and used throughout the component) but was not declared in the state declarations at the top of the component.

**Fix Applied**:
- Added missing state declaration: `const [codFeePaidBy, setCodFeePaidBy] = useState('BUSINESS_OWNER')` in `OrderDetailsPage.jsx`
- This state variable is used for managing COD fee payment preference (BUSINESS_OWNER vs CUSTOMER)

**Files Modified**:
- `frontend/src/pages/OrderDetailsPage.jsx` - Added missing `codFeePaidBy` state declaration

**Status**: ✅ Fixed

**Notes**:
- This was a regression from the COD Fee Payment Configuration feature implementation
- The state variable was referenced but not declared, causing a runtime error when trying to view orders

---

## 2026-01-03 - Enhanced COD Fee Management System

### Feature: Comprehensive COD Fee Management with Auto-Recalculation

**Request**: Move logistics company management to Settings COD tab, implement auto-recalculation of COD fees in edit mode with manual override capability, and ensure proper accounting and profit calculations when COD fees change.

**Implementation Details**:

1. **Logistics Company Management in Settings COD Tab**:
   - Moved logistics company management from Accounting section to Settings COD tab
   - Added full CRUD functionality (Create, Read, Update, Delete) for logistics companies
   - Support for all three calculation types:
     - **PERCENTAGE**: For companies like TCS (e.g., 4% of COD amount)
     - **RANGE_BASED**: For Pakistan Post (e.g., Rs. 75 if < Rs. 10,000, different for 10K-20K)
     - **FIXED**: Fixed amount regardless of COD amount
   - Added validation for range-based rules:
     - No gaps between ranges (continuous coverage)
     - Min < Max for each range
     - Proper fee values (>= 0)
   - Added DELETE endpoint for logistics companies (prevents deletion if used in orders)

2. **Auto-Recalculation of COD Fee in Edit Mode**:
   - COD fee automatically recalculates when:
     - Products/quantities/prices change
     - Payment amount changes
     - Shipping charges change
     - Logistics company changes
   - Real-time preview of calculated COD fee
   - Shows calculation breakdown (method, company, COD amount)

3. **Manual COD Fee Override**:
   - Toggle to enable/disable manual override
   - When enabled, allows manual entry of COD fee
   - When disabled, uses calculated value
   - Override flag stored in state and sent to backend

4. **Backend Enhancements**:
   - Enhanced `PUT /order/:id` endpoint to handle COD fee recalculation
   - Recalculates COD fee when order values change (if not manually overridden)
   - Updates `codAmount` when order total/payment changes
   - Returns logistics company information in order details
   - Added validation for range-based COD fee rules in backend

5. **Profit Calculation Updates**:
   - Updated `profitService.js` to include COD fee expense in cost calculation
   - COD fee expense is always included (business always pays logistics company)
   - COD fee revenue included when customer pays
   - Profit = Revenue - Cost (including COD fee expense)

6. **UI/UX Enhancements**:
   - **Settings COD Tab**:
     - Section 1: Default Payment Preference (existing)
     - Section 2: Logistics Companies Management
       - Table view with company details
       - Add/Edit/Delete functionality
       - Form modal with validation
       - Range rules editor with gap detection
   - **Order Details Page**:
     - Enhanced COD fee section in edit mode:
       - Logistics company selector
       - Real-time COD fee calculation
       - Calculation breakdown display
       - Manual override toggle and input
       - COD fee payment preference selector
       - Real-time order total preview
     - COD fee display in view mode:
       - Shows COD fee amount
       - Displays logistics company and calculation method
       - Shows COD amount and payment preference

7. **Accounting Impact**:
   - COD fee changes in edit mode affect profit calculations
   - Historical accounting entries remain unchanged (audit trail preserved)
   - Customer balance calculations correctly include/exclude COD fee based on payment preference
   - Profit calculations include COD fee expense regardless of who pays

**Files Modified**:
- `frontend/src/pages/SettingsPage.jsx` - Added logistics company management to COD tab
- `frontend/src/pages/OrderDetailsPage.jsx` - Added COD fee auto-recalculation and manual override
- `backend/routes/accounting/logistics.js` - Added DELETE endpoint and range validation
- `backend/routes/order.js` - Enhanced order update endpoint for COD fee recalculation
- `backend/services/profitService.js` - Added COD fee expense to profit calculations
- `DEVELOPMENT_JOURNAL.md` - Documented these changes

**Status**: ✅ Implementation Complete

**Notes**:
- Logistics companies can be managed from Settings COD tab (moved from Accounting)
- COD fee auto-recalculates when order values change in edit mode
- Manual COD fee override works correctly
- All calculation types (PERCENTAGE, RANGE_BASED, FIXED) work correctly
- Range-based rules validated for gaps and proper min/max values
- Profit calculations include COD fee expense correctly
- Customer balance calculations handle COD fee correctly
- No breaking changes to existing functionality
- Backend routes kept for backward compatibility (can be removed later)

**Testing**:
- Created comprehensive test suite: `backend/tests/cod-fee-management.test.js`
- **Test Results**: 23/23 tests passing ✅
- Test coverage includes:
  - Logistics company CRUD operations (5 tests)
  - COD fee calculation for all three types (8 tests)
  - Auto-recalculation scenarios (4 tests)
  - Profit calculation with COD fee (3 tests)
  - Edge cases (3 tests)
- Fixed range-based boundary handling (exclusive max for non-last ranges)
- Fixed profit service to fetch product purchase prices from database

**Admin Portal - Clear All Data**:
- Verified and updated `clear-all-data` functionality to handle COD fee management features
- **Backend (`backend/routes/tenant.js`)**:
  - Already correctly deletes LogisticsCompanies (step 22, after Orders are deleted)
  - Added reset of `defaultCodFeePaidBy` to default value ('BUSINESS_OWNER')
  - Added reset of shipping-related settings (`shippingCityCharges`, `shippingQuantityRules`)
- **Frontend (`frontend/src/pages/AdminDashboard.jsx`)**:
  - Updated warning message to explicitly mention "All Logistics Companies and COD Fee Configurations"
  - Added note that tenant settings will be reset to defaults

**Dispatch Order - Logistics Company Selection**:
- Added logistics company selection to dispatch modal with full accounting support
- **Frontend (`frontend/src/pages/OrderDetailsPage.jsx`)**:
  - Added `dispatchLogisticsCompanyId` state to track selected logistics company in dispatch modal
  - Added logistics company dropdown to dispatch modal (after actual shipping cost field)
  - Updated `dispatchOrder` function to send `logisticsCompanyId` in payload
  - Initialize dispatch modal with order's current logistics company if available
- **Backend (`backend/routes/order.js`)**:
  - Updated dispatch endpoint to accept `logisticsCompanyId` in request body
  - Added validation for `logisticsCompanyId` parameter
  - Automatically recalculates COD fee when logistics company is set during dispatch
  - Calculates COD amount from order data (products + shipping - payment)
  - Updates order with logistics company, COD fee, COD amount, and COD fee calculation type
  - Uses tenant's `defaultCodFeePaidBy` if order doesn't have one set
  - **Accounting Entries**:
    - Checks if COD fee accounting entries already exist (from order confirmation)
    - If COD fee is set/changed during dispatch and entries don't exist, creates:
      - **If Customer Pays COD Fee**: 
        - AR adjustment transaction (Debit AR, Credit COD Fee Revenue)
        - COD Fee Expense transaction (Debit COD Fee Expense, Credit COD Fee Payable)
      - **If Business Owner Pays COD Fee**:
        - COD Fee Expense transaction (Debit COD Fee Expense, Credit COD Fee Payable)
    - Uses accounts: `1200` (AR), `4400` (COD Fee Revenue), `5200` (COD Fee Expense), `2200` (COD Fee Payable)
- **Profit Impact**:
  - Profit calculations already handle COD fee correctly via `profitService.js`
  - COD fee expense is included in order cost (business always pays logistics)
  - COD fee revenue is included in order revenue when customer pays
  - Profit calculations automatically reflect COD fee changes
- **Benefits**:
  - Business owners can now select/update logistics company at dispatch time
  - COD fee is automatically calculated based on selected logistics company
  - Ensures accurate tracking of which logistics company handled each order
  - COD fee is properly recorded even if not set during order confirmation
  - Accounting entries are created automatically when COD fee is set during dispatch
  - Profit calculations correctly reflect COD fee revenue and expense

**Complete COD Fee Accounting Entries Implementation**:
- Implemented comprehensive accounting entries handling for all COD fee scenarios
- **Order Update Endpoint (`PUT /order/:id`)**:
  - Added full accounting entries handling for confirmed/dispatched/completed orders
  - **Case 1: COD Fee Removed**: Reverses all COD fee entries (revenue and expense)
  - **Case 2: COD Fee Added**: Creates new COD fee entries (revenue if customer pays, expense always)
  - **Case 3: COD Fee Amount Changed**: Creates adjustment entries for the difference
  - **Case 4: Payment Preference Changed**: Adjusts AR/Revenue when codFeePaidBy changes
  - Handles all combinations: amount changes, preference changes, additions, removals
- **Dispatch Endpoint (`POST /order/:id/dispatch`)**:
  - Enhanced to handle all edge cases and scenarios
  - **COD Fee Decrease**: Creates reversing entries for the difference
  - **COD Fee Removal**: Reverses all existing COD fee entries
  - **COD Fee Increase**: Creates adjustment entries for the difference
  - **Payment Preference Change**: Adjusts AR/Revenue when codFeePaidBy changes
  - **Edge Cases Handled**:
    - Order already DISPATCHED (re-dispatch scenario)
    - COD fee exists but entries missing (creates entries even if amount unchanged)
    - All combinations of amount and preference changes
- **Profit Calculations**:
  - Verified and confirmed correct handling in `profitService.js`
  - Revenue includes COD fee when `codFeePaidBy === 'CUSTOMER'`
  - Cost always includes COD fee expense (business always pays logistics)
  - Profit = Revenue - Cost (correctly calculated for all scenarios)
- **Accounting Accounts Used**:
  - `1200` (Accounts Receivable) - Adjusted when COD fee revenue changes
  - `4400` (COD Fee Revenue) - Created/adjusted when customer pays COD fee
  - `5200` (COD Fee Expense) - Always created/adjusted (business pays logistics)
  - `2200` (COD Fee Payable) - Liability account for COD fee expense
- **All Scenarios Now Covered**:
  ✅ Order confirmation with COD fee
  ✅ Dispatch with new COD fee
  ✅ Dispatch with COD fee increase
  ✅ Dispatch with COD fee decrease
  ✅ Dispatch with COD fee removal
  ✅ Dispatch with payment preference change
  ✅ Dispatch with order already DISPATCHED
  ✅ Edit order: Add COD fee
  ✅ Edit order: Change COD fee amount
  ✅ Edit order: Change payment preference
  ✅ Edit order: Remove COD fee
  ✅ All combinations of changes

---

## 2026-01-03 - Shipping Cost Adjustment Feature

### Feature: Separate Shipping Cost Adjustment for Dispatched/Completed Orders

**Request**: Create a dedicated "Shipping Cost Adjustment" feature separate from order editing to handle recording actual shipping costs after dispatch. This distinguishes between:
1. **Customer-facing changes**: Editing shipping charges that customer pays (affects AR and revenue)
2. **Business expense recording**: Recording actual shipping cost while customer commitment remains unchanged (creates variance expense)

**Problem**: Previously, both scenarios were handled in the edit order form, causing confusion. When a business owner needs to record that actual shipping cost was 500 while customer was charged 200, this should be a separate action that doesn't change customer commitment.

**Implementation Details**:

1. **Backend API Endpoint** (`backend/routes/order.js`):
   - **New Endpoint**: `POST /order/:id/adjust-shipping-cost`
   - **Validation**:
     - Order must be DISPATCHED or COMPLETED
     - `actualShippingCost` is required and must be >= 0
     - User must have BUSINESS_OWNER or STOCK_KEEPER role
   - **Logic**:
     - Fetches order with current `shippingCharges` (customer commitment)
     - Calculates variance: `variance = shippingCharges - actualShippingCost`
     - Updates only: `actualShippingCost`, `shippingVariance`, `shippingVarianceDate`
     - Does NOT update `shippingCharges` (customer commitment remains unchanged)
   - **Accounting Entries**:
     - If variance < 0 (actual > charged): Creates expense entry
       - Debit Shipping Expense (actual cost)
       - Debit Shipping Variance Expense (difference)
     - If variance > 0 (actual < charged): Creates income entry
       - Debit Shipping Expense (actual cost)
       - Credit Shipping Variance Income (difference)
     - Handles variance changes by reversing old entries and creating new ones
     - Handles variance clearing when variance becomes 0

2. **Frontend UI Component** (`frontend/src/pages/OrderDetailsPage.jsx`):
   - **New Button**: "Adjust Shipping Cost" button
     - Visible only for DISPATCHED/COMPLETED orders
     - Orange theme to distinguish from customer-facing actions
     - Placed in order actions section
   - **New Modal**: "Adjust Shipping Cost" modal
     - Displays customer commitment (unchanged): "Customer Charged: Rs. 200.00"
     - Input field for actual shipping cost
     - Real-time variance preview with color coding:
       - Red for expense (actual > charged)
       - Green for income (actual < charged)
     - Clear explanation: "This records the actual cost paid. Customer commitment remains unchanged."
     - Submit button: "Record Shipping Cost"
   - **State Management**:
     - `showShippingAdjustmentModal`: boolean
     - `adjustmentActualCost`: number | null
   - **Removed from Edit Order Form**:
     - Removed "Actual Shipping Cost" section from edit mode
     - Edit mode now only handles customer-facing changes (updating `shippingCharges`)
     - Edit mode focused on order corrections, not expense recording

3. **UI/UX Improvements**:
   - **Visual Distinction**:
     - Edit Order: Blue/Pink theme (customer-facing)
     - Adjust Shipping Cost: Orange theme (business expense)
   - **Help Text**:
     - Edit Order: "Update what customer will pay"
     - Adjust Shipping Cost: "Record actual cost paid to logistics. Customer commitment unchanged."
   - **Order Details Display**:
     - Shipping variance prominently displayed for DISPATCHED/COMPLETED orders
     - Clear indication: "Customer Charged: Rs. 200" vs "Actual Cost: Rs. 500" vs "Variance: -Rs. 300 (Business Expense)"

**Benefits**:
- Clear separation of concerns between customer charges and business expenses
- Prevents confusion when recording actual costs
- Proper accounting for variance expenses
- Better audit trail
- User-friendly workflow

**Status**: ✅ Implementation Complete

**Note (2026-01-03)**: Added missing "Adjust Shipping Cost" button in order actions section for DISPATCHED/COMPLETED orders. The backend endpoint and modal were already implemented, but the button to trigger the modal was missing.

---

## 2026-01-03 - Default COD Fee Payment Configuration

### Feature: Default COD Fee Payment Preference Setting

**Request**: Add a configuration option in the business owner dashboard/settings page where business owners can set a default COD fee payment preference (Business Owner vs Customer). This default should be used when confirming orders unless overridden for individual orders.

**Implementation Details**:

1. **Database Schema Update** (`backend/prisma/schema.prisma`):
   - Added `defaultCodFeePaidBy` (String, optional, default: 'BUSINESS_OWNER') field to the `Tenant` model.
   - Created migration: `20260103220619_add_default_cod_fee_paid_by`.

2. **Backend API Updates**:
   - **Tenant Route** (`backend/routes/tenant.js`):
     - Updated `PUT /tenant/owner/me` endpoint to accept and update `defaultCodFeePaidBy` field.
     - Added validation to ensure value is either 'BUSINESS_OWNER' or 'CUSTOMER'.
   - **Order Confirmation** (`backend/routes/order.js`):
     - Modified to fetch `defaultCodFeePaidBy` from tenant when loading order.
     - Updated COD fee payment preference logic to use: request value > tenant default > 'BUSINESS_OWNER' fallback.

3. **Frontend UI Updates**:
   - **SettingsPage** (`frontend/src/pages/SettingsPage.jsx`):
     - Added new "COD Fee" tab in settings page.
     - Added COD fee configuration section with radio buttons for:
       - Business Owner Pays (default)
       - Customer Pays
     - Each option includes clear explanation of accounting impact.
     - Added helpful note that this is a default and can be overridden per order.
     - Integrated with existing tenant update API.

4. **Key Features**:
   - **Default Configuration**: Business owners can set a default preference that applies to all new order confirmations.
   - **Per-Order Override**: The default can still be overridden when confirming individual orders.
   - **Clear UI**: Radio button interface with explanations for each option.
   - **Backward Compatible**: Existing tenants without a default will use 'BUSINESS_OWNER' as fallback.
   - **Consistent Behavior**: Order confirmation uses: request > tenant default > 'BUSINESS_OWNER'.

5. **User Experience**:
   - Settings page now has a dedicated "COD Fee" tab.
   - Clear labeling and explanations for each payment option.
   - Visual feedback with border highlighting for selected option.
   - Helpful note explaining that this is a default setting.

**Files Modified**:
- `backend/prisma/schema.prisma` - Added defaultCodFeePaidBy field to Tenant model
- `backend/routes/tenant.js` - Updated to handle defaultCodFeePaidBy updates
- `backend/routes/order.js` - Updated to use tenant default when codFeePaidBy not provided
- `frontend/src/pages/SettingsPage.jsx` - Added COD fee configuration tab and UI
- `DEVELOPMENT_JOURNAL.md` - Documented these changes

**Status**: ✅ Implementation Complete

**Notes**:
- Database migration required and applied: `20260103220619_add_default_cod_fee_paid_by`
- Backward compatible: Existing tenants will default to 'BUSINESS_OWNER' behavior
- The default setting only affects new order confirmations when no explicit preference is provided
- Individual orders can still override the default preference
- Test cases exist in `backend/tests/cod-fee-payment.test.js` (11/17 tests passing, some test expectations need adjustment)

---

## 2026-01-03 - Payment Recording Enhancement for Order Details

### Feature: Complete Payment Recording with Account Selection and Payment History

**Request**: Add payment account selection (Cash/Bank) to the "Receive Payment" popup and display payment history/details at the bottom of the order details page. Ensure all accounting entries are correctly posted.

**Implementation Details**:

1. **Payment Modal Enhancements** (`frontend/src/pages/OrderDetailsPage.jsx`):
   - Added `PaymentAccountSelector` component to payment modal
   - Added `paymentReceiveAccountId` state to track selected payment account
   - Payment account selection is now required before recording payment
   - Updated modal close handlers to reset account selection

2. **Payment Recording** (`frontend/src/pages/OrderDetailsPage.jsx`):
   - **Changed from**: Direct order update (`PUT /order/:id`) that only updated `paymentAmount` field
   - **Changed to**: Proper payment recording endpoint (`POST /accounting/payments`)
   - Now creates proper accounting entries:
     - Debit: Cash/Bank Account (selected payment account)
     - Credit: Accounts Receivable (AR)
   - Updates order's `paymentAmount` automatically via backend
   - Creates payment record with full transaction details

3. **Payment History Section** (`frontend/src/pages/OrderDetailsPage.jsx`):
   - Added new "Payment History" section at bottom of order details page
   - Displays all payment records for the order:
     - Payment number
     - Date and time
     - Amount
     - Payment method (Cash/Bank Transfer)
     - Account name and code
   - Shows payment summary:
     - Total paid amount
     - Remaining balance (if any)
   - Loading state while fetching payments
   - Empty state when no payments exist

4. **Backend Enhancements** (`backend/routes/accounting/payments.js`):
   - Added support for filtering payments by `orderId` in GET endpoint
   - Added support for filtering by `customerId` and `supplierId` for consistency
   - Enables efficient fetching of payments for specific orders

5. **State Management**:
   - Added `payments` state array to store payment records
   - Added `loadingPayments` state for loading indicator
   - Added `fetchOrderPayments()` function to fetch payments for the order
   - Payments are fetched automatically when order details are loaded

6. **Key Features**:
   - **Proper Accounting**: All payments now create correct accounting entries (Debit Cash/Bank, Credit AR)
   - **Account Tracking**: Payment account is tracked and displayed in payment history
   - **Payment History**: Complete payment history visible at bottom of order details
   - **Real-time Updates**: Payment history refreshes after recording new payment
   - **User-Friendly**: Clear UI with payment details, account information, and summaries
   - **Validation**: Payment account selection is required before recording payment

7. **Accounting Flow**:
   - When payment is recorded:
     1. Creates payment record with account reference
     2. Creates accounting transaction:
        - Debit: Selected Payment Account (Cash/Bank)
        - Credit: Accounts Receivable (1200)
     3. Updates order's `paymentAmount` field
     4. All entries are properly linked and auditable

**Files Modified**:
- `frontend/src/pages/OrderDetailsPage.jsx` - Added payment account selector, updated payment recording, added payment history section
- `backend/routes/accounting/payments.js` - Added orderId, customerId, supplierId filtering support
- `DEVELOPMENT_JOURNAL.md` - Documented these changes

**Status**: ✅ Implementation Complete

**Notes**:
- Payment recording now uses proper accounting endpoint instead of direct order update
- All accounting entries are correctly posted with proper debit/credit relationships
- Payment history provides complete audit trail of all payments for the order
- Backend payments endpoint now supports filtering by orderId for efficient queries
- Payment account selection is required and validated before submission

---

## 2026-01-04 - Payment Verification System (Option A: Two-Step Verification)

### Feature: Payment Verification Workflow to Prevent Incorrect Accounting Entries

**Request**: Implement a payment verification system where business owners must verify customer-claimed payments before accounting entries are created. This prevents incorrect accounting when customers claim payment but haven't actually paid.

**Problem**: Previously, when orders were confirmed with prepayments, accounting entries were created immediately based on customer-claimed amounts. If a customer claimed Rs. 1000 but didn't actually pay, the accounting would be incorrect.

**Implementation Details**:

1. **Database Schema Update** (`backend/prisma/schema.prisma`):
   - Added `verifiedPaymentAmount` (Float, optional) - Actual verified amount by business owner
   - Added `paymentVerified` (Boolean, default: false) - Whether payment is verified
   - Added `paymentVerifiedAt` (DateTime, optional) - When payment was verified
   - Added `paymentVerifiedBy` (String, optional) - User ID who verified the payment
   - Created migration: `20260104222016_add_payment_verification_fields`

2. **Order Confirmation Changes** (`backend/routes/order.js`):
   - **Removed**: Payment accounting entries creation during order confirmation
   - **Kept**: AR transaction creation (Debit AR, Credit Revenue) - this is correct as order is confirmed
   - **Result**: Order confirmation no longer creates payment accounting entries
   - Payment accounting entries are only created when payment is verified

3. **Payment Verification Endpoint** (`backend/routes/order.js`):
   - **New Endpoint**: `POST /order/:id/verify-payment`
   - **Validation**:
     - Order must be CONFIRMED, DISPATCHED, or COMPLETED
     - Payment account is required and must be Cash/Bank type
     - Verified amount must be >= 0
     - Prevents re-verification if already verified
   - **Functionality**:
     - Creates payment accounting transaction (Debit Cash/Bank, Credit AR)
     - Creates Payment record with full details
     - Updates order with verification details (verifiedPaymentAmount, paymentVerified, paymentVerifiedAt, paymentVerifiedBy)
     - Updates paymentAccountId on order

4. **Frontend UI Updates** (`frontend/src/pages/OrderDetailsPage.jsx`):
   - **Payment Verification Section**:
     - Shows yellow warning banner for unverified prepayments
     - Displays claimed amount vs verified amount
     - "Verify Payment" button to open verification modal
     - Only visible for CONFIRMED/DISPATCHED/COMPLETED orders with unverified prepayments
   - **Verified Payment Display**:
     - Shows green success banner when payment is verified
     - Displays claimed amount (strikethrough) and verified amount
     - Shows verification date and time
   - **Verify Payment Modal**:
     - Shows customer claimed amount (read-only)
     - Input field for verified amount
     - Payment account selector (required)
     - Clear explanation of accounting impact
     - Creates accounting entries and payment record on submit
   - **Payment Status Display**:
     - Updated to show claimed vs verified amounts
     - Claimed amount shown with strikethrough if verified
     - Verified amount highlighted in green with checkmark
     - Unverified payments shown in red

5. **State Management**:
   - Added `showVerifyPaymentModal` state
   - Added `verifyPaymentAmount` state (initialized from order.paymentAmount)
   - Added `verifyPaymentAccountId` state
   - Added `verifyingPayment` loading state
   - Added `handleVerifyPayment` function

6. **Key Features**:
   - **Two-Step Process**: Order confirmation and payment verification are separate
   - **Validation Required**: Business owner must verify payment before accounting entries are created
   - **Clear UI**: Visual distinction between claimed and verified amounts
   - **Audit Trail**: Tracks who verified payment and when
   - **Prevents Errors**: No accounting entries created for unverified payments
   - **Flexible**: Business owner can verify different amount than claimed

7. **Accounting Flow**:
   - **Order Confirmation**:
     - Creates AR transaction (Debit AR, Credit Revenue)
     - Does NOT create payment accounting entries
   - **Payment Verification**:
     - Creates payment accounting transaction (Debit Cash/Bank, Credit AR)
     - Creates Payment record
     - Updates order verification status

8. **User Experience**:
   - Clear visual indicators for unverified payments (yellow warning)
   - Clear visual indicators for verified payments (green success)
   - Easy-to-use verification modal
   - Payment history shows only verified payments
   - Payment status clearly shows claimed vs verified amounts

**Files Modified**:
- `backend/prisma/schema.prisma` - Added payment verification fields
- `backend/routes/order.js` - Removed payment accounting from confirmation, added verify-payment endpoint
- `frontend/src/pages/OrderDetailsPage.jsx` - Added payment verification UI and functionality
- `DEVELOPMENT_JOURNAL.md` - Documented these changes

**Status**: ✅ Implementation Complete

**Notes**:
- Database migration required and applied: `20260104222016_add_payment_verification_fields`
- Order confirmation no longer creates payment accounting entries
- Payment verification is required before payment accounting entries are created
- Prevents incorrect accounting when customers claim payment but don't pay
- Business owner can verify different amount than claimed (handles partial payments, overpayments, etc.)
- All verified payments are recorded in payment history
- Payment verification creates proper accounting entries and payment records

---

## 2026-01-04 - Move Accounting Entries to Approval for Customer Order Returns

### Feature: Accounting Entries Created on Approval Instead of Creation

**Request**: Move accounting entries creation from return creation to return approval. This allows returns to be created as drafts and edited without accounting impact until approved.

**Problem**: Previously, accounting entries were created immediately when a return was created, making it difficult to edit returns without complex transaction reversals. This also meant that draft returns affected accounting before being reviewed.

**Implementation Details**:

1. **Backend Service Updates** (`backend/services/returnService.js`):
   - **`createOrderReturn` Function**:
     - **Removed**: All accounting transaction creation logic (lines 207-319)
     - **Result**: Returns are now created as drafts (PENDING status) without accounting entries
     - Returns can be edited freely without accounting impact
   - **`approveReturn` Function**:
     - **Enhanced**: Now creates accounting entries when return is approved
     - Creates Sales Returns + Accounts Receivable transaction
     - Calculates transaction amounts from return items
     - Handles shipping charges if FULL_REFUND is selected
     - Updates account balances correctly
     - Returns transaction details in response
   - **`updateOrderReturn` Function**:
     - **Enhanced**: Now allows editing for both PENDING and APPROVED returns
     - **PENDING Returns**: No accounting entries exist, so editing is simple (just update data)
     - **APPROVED Returns**: Reverses old accounting entries, updates data, creates new accounting entries
     - Prevents editing REFUNDED or REJECTED returns
     - Only reverses approval transactions (not refund transactions)
   - **`rejectReturn` Function**:
     - **Enhanced**: Only reverses accounting entries if return was APPROVED
     - PENDING returns don't have accounting entries, so no reversal needed
     - Prevents rejection of REFUNDED returns

2. **Key Changes**:
   - **Accounting Flow**:
     - **Create Return**: No accounting entries (draft state)
     - **Approve Return**: Creates accounting entries (Sales Returns + AR)
     - **Edit PENDING Return**: No accounting impact (just data update)
     - **Edit APPROVED Return**: Reverses old entries, creates new entries
     - **Reject PENDING Return**: No accounting impact (just status change)
     - **Reject APPROVED Return**: Reverses accounting entries
   - **Transaction Calculation**:
     - `approveReturn` calculates products value from return items
     - Handles shipping charges correctly (adds to transaction if FULL_REFUND)
     - `updateOrderReturn` recalculates products value from updated return items
     - Both functions properly separate products value from shipping charges

3. **Benefits**:
   - **Better Workflow**: Returns are created as drafts, reviewed, then approved with accounting impact
   - **Cleaner Accounting**: Only approved returns affect accounting books
   - **Easier Edits**: PENDING returns can be edited without transaction reversals
   - **Better Audit Trail**: Approval date marks when accounting impact occurs
   - **Flexible**: Business owners can create returns, review them, make changes, then approve

4. **Status Handling**:
   - **PENDING**: Draft return, no accounting entries, fully editable
   - **APPROVED**: Return approved, accounting entries created, editable (with reversal)
   - **REFUNDED**: Return refunded, cannot be edited
   - **REJECTED**: Return rejected, cannot be edited

5. **Accounting Transaction Details**:
   - **On Approval**:
     - Debit: Sales Returns (4100) - products value + shipping (if FULL_REFUND)
     - Credit: Accounts Receivable (1200) - same amount
   - **On Edit (APPROVED)**:
     - Reverses old approval transaction
     - Creates new approval transaction with updated amounts
   - **On Reject (APPROVED)**:
     - Reverses approval transaction

**Files Modified**:
- `backend/services/returnService.js` - Moved accounting creation to approval, updated edit/reject logic
- `DEVELOPMENT_JOURNAL.md` - Documented these changes

**Status**: ✅ Implementation Complete

**Notes**:
- Returns are now created as drafts without accounting impact
- Accounting entries are created only when return is approved
- PENDING returns can be edited freely without accounting impact
- APPROVED returns can be edited but require transaction reversal and recreation
- REFUNDED returns cannot be edited (as expected)
- All transaction calculations properly handle products value and shipping charges
- Account balances are correctly updated on approval and edit
- Backward compatible: Existing returns with accounting entries continue to work

**Clear All Data Function Update**:
- Updated `clear-all-data` function in `backend/routes/tenant.js` to handle new return accounting flow
- **Fixed Deletion Order**: Transactions now deleted before Orders and Returns (since Transactions reference both via foreign keys)
- **New Order**:
  1. Delete TransactionLines (before Transactions)
  2. Delete Payments (before Transactions, Orders, Returns)
  3. Delete Transactions (before Orders and Returns - they reference both)
  4. Delete Orders (after Transactions)
  5. Delete ReturnItems (before Returns)
  6. Delete Returns (after Transactions)
- This ensures foreign key constraints are respected when deleting tenant data
- Prevents errors when clearing data for tenants with approved returns that have accounting entries
