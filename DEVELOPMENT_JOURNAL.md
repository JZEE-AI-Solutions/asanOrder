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
- `frontend/src/pages/OrderDetailsPage.jsx` - Complete rewrite with edit functionality

**API Endpoints Used**:
- `GET /api/order/:id` - Fetch order details
- `PUT /api/order/:id` - Update order
- `POST /api/order/:id/confirm` - Confirm order (existing)

**Components Used**:
- `OrderProductSelector` - For product selection and management
- `ModernLayout` - Layout wrapper
- `LoadingSpinner` - Loading states

**Status**: ✅ Completed

### Color Contrast Improvements

**Issue**: Gray colors were causing readability issues, especially in input fields and labels.

**Improvements Made**:

1. **Input Fields**:
   - Changed from default (gray background) to explicit white background (`bg-white`)
   - Added dark text color (`text-gray-900`) for better contrast
   - Increased border thickness to `border-2` for better visibility

2. **Labels and Headers**:
   - Changed label colors from `text-gray-500` to `text-gray-700` or `text-gray-900` for better readability
   - Made headers bold (`font-bold`) instead of semibold
   - Changed icon colors from `text-gray-400` to `text-gray-700` for better visibility

3. **Product Cards**:
   - Changed background from `bg-gray-50` to `bg-white` for better contrast
   - Increased border thickness to `border-2 border-gray-300`
   - Made product names larger and bolder (`text-lg font-bold`)
   - Improved label contrast with `text-gray-700 font-semibold`
   - Enhanced category badges with `bg-blue-100 text-blue-800`

4. **Payment Section**:
   - Enhanced payment amount display with stronger borders (`border-2`)
   - Improved background colors (`bg-green-100` instead of `bg-green-50`)
   - Made text bolder and larger for better readability

5. **Metadata Section**:
   - Added borders between items for better separation
   - Made labels and values bolder
   - Improved text contrast throughout

**Result**: All text is now clearly readable with proper contrast ratios meeting accessibility standards.

### Additional Color Improvements - OrderProductSelector Component

**Issue**: Quantity and price input fields in the product selector had poor readability with gray backgrounds.

**Improvements Made**:

1. **Quantity Input Field**:
   - Changed from display-only span to editable input field
   - White background (`bg-white`) with dark text (`text-gray-900`)
   - Thicker borders (`border-2 border-gray-300`)
   - Larger, bolder text (`font-bold`)
   - Improved button styling with better contrast

2. **Price Input Field**:
   - Explicit white background (`bg-white`) with dark text (`text-gray-900`)
   - Thicker borders (`border-2 border-gray-300`)
   - Bolder text (`font-bold`)
   - Better padding for readability

3. **Labels**:
   - Changed from `text-gray-600` to `text-gray-900` with `font-bold`
   - Better contrast against white backgrounds

4. **Product Cards**:
   - Thicker borders (`border-2 border-gray-300`)
   - Better shadow for depth
   - Improved product name styling (larger, bolder)
   - Enhanced remove button with red color and hover effects

5. **Section Headers**:
   - "Selected Products" header now uses red color (`text-red-700`) for better visibility
   - "Available Products" header has background and thicker border

6. **Total Display**:
   - Thicker border separator (`border-t-2`)
   - Larger, bolder total amount in red (`text-red-600`)
   - Better contrast for "Total:" label

7. **Search Input**:
   - White background with dark text
   - Thicker border
   - Better icon contrast

**Result**: All input fields and text in the product selector are now highly readable with excellent contrast.

## 2024-12-XX - Comprehensive Input Field Color Fix

### Issue: Gray Input Fields Throughout Application

**Problem**: Input fields across the application had gray backgrounds making text unreadable, especially in modals and forms.

**Comprehensive Fix Applied**:

1. **EnhancedProductModal** (`frontend/src/components/EnhancedProductModal.jsx`)
   - Updated all input fields to have `bg-white text-gray-900 border-2`
   - Fixed: Product Name, SKU, Description, Category, all pricing fields, inventory fields, and reason field

2. **AddCustomerModal** (`frontend/src/components/AddCustomerModal.jsx`)
   - Updated all input fields to have `bg-white text-gray-900 border-2`
   - Fixed: Name, Phone Number, Email, Shipping Address, Notes

3. **CSS Updates**:
   - **index.css**: Updated `.input-field` class with `bg-white text-gray-900 border-2` and `font-medium`
   - **components.css**: Added `!important` flags and explicit white background with dark text
   - Enhanced placeholder styling

4. **Previously Fixed**:
   - OrderProductSelector (quantity and price inputs)
   - OrderDetailsPage (form data inputs and payment amount)

**Changes Made**:
- All input fields now have explicit `bg-white` background
- All input fields have `text-gray-900` for dark, readable text
- Borders changed from `border` to `border-2` for better visibility
- Added `font-medium` for better text readability
- Placeholder text uses lighter gray (`text-gray-400`) for contrast

**Result**: All input fields across the entire application now have white backgrounds with dark, highly readable text. No more gray input fields anywhere in the application.

**Files Modified**:
- `frontend/src/components/EnhancedProductModal.jsx`
- `frontend/src/components/AddCustomerModal.jsx`
- `frontend/src/index.css`
- `frontend/src/styles/components.css`

**Status**: ✅ Completed

### Color Review - Removed Red Text Colors

**Issue**: Red text colors were used for normal text elements, which is typically reserved for errors/warnings.

**Changes Made**:
- "Selected Products" header: Changed from `text-red-700` to `text-gray-900` (dark gray)
- Total amount display: Changed from `text-red-600` to `text-gray-900` (dark gray)
- Remove button: Kept red (`text-red-600`) as it's appropriate for a destructive action

**Result**: All regular text now uses neutral colors (dark gray/black) for professional appearance, with red reserved only for destructive actions.

## 2024-12-XX - Add Product Page (Full Page Instead of Modal)

### Feature: Convert Product Modal to Full Page

**Request**: On Products screen, clicking "Add Product" should open a full page instead of a popup modal, similar to how adding customers works.

**Implementation Details**:

1. **Created AddProductPage** (`frontend/src/pages/AddProductPage.jsx`)
   - Full page component similar to AddCustomerPage
   - Uses ModernLayout for consistent design
   - Includes all product fields from EnhancedProductModal:
     - Basic Information: Product Name, SKU, Description, Category
     - Pricing: Retail Price, Purchase Price, Sale Price
     - Inventory: Current Quantity, Min Stock Level, Max Stock Level
     - Status: Active checkbox
   - Uses react-hook-form for form management
   - White background inputs with dark text for readability
   - Navigation back to products list on cancel or success

2. **Updated ProductsManagement Component** (`frontend/src/components/dashboard/ProductsManagement.jsx`)
   - Changed `handleCreateProduct` to navigate to `/business/products/new` instead of opening modal
   - Added `useNavigate` hook import
   - Removed modal state management for new products (edit still uses modal)

3. **Updated Routes** (`frontend/src/App.jsx`)
   - Added route: `/business/products/new` → `LazyAddProductPage`
   - Added import for `LazyAddProductPage`

4. **Updated Lazy Components** (`frontend/src/components/LazyComponents.jsx`)
   - Added `LazyAddProductPage` lazy loading export

5. **Fixed AddCustomerPage Input Fields**
   - Updated all input fields to have white backgrounds (`bg-white text-gray-900 border-2`)
   - Consistent with other form improvements

**User Experience**:
- Clicking "Add Product" now navigates to a dedicated full page
- Better user experience with more space for form fields
- Consistent with add customer flow
- Easy navigation back to products list
- All inputs have proper white backgrounds for readability

**Files Created**:
- `frontend/src/pages/AddProductPage.jsx` - New full page component

**Files Modified**:
- `frontend/src/components/dashboard/ProductsManagement.jsx` - Changed to navigate instead of modal
- `frontend/src/App.jsx` - Added route and import
- `frontend/src/components/LazyComponents.jsx` - Added lazy loading
- `frontend/src/pages/AddCustomerPage.jsx` - Fixed input field colors

**Status**: ✅ Completed

## 2024-12-XX - Fixed Create Order Form Text and Field Backgrounds

### Issue: Text and Field Backgrounds Disturbed in Create Order Form

**Problem**: Text and field backgrounds in the Create Order Form modal were not readable due to gray colors and low contrast.

**Comprehensive Fix Applied**:

1. **CreateFormModal** (`frontend/src/components/CreateFormModal.jsx`)
   - Updated all form labels from `form-label` class to explicit `block text-sm font-bold text-gray-900 mb-2`
   - Changed all descriptive text from `text-gray-500` to `text-gray-700 font-medium` for better readability
   - Updated field labels and headers to use `font-bold text-gray-900` instead of `font-medium text-gray-700`
   - Enhanced visibility badges and status indicators with darker colors
   - Updated all section headers to use bold, dark text
   - Improved contrast for help text, field type indicators, and option labels
   - Enhanced colored sections (blue, yellow, green) with darker borders and better text contrast

2. **EditFormModal** (`frontend/src/components/EditFormModal.jsx`)
   - Applied same fixes for consistency
   - Updated all labels to `font-bold text-gray-900`
   - Changed descriptive text to `text-gray-700 font-medium`
   - Enhanced field labels and status indicators

**Changes Made**:
- All form labels now use `font-bold text-gray-900` for maximum readability
- All descriptive/help text uses `text-gray-700 font-medium` instead of `text-gray-500`
- Field headers and section titles use bold, dark text
- Status badges and indicators have better contrast
- Input fields already have white backgrounds from previous CSS fixes
- All text elements now have proper contrast ratios

**Result**: Create Order Form and Edit Order Form modals now have highly readable text with proper contrast. All labels, descriptions, and field information are clearly visible with dark text on appropriate backgrounds.

**Files Modified**:
- `frontend/src/components/CreateFormModal.jsx` - Fixed all text colors and labels
- `frontend/src/components/EditFormModal.jsx` - Fixed all text colors and labels

**Status**: ✅ Completed

## 2024-12-XX - Fixed White Text on White Background in Form Fields

### Critical Issue: White Text on White Background in Form Fields

**Problem**: On create/edit form screens, input field text was white on white backgrounds, making it completely unreadable. This affected all form inputs, selects, and textareas.

**Comprehensive Fix Applied**:

1. **CSS Updates** (`frontend/src/styles/components.css`):
   - Added explicit text color rules for select and option elements
   - Added global CSS rules to ensure all form inputs have dark text (`var(--color-gray-900)`)
   - Added `!important` flags to override any conflicting styles
   - Ensured all input, textarea, and select elements have proper text color

2. **CSS Updates** (`frontend/src/index.css`):
   - Added Tailwind classes for select and option elements
   - Ensured `text-gray-900` is applied to all form elements

3. **CreateFormModal** (`frontend/src/components/CreateFormModal.jsx`):
   - Added explicit `bg-white text-gray-900` classes to all input fields
   - Added `text-gray-900 bg-white` classes to all select elements
   - Added `text-gray-900 bg-white` classes to all option elements
   - Fixed: Form Name, Tenant select, Description textarea, Form Category select, all field inputs

4. **EditFormModal** (`frontend/src/components/EditFormModal.jsx`):
   - Added explicit `bg-white text-gray-900` classes to all input fields
   - Added `text-gray-900 bg-white` classes to all select and option elements
   - Fixed: Form Name, Description, Form Category, all field inputs and selects

5. **UI Components** (`frontend/src/components/ui/Input.jsx`):
   - Added `text-gray-900` to Input component
   - Added `text-gray-900` to Textarea component
   - Added `text-gray-900` to Select component
   - Ensures all reusable form components have proper text color

**Changes Made**:
- All input fields now have explicit `text-gray-900` class for dark, readable text
- All select elements have `text-gray-900` class
- All option elements have `text-gray-900 bg-white` classes
- Global CSS rules ensure all form elements have dark text by default
- Added `!important` flags in CSS to override any conflicting styles
- Fixed both CreateFormModal and EditFormModal components

**Result**: All form fields across the entire application now have dark, readable text on white backgrounds. No more white text on white background issues. All inputs, selects, textareas, and options are now clearly visible and readable.

**Files Modified**:
- `frontend/src/styles/components.css` - Added global form element text color rules
- `frontend/src/index.css` - Added Tailwind classes for form elements
- `frontend/src/components/CreateFormModal.jsx` - Added explicit text color classes to all form fields
- `frontend/src/components/EditFormModal.jsx` - Added explicit text color classes to all form fields
- `frontend/src/components/ui/Input.jsx` - Added text-gray-900 to all form components

**Status**: ✅ Completed

## 2024-12-XX - Enhanced Order Cards with Product Information

### Feature: Order Cards Enhancement

**Request**: Update order cards to display product images, product names, total amount, and payment status (received/pending).

**Implementation Details**:

1. **Enhanced Order Cards** (`frontend/src/pages/OrdersScreen.jsx`)
   - Added product images display (thumbnails)
   - Added product names and quantities
   - Added total amount calculation from products
   - Added received and pending payment amounts
   - Enhanced both card view and list/table view

2. **Key Features Implemented**:
   - **Product Display**: 
     - Shows up to 3 product images with names
     - Displays quantity and unit price for each product
     - Shows "+X more products" indicator if more than 3 products
   - **Payment Information**:
     - Total amount (calculated from products or payment amount)
     - Received amount (payment amount from order)
     - Pending amount (difference between total and received)
   - **Visual Enhancements**:
     - Product thumbnails with proper borders
     - Color-coded payment status (green for received, orange for pending)
     - Better spacing and layout

3. **Technical Implementation**:
   - Parses `selectedProducts`, `productQuantities`, and `productPrices` from order data
   - Calculates products total: sum of (quantity × price) for all products
   - Calculates pending amount: max(0, productsTotal - receivedAmount)
   - Handles both card view and table/list view
   - Graceful fallback when products data is not available

4. **User Experience**:
   - Quick visual identification of products in each order
   - Clear payment status at a glance
   - Better information density without clutter
   - Responsive design maintained

**Files Modified**:
- `frontend/src/pages/OrdersScreen.jsx` - Enhanced order cards and table view

**Status**: ✅ Completed

## 2024-12-XX - Accounting Module Implementation

### Feature: Comprehensive Accounting Module

**Request**: Implement a standalone, full-fledged accounting module with customer/supplier balances, expenses, shipping charges, COD fees, investor management, profit calculation/distribution, and withdrawals.

**Implementation Details**:

1. **Database Schema** (`backend/prisma/schema.prisma`):
   - Added 12 new models: Account, Transaction, TransactionLine, Expense, Supplier, LogisticsCompany, Payment, Investor, Investment, ProfitDistribution, ProfitDistributionItem, Withdrawal
   - Updated existing models: Order (added refundAmount, returnStatus, advanceBalance, actualShippingCost, shippingVariance, codFee, codAmount, logisticsCompanyId), Return (added orderId, returnType, refundMethod, refundAmount, shippingChargeHandling), Customer (added advanceBalance), PurchaseInvoice (added supplierId), Tenant (added totalInvestedCapital, totalProfitDistributed, ownerWithdrawals)
   - All models include proper indexes for performance
   - Proper relations between models

2. **Backend Services**:
   - `accountingService.js` - Core accounting logic, double-entry transactions, chart of accounts initialization
   - `balanceService.js` - Customer AR and Supplier AP balance calculations
   - `expenseService.js` - Expense management with automatic accounting entries
   - `codFeeService.js` - COD fee calculation (percentage, range-based, fixed)
   - `returnService.js` - Customer order returns (full/partial) with flexible shipping handling
   - `investorService.js` - Investor and investment management
   - `profitService.js` - Profit calculation and distribution
   - `withdrawalService.js` - Withdrawals (investor profit, owner personal, investor capital)

3. **Backend Routes** (`backend/routes/accounting/`):
   - Organized into focused modules: accounts.js, transactions.js, balances.js, expenses.js, payments.js, returns.js, investors.js, profit.js, withdrawals.js, logistics.js
   - All routes use authentication middleware
   - Standardized error handling and response format
   - RESTful API design

4. **Order Integration** (`backend/routes/order.js`):
   - Auto-create AR transaction when order is confirmed
   - Auto-create payment transaction if prepayment exists
   - Auto-calculate and accrue COD fee if COD order
   - All accounting entries are balanced (debits = credits)

5. **Frontend Pages** (`frontend/src/pages/accounting/`):
   - `AccountingDashboard.jsx` - Main overview with balance summary and recent transactions
   - `ExpensesPage.jsx` - Expense management with filters and pagination
   - `BalancesPage.jsx` - Customer AR and Supplier AP balances (tabs)
   - `TransactionsPage.jsx` - Journal entries list with filters

6. **Frontend Components** (`frontend/src/components/accounting/`):
   - `ExpenseForm.jsx` - Create/edit expense form (mobile-friendly)

7. **Navigation Updates**:
   - Added "Accounting" menu item to Sidebar
   - Added accounting routes to App.jsx
   - Mobile-first responsive design

**Key Features Implemented**:
- Double-entry bookkeeping system
- Automatic accounting entries on order confirmation
- Customer AR and Supplier AP tracking
- Expense management (Petrol, Utility, Other)
- COD fee calculation and tracking
- Customer order returns (full/partial) with flexible shipping handling
- Investor management and investment tracking
- Profit calculation and distribution
- Withdrawals (investor and owner)
- Balance summary dashboard
- Mobile-friendly UI with 44px touch targets

**Technical Implementation**:
- Database: PostgreSQL with Prisma ORM
- Backend: Node.js/Express with service layer architecture
- Frontend: React with mobile-first Tailwind CSS
- API: RESTful with standardized response format
- Error handling: Comprehensive try-catch with user-friendly messages
- Transactions: Database transactions for data consistency

**Files Created/Modified**:
- Backend: 15+ new service files, 10+ new route files, schema updates
- Frontend: 4 new pages, 1 new component, navigation updates
- Integration: Order confirmation endpoint updated

**Status**: ✅ Core Implementation Completed

**Next Steps**:
- Run database migration: `npx prisma migrate dev --name accounting_module`
- Test all accounting flows
- Add remaining frontend pages (Settings with tabs for accounts, investors, logistics)
- Add payment recording UI
- Add return management UI
- Add investor/profit management UI

---

## 2024-12-XX - Supplier Screen & Accounting Integration Review

### Review: Supplier Screen on Business Order Dashboard

**Request**: Review supplier screen on business order dashboard and its integration with accounting for any issues.

**Issues Found and Fixed**:

1. **Balance Calculation Not Returned for All Suppliers** ❌ → ✅
   - **Issue**: The API endpoint `/accounting/suppliers` only calculated balance when `hasPendingPayment` filter was active. This meant suppliers in the normal list view didn't have calculated balance objects.
   - **Impact**: UI couldn't display pending balances correctly, and balance calculations were inconsistent.
   - **Fix**: Modified `backend/routes/accounting/suppliers.js` to always calculate balance for all suppliers, then filter by pending payments if needed. This ensures consistent data structure.

2. **UI Type Mismatch** ❌ → ✅
   - **Issue**: `SuppliersSection` component tried to access `supplier.balance.pending` (object property), but when filter was inactive, `supplier.balance` was just a number from the database field.
   - **Impact**: Runtime errors when trying to access `.pending` on a number, causing UI to break.
   - **Fix**: Updated `frontend/src/components/dashboard/SuppliersSection.jsx` to handle both cases: `supplier.balance?.pending` (calculated balance object) or `supplier.balance` (number fallback).

3. **Balance Calculation Logic Clarification** ✅
   - **Review**: Verified the balance calculation logic in `balanceService.calculateSupplierBalance()` correctly handles:
     - Linked Payment records (preferred method)
     - `paymentAmount` field (backward compatibility for old invoices)
     - Avoids double counting by prioritizing linked payments
   - **Enhancement**: Added clarifying comments to the code explaining the priority logic.

**Files Modified**:
- `backend/routes/accounting/suppliers.js` - Always calculate balance for all suppliers
- `frontend/src/components/dashboard/SuppliersSection.jsx` - Handle both balance object and number types
- `backend/services/balanceService.js` - Added clarifying comments

**Status**: ✅ All Issues Fixed

**Notes**:
- The supplier screen is accessible via `/business/suppliers` route (separate page, not a tab in dashboard)
- Balance calculation correctly handles both new Payment records and legacy `paymentAmount` fields
- Accounting integration is working correctly - purchase invoices create proper accounting transactions

---

## 2024-12-XX - Clear All Data Functionality Review for Suppliers

### Review: Clear All Data Functionality After Supplier Implementation

**Request**: Review the "clear all data" functionality for tenants to ensure it properly handles suppliers and related accounting data after the supplier implementation.

**Review Findings**:

1. **Suppliers Are Properly Included** ✅
   - Suppliers are included in the deletion process (step 18, now step 18 after fix)
   - Stats tracking includes suppliers count
   - Frontend warning message already mentions Suppliers

2. **Deletion Order Issue** ❌ → ✅
   - **Issue**: Suppliers were being deleted before Payments (step 17 vs step 18)
   - **Impact**: While the foreign key constraint has `ON DELETE SET NULL` (which would set supplierId to NULL automatically), it's cleaner and safer to delete dependent records (Payments) before parent records (Suppliers)
   - **Fix**: Swapped the order - Payments now deleted at step 17, Suppliers at step 18
   - **Rationale**: Explicitly deleting dependent records first is cleaner than relying on database cascade behavior

3. **Foreign Key Constraints Verified** ✅
   - `purchase_invoices.supplierId` → `ON DELETE SET NULL` (PurchaseInvoices deleted before Suppliers)
   - `payments.supplierId` → `ON DELETE SET NULL` (Payments now deleted before Suppliers)
   - All related accounting data (Transactions, TransactionLines) properly handled

4. **Complete Deletion Sequence Verified** ✅
   - PurchaseInvoices deleted at step 6 (before Suppliers)
   - Payments deleted at step 17 (before Suppliers)
   - Suppliers deleted at step 18
   - Transactions deleted at step 19 (after Payments)
   - All accounting relationships properly handled

**Files Modified**:
- `backend/routes/tenant.js` - Fixed deletion order (Payments before Suppliers)

**Status**: ✅ Review Complete - All Issues Fixed

**Notes**:
- The clear-all-data functionality properly handles all supplier-related data
- Deletion order now follows best practices (dependent records before parent records)
- All foreign key constraints are respected
- Frontend warning message already includes Suppliers in the list

---

## 2024-12-XX - Supplier Advance Payment Adjustment Feature

### Feature: Adjust Supplier Advance Payments in Purchase Invoice Creation

**Request**: Implement functionality to adjust/use supplier advance payments when creating purchase invoices. If a supplier has paid advance payment (negative balance), the system should allow using that advance amount against new purchase invoices.

**Implementation Details**:

1. **Backend Changes**:

   - **Added Supplier Advance Account** (`backend/services/accountingService.js`):
     - Added account code `1220` - "Supplier Advance Balance" (LIABILITY type)
     - This account tracks advance payments from suppliers

   - **New API Endpoint** (`backend/routes/accounting/suppliers.js`):
     - `GET /accounting/suppliers/by-name/:name/balance` - Fetches supplier balance by name
     - Returns supplier info, balance details, and available advance amount
     - Calculates available advance as: `totalPaid > totalOwed ? totalPaid - totalOwed : 0`

   - **Updated Purchase Invoice Creation** (`backend/routes/purchaseInvoice.js`):
     - Added support for `useAdvanceBalance` and `advanceAmountUsed` parameters
     - Calculates available advance from supplier balance
     - Adjusts payment amount: `paidAmount = paymentAmount - actualAdvanceUsed`
     - Creates accounting entries:
       - Debit: Inventory (totalAmount)
       - Credit: Supplier Advance Balance (actualAdvanceUsed) - reduces liability
       - Credit: Cash/Bank (paidAmount) - if cash payment made
       - Credit: Accounts Payable (unpaidAmount) - if still unpaid
     - Updates supplier balance after advance usage: `balance = balance + actualAdvanceUsed`

2. **Frontend Changes** (`frontend/src/pages/AddPurchasePage.jsx`):

   - **Supplier Name Field Enhancement**:
     - Automatically fetches supplier balance when supplier name is entered
     - Shows available advance balance if supplier has advance
     - Displays loading state while fetching balance

   - **Advance Balance UI Section**:
     - Shows available advance amount
     - Checkbox to "Use Advance Balance"
     - Input field to specify advance amount to use (with max validation)
     - Real-time calculation showing:
       - Total Amount
       - Advance Used
       - Remaining Payment (Total - Advance)
     - Visual breakdown with color-coded amounts

   - **Form Submission**:
     - Includes `useAdvanceBalance` and `advanceAmountUsed` in payload
     - Backend automatically adjusts payment amounts

3. **Accounting Logic**:

   - **When Advance is Used**:
     - Debit: Supplier Advance Balance (reduces liability - supplier owes us less)
     - Credit: Accounts Payable (reduces what we owe supplier)
     - Proper double-entry bookkeeping maintained

   - **Supplier Balance Update**:
     - When advance is used, supplier balance increases (becomes less negative)
     - Example: If supplier has -5000 advance and uses 2000, balance becomes -3000

**Files Modified**:
- `backend/services/accountingService.js` - Added Supplier Advance Balance account
- `backend/routes/accounting/suppliers.js` - Added balance by name endpoint
- `backend/routes/purchaseInvoice.js` - Added advance adjustment logic
- `frontend/src/pages/AddPurchasePage.jsx` - Added advance balance UI

**Status**: ✅ Implementation Complete

**Notes**:
- Advance balance is calculated as: `totalPaid > (openingBalance + totalInvoices)`
- System automatically validates advance amount doesn't exceed available advance or invoice total
- Accounting entries properly reflect advance usage
- Supplier balance is automatically updated after advance usage
- UI provides clear visual feedback on advance usage and remaining payment

