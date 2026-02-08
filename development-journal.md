## Customer Ledger & Balance Incorrect (Order Items / Variants)

### Issue
For customer 03426491425 (Syed Jahanzeb), order was CONFIRMED with Total Spent Rs. 375 but Pending Balance and ledger showed Rs. 0.00.

### Cause
Order total and pending balance were computed from legacy fields only (`selectedProducts`, `productQuantities`, `productPrices`). Orders created with the normalized **OrderItem** flow (e.g. variant orders) may have empty or different legacy fields, so:
- **Backend** `balanceService.calculateCustomerBalance()` was summing product totals from legacy fields only → order total 0 → totalPending 0.
- **Frontend** Overview uses `customerOrders` and `calculateOrderTotal(order)` / `getPaymentStatus(order)`. If the customer-orders API didn’t include `orderItems`, and legacy fields were empty, total would be 0 and pending could be wrong.

### Changes
1. **Backend `balanceService.js`**
   - Include `orderItems: { select: { quantity, price } }` when loading CONFIRMED orders.
   - In the loop: if `order.orderItems?.length > 0`, compute order total from `orderItems` (sum of quantity × price), then add shipping and COD when applicable; otherwise keep legacy `selectedProducts` / `productQuantities` / `productPrices` logic.
2. **Backend `routes/customer.js`** (GET `/:id/orders`)
   - Include `orderItems: { select: { quantity, price, productName } }` in the orders response so the frontend can use them.
3. **Frontend `CustomerDetailsPage.jsx`**
   - **calculateOrderTotal(order)**: If `order.orderItems?.length > 0`, compute total from `orderItems`; else use legacy selectedProducts/productQuantities/productPrices. Always add `shippingCharges`.
   - **Orders list**: Show products from `order.orderItems` (productName, quantity) when present; otherwise keep showing from `selectedProducts`.

### Result
- Overview: Total Spent, Total Paid, and Pending Balance (confirmed orders only) now match order line items and payments.
- Balance API: `totalPending` and ledger-related balance are correct for orders that use OrderItem (including variant orders).
- Orders tab: Product summary shows items from `orderItems` when available.

---

## Payment Double-Count Fix (Remaining Balance Wrong)

### Issue
Remaining balance was shown as Rs. 175 instead of Rs. 275 when order total was Rs. 375 and total paid was Rs. 100. The same payment (from Verify Payment) was counted twice: once as `order.verifiedPaymentAmount` and once in the Payment list (verify-payment creates a Payment record).

### Fix
- **Frontend getPaymentStatus()**: `paid` is now **only** the sum of Payment records for the order. We no longer add `verified + receivedTotal`, because Verify Payment already creates a Payment record, so adding verified double-counted. So `paid = sum(payments)`.
- **Backend balanceService**: For each order, `paidAmount` is now only the sum of Payment records for that order (not verified + orderPayments). Same reason: Payment records already include the verified payment.

### Result
Remaining balance = order total − sum(Payment records). No double-counting; e.g. Rs. 375 − Rs. 100 = Rs. 275.

---

## Payment Verification Only for Customer-Stated Amount at Submission

### Requirement
Verification is required only for the amount the **customer stated at order submission** (prepayment/claimed amount). Payments recorded via **Receive Payment** are already confirmed when the business records them and do not require a separate verification step.

### Changes

1. **Backend `routes/accounting/payments.js`**
   - When recording a CUSTOMER_PAYMENT with orderId (Receive Payment), we **no longer update** `order.paymentAmount`. So `order.paymentAmount` stays as the amount the customer stated at submission. Payment records in the Payment table hold all received payments.

2. **Frontend `OrderDetailsPage.jsx`**
   - **getPaymentStatus()**: `paid` = verified customer-claimed amount + sum of payments from Payment history (recorded via Receive Payment). So `paid = verified + receivedTotal`; remaining = total - paid. Added `receivedTotal` to the returned object.
   - **Verification section copy**: Clarified that verification is only for the amount the customer stated at order submission, and that payments recorded via Receive Payment do not require verification.
   - **handleSubmitPayment** toast: Remaining balance after receive payment now uses `paymentStatus.paid + paymentValue` and `newRemaining` (no longer uses order.paymentAmount).

3. **Backend `services/balanceService.js`**
   - For each order, **paid amount** = (verified amount for that order) + sum of Payment records for that order. So `paidAmount = (order.paymentVerified ? order.verifiedPaymentAmount : 0) + receivedForOrder` where `receivedForOrder` is the sum of `allPayments` for that orderId. Customer balance and pending use this paid amount.

### Result
- Only the customer-stated amount at submission shows &quot;Payment Verification Required&quot; and uses Verify Payment.
- Receive Payment records count as paid immediately (no verification step).
- Order total paid = verified prepayment + all Receive Payment amounts; balance and remaining are correct.

---

## Receive Payment Button on Order Cards (List & Table)
- **OrdersScreen.jsx**: Added "Receive Payment" button on order cards (card view) and in the table view for orders with status CONFIRMED, DISPATCHED, or COMPLETED. Clicking it navigates to the order details page with `state: { openReceivePayment: true }`.
- **OrderDetailsPage.jsx**: When navigated with `location.state.openReceivePayment`, the Receive Payment modal opens automatically after the order is loaded; state is then cleared so it doesn’t re-open on refresh.

---

## Receive Payment Button Restored for CONFIRMED Orders

### Issue
"Receive Payment" was only visible for DISPATCHED orders; it had previously been available for CONFIRMED orders as well so that prepayment or partial payment could be recorded before dispatch.

### Fix
In `OrderDetailsPage.jsx`, the "Receive Payment" button is now shown when order status is **CONFIRMED**, **DISPATCHED**, or **COMPLETED** (instead of only DISPATCHED). The same `handleReceivePayment` / payment modal flow is used for all.

---

## Pending Balance Incorrect for DISPATCHED Orders (Rs. 0.00 vs Rs. 3,200)

### Issue
Customer Syed Jahanzeb had order Total Rs. 4,200, Paid Rs. 1,000, but Pending Balance showed Rs. 0.00 instead of Rs. 3,200. Order status was DISPATCHED (not CONFIRMED).

### Cause
1. **Frontend** (`CustomerDetailsPage.jsx`): Pending balance was computed only from orders with status `CONFIRMED`, excluding DISPATCHED and COMPLETED.
2. **Backend** (`balanceService.js`): `calculateCustomerBalance` filtered orders by `status: 'CONFIRMED'` only.
3. **Ledger** (`customer.js`): Ledger orders query used `status: 'CONFIRMED'` only, so TOTAL ORDERS showed 0 and balance was wrong.

### Fix
1. **Frontend**: Include CONFIRMED, DISPATCHED, COMPLETED orders in pending calculation. Prefer balance API (`customerBalance.totalVerifiedPayments`, `customerBalance.totalPending`) for summary stats when available (uses Payment records; correct for Receive Payment flow).
2. **Backend `balanceService.js`**: Changed orders filter to `status: { in: ['CONFIRMED', 'DISPATCHED', 'COMPLETED'] }`.
3. **Backend `customer.js` ledger**: Same status filter; added `orderItems` to orders query and order total calculation (orderItems when present, else legacy) for variant orders.
4. **Helper text**: Updated from "(Confirmed orders only)" to "(Confirmed, dispatched & completed orders)".

---

## Payment Amount Overwritten to 875 on Order Edit (Frontend Save)

### Issue
When editing an order (e.g. changing variant) and pressing "Save Changes", the order's payment amount was being overwritten to the products total (e.g. Rs. 875) even though the user did not change the payment field. This had been fixed before but regressed.

### Cause (frontend)
In `OrderDetailsPage.jsx`, `handleSaveOrder` was computing `finalPaymentAmount` as:
- If `paymentAmount` state was set → use it.
- Else → use `calculateProductsTotal()` (products total only).

When the user only changed variant, `paymentAmount` state could still be `null` (e.g. order had no prepayment or state wasn’t synced), so the code sent **products total** in the PUT payload and the backend stored it, overwriting the existing payment amount.

### Fix (frontend)
In `handleSaveOrder`, when `paymentAmount` state is null/undefined, do **not** default to `calculateProductsTotal()`. Use the **existing order’s** value instead:
- `finalPaymentAmount = paymentAmount !== null && paymentAmount !== undefined ? paymentAmount : (order?.paymentAmount ?? null)`

So on save we only send the user-entered payment amount or the current order value; we never auto-fill from products total on edit.

---

## Payment Amount Auto-Appearing as Products Total (Confirm / Order Create)

### Issue
When viewing a PENDING order and pressing "Confirm Order", the payment amount was showing Rs. 875 (products total only) instead of remaining empty or reflecting the full order total. This had been fixed before but regressed.

### Cause
- **Order creation**: If the client sent `paymentAmount` equal to the **products subtotal only** (e.g. 875 when products = 875 and shipping = 800), that value was stored. So the order showed "TOTAL AMOUNT Rs. 875" (prepayment) even though the full order total is Rs. 1675. This is a common mistake when a form or UI pre-fills "Payment Amount" with products total.
- **Confirm**: The confirm endpoint does not set `paymentAmount`; the value comes from the order as stored at creation.

### Fix (backend)
1. **POST /order/submit** (`backend/routes/order.js`):
   - Before creating the order, compute products total from `selectedProducts` / `productQuantities` / `productPrices` (including composite keys for variants).
   - If the submitted `paymentAmount` equals this products total **and** the order has shipping charges > 0, treat it as a mistake and use `null` for `paymentAmount` (so we don’t store "products-only" as prepayment).
   - Use this `effectivePaymentAmount` when creating the order.
2. **POST /order/:id/confirm**:
   - Comment added to make it explicit that confirm must never set `paymentAmount`; it stays as submitted or is edited separately.

### Result
- New orders that mistakenly send only the products subtotal as payment amount (with shipping present) will have `paymentAmount` stored as null, so the business owner can enter the correct prepayment or leave it for COD.
- Confirming an order no longer changes payment amount; the value no longer "automatically" appears as products total when it was not intended.

---

## Order Edit Must Not Auto-Verify Payment (Again)

### Issue
When editing an order and pressing Save, payment was again being treated as verified (or verification state was changing). This had been fixed before but regressed.

### Fix (backend)
In `backend/routes/order.js`, the PUT `/:id` (order edit) handler now **explicitly strips** payment verification fields from the update payload before calling `prisma.order.update`:
- `paymentVerified`
- `verifiedPaymentAmount`
- `paymentVerifiedAt`
- `paymentVerifiedBy`

So even if the client (or any future code) sends these in the body, the edit endpoint will never change verification state. Only the dedicated verify-payment and update-verified-payment endpoints can set these.

### Note
The frontend (`OrderDetailsPage.jsx`, `EnhancedOrderDetailsModal.jsx`) already does not send these fields when saving an order; the backend safeguard prevents regressions and accidental overwrites.

---

## Customer Dashboard 404 Fixes (Balances & Returns API)

### Issue
Customer details page was getting 404s for:
- `GET /api/accounting/balances/customer/:customerId`
- `GET /api/accounting/returns?returnType=CUSTOMER_FULL,CUSTOMER_PARTIAL`

### Cause
- **Balances**: Backend route is `/api/accounting/balances/customers/:customerId` (plural `customers`). Frontend was calling `customer` (singular).
- **Returns**: Backend mounts the returns router at `/api/accounting/order-returns`, not `/api/accounting/returns`. Frontend was calling `/accounting/returns`.

### Changes
- **CustomerDetailsPage.jsx**: Use `/accounting/balances/customers/${customerId}` and `/accounting/order-returns` for the returns list.
- **CreateReturnPage.jsx**: Use `/accounting/balances/customers/${customerId}` for customer balance (was already using `/accounting/order-returns` for other return API calls).

---

## Dispatch Order – COD Receipt Popup Restored

### Context
A previous change had made it so that on "Dispatch Order" click a popup would ask for receipt type (COD vs without COD). That behavior was reverted and "Print Shipping Receipt" was again showing as a separate button on the view order form for CONFIRMED orders.

### Changes (OrderDetailsPage.jsx)
1. **Removed** the "Print Shipping Receipt" dropdown from the CONFIRMED order view. When status is CONFIRMED, only the "Dispatch Order" button is shown in the header.
2. **Dispatch modal** now includes a "Print shipping receipt after dispatch" section with two options:
   - **Without Payment Amount** – standard shipping receipt (default).
   - **With Pending Payment (COD)** – includes payment details for COD collection.
3. After a successful dispatch, the chosen receipt is printed automatically (short delay so modal can close).
4. **Re-print**: "Print Shipping Receipt" dropdown is shown only for **DISPATCHED** and **COMPLETED** orders, so users can print again from the order details page when needed.

### Result
- CONFIRMED: User sees only "Dispatch Order" → modal opens with actual cost, logistics, COD fee, and receipt choice → on confirm, order is dispatched and the selected receipt prints.
- DISPATCHED/COMPLETED: "Print Shipping Receipt" dropdown is available for re-printing (with or without payment).

---

## 2026-01-20 - Product Variant System Implementation

### Fixed 500 Error on `/api/products/tenant/:tenantId` Endpoint
- **Root cause**: The endpoint was trying to select `isStitched`, `hasVariants` columns and include `variants` relation, but if the migration hasn't been run yet, these columns/table don't exist, causing a 500 error.
- **Solution**: Made all product endpoints defensive by:
  1. Wrapping queries in try-catch blocks
  2. Attempting to query with variant fields first
  3. Falling back to queries without variant fields if column/table errors occur (P2021, P2022, or "does not exist" errors)
  4. Setting default values for variant-related fields when variant support isn't available
  5. Improved error logging with detailed error information
- **Endpoints fixed**:
  - `GET /api/products/tenant/:tenantId` - Main products list endpoint
  - `GET /api/products/search/:query` - Product search endpoint
  - `POST /api/products/by-ids` - Get products by IDs (both queries: all products and specific IDs)
- **Result**: Endpoints now work whether or not the migration has been run. Once migration is run, full variant support is automatically enabled.

## 2026-01-20 - Product Variant System Implementation

### Overview
Implemented comprehensive product variant system with color (required) and size (optional, required for stitched products). Stock tracking moved to variant level while maintaining backward compatibility for non-variant products.

### Database Schema Changes
- **Product Model**: Added `isStitched` (boolean, default false) and `hasVariants` (boolean, default false) fields
- **ProductVariant Model**: New model with:
  - Color (required), Size (optional), SKU (unique)
  - Stock fields: `currentQuantity`, `minStockLevel`, `maxStockLevel`
  - Unique constraint on `[productId, color, size]` combination
- **OrderItem Model**: New normalized model for order items with variant links
- **ProductVariantImage Model**: New model for variant-specific images
- **Updated Models**: 
  - `PurchaseItem`: Added `productVariantId`
  - `ProductLog`: Added `productVariantId`
  - `ReturnItem`: Added `productVariantId`, `color`, `size`
  - `Order`: Added relation to `OrderItem[]`

### Backend Implementation

#### Product Routes (`backend/routes/product.js`)
- Updated GET `/:id` to include variants with images
- Updated POST `/` to accept `isStitched` and `hasVariants` flags
- Added variant CRUD endpoints:
  - GET `/:id/variants` - Get all variants for a product
  - POST `/:id/variants` - Create variant (auto-generates SKU, validates stitched products require size)
  - PUT `/:id/variants/:variantId` - Update variant
  - DELETE `/:id/variants/:variantId` - Delete variant
  - POST `/:id/variants/:variantId/images` - Upload variant image

#### Products Routes (`backend/routes/products.js`)
- Updated all endpoints to include variant information:
  - GET `/search/:query` - Includes variant summary
  - GET `/tenant/:tenantId` - Includes variants in product list
  - POST `/by-ids` - Includes variants with images

#### Purchase Invoice Routes (`backend/routes/purchaseInvoice.js`)
- Updated purchase item creation to handle variants:
  - Product head selection first (must exist)
  - Variant selection/creation after product selection
  - Auto-creates variant if color/size combination doesn't exist
  - Validates size requirement for stitched products
  - Links purchase items to both `productId` and `productVariantId`
- Updated return items to include variant info

#### Order Routes (`backend/routes/order.js`)
- Updated order creation to create `OrderItem` records with variant links
- Updated order updates to sync `OrderItem` records
- Maintains backward compatibility with legacy `selectedProducts` JSON fields

#### Inventory Service (`backend/services/inventoryService.js`)
- `updateInventoryFromPurchase()`: Handles variant-level stock updates
- `decreaseInventoryFromOrder()`: Decreases variant stock when variant exists
- `updateInventoryFromReturn()`: Handles variant-level stock updates
- All methods fall back to product-level stock for backward compatibility

#### Stock Validation Service (`backend/services/stockValidationService.js`)
- Updated to validate variant stock when variants exist
- Calculates allocated stock per variant from confirmed orders
- Uses normalized `OrderItem` records when available, falls back to legacy JSON

#### Return Routes (`backend/routes/return.js`)
- Updated return item creation to include variant info
- Extracts variant info from order items for customer returns
- Supports variant selection for supplier returns

#### Return Service (`backend/services/returnService.js`)
- Updated to extract variant info from order items when creating customer returns

#### Image Routes (`backend/routes/images.js`)
- Added support for `product-variant` entity type
- Variant images stored in `ProductVariantImage` table
- GET endpoint supports variant image retrieval with optional `imageId` query param

### Frontend Implementation

#### Purchase Pages
- **AddPurchasePage.jsx**:
  - Product search dropdown with autocomplete
  - "Create Product" modal for quick product head creation
  - Variant selection UI (color, size) when product has variants
  - Variant creation button with validation
  - Existing variant dropdown selection
- **EditPurchasePage.jsx**: Same variant selection functionality

#### Shopping Cart (`ShoppingCartForm.jsx`)
- Variant selection modal when adding products with variants
- Displays variant info (color, size) in cart items
- Variant stock validation before adding to cart
- Order submission includes variant info

#### Product Display (`ProductDisplay.jsx`)
- Variant selection UI for simple order forms
- Variant creation support
- Displays variant info in selected products summary
- Used in `ClientFormDynamic.jsx` for simple order forms

#### Cart Modal (`CartModal.jsx`)
- Displays variant info (color, size) for cart items

### Key Features
1. **Backward Compatibility**: Existing products without variants continue to work with product-level stock
2. **Variant Creation Rules**:
   - Color always required
   - Size required if `product.isStitched = true`
   - Auto-generated SKU: `{productSKU}-{color}-{size}` or `{productSKU}-{color}`
3. **Stock Management**: 
   - Variant products: Stock tracked at variant level
   - Non-variant products: Stock tracked at product level
4. **Purchase Flow**: Product head selection → Variant selection → Auto-create if needed
5. **Order Flow**: Variant selection before adding to cart → Variant info in order submission

### Migration
- Created migration file: `20250110000000_add_product_variants/migration.sql`
- Migration includes all schema changes for new tables and fields

### Files Modified
**Backend:**
- `backend/prisma/schema.prisma`
- `backend/routes/product.js`
- `backend/routes/products.js`
- `backend/routes/purchaseInvoice.js`
- `backend/routes/order.js`
- `backend/routes/return.js`
- `backend/routes/images.js`
- `backend/services/inventoryService.js`
- `backend/services/stockValidationService.js`
- `backend/services/returnService.js`

**Frontend:**
- `frontend/src/pages/AddPurchasePage.jsx`
- `frontend/src/pages/EditPurchasePage.jsx`
- `frontend/src/components/ShoppingCartForm.jsx`
- `frontend/src/components/ProductDisplay.jsx`
- `frontend/src/components/CartModal.jsx`

## 2026-01-17

- Started implementation of variants + normalized order items + product media gallery plan.
- Decision: use existing Admin "Clear All Data" endpoint for data wipe after deploy (manual).
- Plan includes: multi-attribute variants (Color/Size), OrderItem model, ProductMedia gallery (10 images + 2 videos), DB Bytes storage for media.
- Implemented schema additions for variants/order_items/product_media and updated clear-all-data.
- Added backend routes/services for variants, product media, order items, stock validation, and inventory updates.
- Updated frontend order flows for variant selection, items payloads, and media gallery display in shopping cart; added variant/media management in Edit Product.

- Status check: user asked if pending work is done; no new task provided yet.

- Fixed 500 Internal Server Error on `/api/order/stats/dashboard` endpoint:
  - **Root cause identified**: The code was trying to query `OrderItem` relation (`items`) but the `order_items` table doesn't exist in the database yet (migration not run)
  - **Solution**: Changed query to use legacy fields (`selectedProducts`, `productQuantities`, `productPrices`) instead of OrderItem relation
  - Added fallback logic to support both OrderItem (new system) and legacy fields (old system)
  - Added null/undefined checks for `order.items` array in revenue calculation loop
  - Added `id` field to Prisma select queries for better debugging
  - Improved error logging with detailed error information (name, message, code, meta)
  - Added try-catch around Promise.all query execution with detailed error logging
  - Added array validation for `allOrdersForRevenue` to prevent runtime errors
  - Enhanced error messages to include stack trace in development mode
  - Initialized all variables with default values to prevent undefined errors
  - Added type coercion for all stats values to ensure valid numbers/arrays in response
  - Created test script `test-dashboard-stats-direct.js` to identify the issue
  - Note: Backend server must be restarted for changes to take effect

- Fixed 500 Internal Server Error on `/api/products/tenant/:tenantId` endpoint:
  - **Root cause identified**: The code was trying to select `hasVariants` and `variantAttributes` columns that don't exist in the database yet (migration not run)
  - **Solution**: Removed `hasVariants` and `variantAttributes` from select query and added fallback logic
  - Added comprehensive error logging with detailed error information (name, message, code, meta, stack)
  - Added try-catch around Promise.all query execution with detailed error logging
  - Added defensive checks for `purchaseItems` array to prevent null/undefined errors
  - Added error handling for variant totals query to prevent failures from blocking the response
  - Made variant totals query more defensive to handle missing `product_variants` table gracefully
  - Added fallback logic to determine `hasVariants` by checking if product has entries in variantTotalsByProduct
  - Added null checks for `latestPurchase` and `purchaseInvoice` to prevent property access errors
  - Improved array validation for `purchaseItems` before mapping and reducing
  - Enhanced error messages to include stack trace in development mode

- Fixed 500 Internal Server Error on `/api/product` endpoint:
  - **Root cause identified**: Same issue as products endpoint - trying to select `hasVariants` and `variantAttributes` columns that don't exist in database yet
  - **Solution**: Removed `hasVariants` and `variantAttributes` from select query and added fallback logic
  - Added comprehensive error logging with detailed error information
  - Added try-catch around Promise.all query execution with detailed error logging
  - Made variant totals query more defensive to handle missing `product_variants` table gracefully
  - Added fallback logic to determine `hasVariants` by checking if product has entries in variantTotalsByProduct
  - Enhanced error messages to include stack trace in development mode

- Fixed 500 Internal Server Error on `/api/tenant/:tenantId/clear-all-data` endpoint:
  - **Root cause identified**: The code was trying to delete from tables that don't exist in the database yet (migration not run): `order_items`, `product_media`, `product_variants`, `product_attributes`
  - **Additional issue**: The queries were using nested relation filters (`order: { tenantId }`, `product: { tenantId }`) which don't work when tables don't exist
  - **Solution**: 
    - Wrapped deletions for these tables in try-catch blocks to gracefully handle missing tables
    - Changed query approach: first get parent IDs (orderIds/productIds), then delete by direct foreign key (orderId/productId) instead of nested relations
    - Fixed all deleteMany calls to properly extract `.count` property instead of assigning the whole result object
    - **Critical fix**: Added table existence checks using `information_schema` before attempting deletions to prevent PostgreSQL transaction abort
    - **Root cause of transaction abort**: When a Prisma query fails on a non-existent table, PostgreSQL aborts the entire transaction, causing all subsequent operations to fail with "current transaction is aborted, commands ignored until end of transaction block"
    - **Solution**: Check table existence using `information_schema.tables` with `$queryRawUnsafe` - this won't abort the transaction if the table doesn't exist, allowing the transaction to continue
    - Added defensive error handling for OrderItem, ProductMedia, ProductVariant, ProductAttribute, and ProductLog deletions
    - Enhanced error logging with detailed error information (name, message, code, meta, stack)
    - The endpoint now continues with other deletions even if these tables don't exist yet

- Set up auto-reload for backend development:
  - **Why restarts are needed**: Node.js loads modules into memory and doesn't auto-reload when files change
  - **Solution**: Use `npm run dev` instead of `npm start` for development - this uses nodemon which auto-restarts on file changes
  - Created `nodemon.json` config file to optimize file watching (watches routes, services, middleware, lib, utils, server.js)
  - **For development**: Use `npm run dev` - server will auto-restart when you save files
  - **For production**: Use `npm start` - runs migrations and starts server normally

- Implemented variant support on purchase invoices and supplier returns:
  - Added product variant selection to Add Purchase and Edit Purchase flows (autocomplete + variant attribute dropdowns).
  - Payloads now include `productId` and `productVariantId` for purchase items and return items.
  - Purchase invoice details and return displays now show variant info when available.
  - Supplier return flows now carry `productVariantId` and compute availability per variant.
  - Backend now stores and returns variant info for purchase items and return items.
  - Inventory updates during purchase invoice edits now adjust variant stock when `productVariantId` is present.

- Fixed purchase invoice create/update when `productVariantId` column does not exist in DB (migration not run):
  - **Error**: `The column 'productVariantId' does not exist in the current database` on `purchaseItem.createMany()`.
  - **Backend**: Removed `productId` and `productVariantId` from PurchaseItem createMany/update in `purchaseInvoice.js` (POST /with-products, PUT /with-products). Removed `productVariantId` from ReturnItem createMany in `purchaseInvoice.js` and `return.js`. Removed `productVariantId` and `productVariant` from GET /:id and /search selects for purchaseItems and returnItems so Prisma does not select non-existent columns. Left `productId` in GET /:id purchaseItems select (column may exist).
  - **Frontend**: `addItem` in AddPurchasePage and AddPurchaseModal now appends `productId`, `productVariantId`, `hasVariants` so new rows have correct shape. Removed submit validation that blocked when `hasVariants && !productVariantId` in AddPurchasePage, AddPurchaseModal, EditPurchasePage so purchase can be saved when variant columns are not yet migrated.
  - **Variant UI visibility**: Product search (type 2+ chars in Product Name) and variant dropdowns (Color/Size) appear only when a product is **selected from the search dropdown** and that product has `hasVariants: true`. If `hasVariants` or `product_variants` is not in the DB, the search fallback sets `hasVariants` to false and variant fields stay hidden. After running migrations that add `productVariantId` to `purchase_items` and `return_items`, re-add those fields to create/update and to the GET selects; variant selection will then persist.

- Completed variant UI visibility on purchase item screens (Add Purchase, Add Purchase Modal, Edit Purchase):
  - **Problem**: Variants section (Color/Size) only showed when `hasVariants` was true from the API. When DB lacks `hasVariants` or `product_variants`, the search returns `hasVariants: false` for all products, so the section never appeared.
  - **Solution**: Show the **Variants** section whenever a product is **selected from the search dropdown** (i.e. `productId` is set), not only when `hasVariants` is true. Always call `fetchProductVariants(product.id)` on product selection. If the product has variants (attributeOptions has keys), show Color/Size dropdowns; otherwise show: "No variants for this product. Add variants in Edit Product (and run the variant migration) to see Color/Size here."
  - **Files**: AddPurchasePage.jsx, AddPurchaseModal.jsx, EditPurchasePage.jsx (purchase items and return items). Updated useEffect to fetch when `item?.productId`; removed `if (product.hasVariants)` before `fetchProductVariants` in onClick; changed variant block condition from `hasVariants` to `productId`; added "Variants" label and fallback message. EditPurchasePage: `addItem` and `appendReturn` now include `productId`, `productVariantId`, `hasVariants` in new rows.

- Variant handling for manual (free-form) purchase items and purchase tests: **Manual entry**: Variants only when a product is selected (productId set). Typing in Product Name clears productId and variant state; Variants block hidden. Payload: `productVariantId` only when `productId && productVariantId`. Hint when name filled but no product: "Select a product from the suggestions to link this line and choose Color/Size (variants)." **Backend/tests without productVariantId/hasVariants columns**: purchaseInvoice and inventoryService use explicit `select` on findMany/findFirst, raw `UPDATE purchase_items SET productId` for linking, and raw `INSERT INTO products` fallback when `product.create` fails for hasVariants. testHelpers.getProductQuantity and supplier-purchase-payment.test.js include/select adjusted. Prisma column errors for those columns are resolved.

- **Permanent fixes for un-migrated schema (productVariantId, hasVariants, variantAttributes):**
  - **purchaseInvoice.js**: (1) `tenant` before init: fetch tenant at start of PUT `/:id/with-products` before return-items validation. (2) `tx.purchaseItem.update` in items loop → raw `UPDATE purchase_items` (name, quantity, purchasePrice, sku, category, description, updatedAt). (3) `tx.purchaseItem.update` for linking productId (POST with-products) → raw `UPDATE purchase_items SET "productId"`. (4) `tx.returnItem.update` in return-items loop → raw `UPDATE return_items` (productName, description, purchasePrice, quantity, reason, sku). (5) `tx.product.findMany` before linking → `select: { id: true }`.
  - **inventoryService.js**: (1) `createProductLogSafe`: try `prisma.productLog.create`, on P2022 and `column` includes `productVariantId` → raw `INSERT INTO product_logs` (omits productVariantId). Exported for use in product.js. (2) All `prisma.product.update` → raw `UPDATE products SET "currentQuantity"[, "lastPurchasePrice"] "lastUpdated"` as needed. (3) All `prisma.product.findFirst`/`findMany` → `select` omitting hasVariants (id, currentQuantity, lastPurchasePrice, etc.). (4) `prisma.purchaseItem.update` for productId or variant link → raw `UPDATE purchase_items SET "productId"`. (5) `product.create` in name-correction and new-item-in-edit paths → try Prisma, on P2022 for hasVariants/variantAttributes → raw `INSERT INTO products`. (6) `getInventorySummary` product.findMany → `select`; `getProductHistory` productLog.findMany → `select`; delete/restore invoice `purchaseItems` include → `select`; `findProductForItem` → `select`. (7) `updateVariantQuantity` productLog → `createProductLogSafe` without productVariantId in data.
  - **product.js**: (1) POST `/` (create): `tx.product.create` → try Prisma, on P2022 for hasVariants/variantAttributes → raw `INSERT INTO products`. (2) `tx.productLog.createMany` → replaced with loop using `createProductLogSafe` (imported from inventoryService) to handle missing productVariantId. (3) GET `/:id`: removed `hasVariants` and `variantAttributes` from select; compute `hasVariants` from `variants.length > 0`; return `hasVariants` and `variantAttributes: null` in response. (4) GET `/:id/variants`: removed `hasVariants` and `variantAttributes` from select; fetch `attributes` and `variants` in separate try-catch blocks (tables may not exist); compute `hasVariants` from `variants.length > 0`; return `hasVariants` and `variantAttributes: null`.
  - **products.js**: GET `/search/:query`: removed `hasVariants` and `variantAttributes` from select; compute `hasVariants` from `variantTotalsByProduct.has(product.id)`; return `hasVariants` and `variantAttributes: null`.
  - **testHelpers.js**: Cleanup order: delete `product_logs` before `purchase_items` (FK product_logs.purchaseItemId → purchase_items).
  - **Frontend purchase pages**: Updated hint messages in AddPurchasePage, AddPurchaseModal, EditPurchasePage to clarify: "You can type a product name manually - it will be auto-created if it doesn't exist. Or select from suggestions to link to an existing product and choose Color/Size (variants)." This clarifies that manual entry is allowed and products are auto-created. Improved error handling in `fetchProductVariants` - don't show toast for 404 or missing variants table; only log to console.
  - **Manual variant entry and product selection fixes**: (1) Fixed product selection onClick handler - changed to `onMouseDown` with `e.preventDefault()` to prevent input blur before click registers. (2) Added manual Color/Size input fields that show even when `productId` is null - users can now enter color/size for manually typed products. (3) Manual variant values (variantColor, variantSize) are stored in form state and included in item description when submitting (format: "Color: X, Size: Y" appended to description). (4) When a product is selected from dropdown, manual variant inputs are cleared. (5) Applied fixes to AddPurchasePage, AddPurchaseModal, and EditPurchasePage (both purchase items and return items sections).

- **REVERTED: All product variant enhancement changes (2026-01-17)**:
  - User requested to discard all changes related to product variant enhancement as they were causing issues
  - Reverted all modified files to their last committed state using `git restore`
  - **Files reverted**: 
    - Backend: schema.prisma, routes (images.js, order.js, product.js, products.js, purchaseInvoice.js, return.js, tenant.js), services (inventoryService.js, stockValidationService.js), tests (testHelpers.js, supplier-purchase-payment.test.js)
    - Frontend: All components and pages that had variant-related changes (AddPurchaseModal, CartModal, EnhancedOrderDetailsModal, OrderProductSelector, ShoppingCartForm, ProductsManagement, and all pages: AddPurchasePage, ClientFormDynamic, CreateStandaloneSupplierReturnPage, CreateSupplierReturnPage, CustomerDetailsPage, EditProductPage, EditPurchasePage, EnhancedProductsDashboard, OrderDetailsPage, ProductsDashboard, PurchaseInvoiceDetailsPage)
  - All variant-related code, schema changes, routes, services, and UI components have been removed
  - Codebase is now back to the state before variant enhancement work began
  - Note: `nodemon.json` and `development-journal.md` remain as untracked files (not part of variant changes)

## Add Purchase – Second Variant Line productId/productVariantId Null (Frontend)

### Issue
On Add Purchase page, when creating a purchase with two variant lines (e.g. same product, colors white and yellow), the second line was sent with `productId: null` and `productVariantId: null`, so the backend could not link the second line to the product/variant.

### Root causes (frontend)

1. **Grouping**  
   `getProductGroups()` used key `item?.productId ?? \`name:${name}\``. Line 0 had `productId` (e.g. 123), line 1 had `productId: null`, so they got different keys (e.g. `123` vs `name:product eight`) and were split into two groups. The second line was rendered as its own card and payload resolution did not treat it as part of the same product group.

2. **productId resolution**  
   `productIdByGroup` was built so the “name” key was only set when a line had no productId and we fell back to `sameName`; if the second line’s key was `name:X` and the first line’s key was the numeric productId, the name key was never set. So lookup by `groupKey = "name:X"` for the second line could return null.

3. **Form state for new variant line**  
   The new line’s `productId` came only from the object passed to `append()`. If that wasn’t persisted correctly by react-hook-form for an unregistered field, the submitted form could still have `productId: null` for the second line.

### Fixes (AddPurchasePage.jsx)

1. **getProductGroups**  
   - Group key: if item has no productId but has the same trimmed name as the previous item, reuse the previous group’s key so variant lines stay in the same group as the first line.  
   - So line 0 (productId 123) and line 1 (productId null, same name) now share one group and one card.

2. **productIdByGroup and per-line productId**  
   - When filling `productIdByGroup`, for any line whose key is still missing, find the first same-name line that has `productId` or `selectedProducts[formIndex]?.id`, and use that id for both the line’s key and for `name:${trimmedName}`.  
   - When resolving productId for each payload line: use `productIdByGroup[groupKey] ?? productIdByGroup[nameKey]`, then fallback to the first same-name line that has an id.  
   - Ensures the second variant line gets the same productId as the first even when its form `productId` is null or `selectedProducts[1]` is missing.

3. **addVariantLine**  
   - Derive `productId` from `template?.productId ?? product?.id` and pass it in the appended item.  
   - After append, in a `setTimeout(0)`, call `setValue(\`items.${newIndex}.name\`, name)` and `setValue(\`items.${newIndex}.productId\`, productId)` so the new line’s name and productId are explicitly in form state and persist on submit.

4. **Debug**  
   - Removed temporary `[AddPurchase] Save payload` console.log.

### Files changed
- `frontend/src/pages/AddPurchasePage.jsx`: getProductGroups, addVariantLine, productIdByGroup building, per-line productId resolution, removed debug log.

### Follow-up fixes (still reproducing)
- **Propagate selected product to all same-name lines**: When a product is selected from suggestions, `handleProductSelect` now finds all rows whose product name matches and:
  - sets `selectedProducts[idx] = product`
  - sets `items.${idx}.productId` if missing
  - syncs `productVariants` to all same-name rows
  - clears `productVariantId/color/size` for all same-name rows if the product has no variants
- **Fetch variants for all same-name rows**: `fetchProductVariants` now accepts `indicesToSync` to apply the variants list across every line that belongs to the same product group.
- **Harder productId fallback**: Added `nameToProductId` map built from both form items and `selectedProducts`, and used it when resolving `productId` for each payload line.
- **Normalize product names across all lookups**: Added `normalizeName()` (trim, collapse spaces, lower-case) and used it for grouping, same-name matching, and productId/variant resolution to avoid mismatches like casing or extra spaces.
- **Use live form state in productId resolution**: Built lookups from `getValues('items')` (current form state) instead of relying only on `data.items` so missing/unregistered fields can’t drop `productId` on the second line.
- **Auto-create product + variants for manual entries**: When productId is still null at save time, create a product once per normalized name and create variants for each line with a color. This ensures second line gets productId/productVariantId even if the product was never selected from suggestions.
- **Prevent duplicate products on manual entry**: Before auto-creating, the frontend now searches existing products by name and reuses the exact name match. Variants are created only if missing for that existing product.
- **Edit Purchase UI cleanup**: Hide the top-level Color/Size variant selection when the variants section is active, so variant attributes aren’t duplicated in the edit view.
- **Inventory fix on edit with variant change**: Inventory adjustments now key by `productVariantId` first and explicitly transfer stock when a purchase item’s variant changes (decrease old variant, increase new variant).
- **Purchase invoice details view**: Added a Variant column for purchase items and return items so color/size are visible in the details table.
- **Add Purchase variant creation**: Creating a new variant now uses separate inputs so it no longer overwrites the color/size on the first variant line.
- **Product history now shows variant data**: Product history endpoint includes `productVariant` details, and the UI shows variant color/size in the history entries (including order-related logs).
- **Supplier dashboard tabs**: Updated supplier details to use tabs (Overview/Purchases/Payments) to match the customer dashboard pattern and show key supplier totals.

## Product Variant Full App Impact – Implementation Complete

Implemented the full Product Variant Impact Analysis plan across orders, returns, inventory, accounting, and product history.

### Backend
- **Order GET** (`backend/routes/order.js`): Response now includes `orderItems` with `product` and `productVariant` for view/edit and profit.
- **Order create/update**: Quantity and price use composite key `productId_variantId` (or `productId`) when building OrderItems so multiple variant lines of the same product get correct qty/price.
- **Shopping cart submit** (`frontend/src/components/ShoppingCartForm.jsx`): `productQuantities` and `productPrices` use composite key when a variant is present so each cart line has its own quantity/price.
- **Inventory** (`backend/services/inventoryService.js`): `decreaseInventoryFromOrder` prefers orderItems from DB (by orderId); legacy selectedProducts/productQuantities used only when order has no orderItems. Confirm order calls with 3 args (tenantId, orderId, orderNumber).
- **Return service** (`backend/services/returnService.js`): Already keys orderItems by composite `productId_variantId` for correct variant on return items.
- **Accounting** (`backend/services/profitService.js`): `calculateProfit`, `getProfitStatistics`, and `calculateOrderProfit` use orderItems when present; fallback to legacy with composite key for revenue/cost.
- **Customer return approval + stock** (`backend/services/returnService.js` + `inventoryService.js`): Added `increaseInventoryFromCustomerReturn` (variant-aware INCREASE and ProductLog). `approveReturn` calls it after the approval transaction for CUSTOMER_FULL/CUSTOMER_PARTIAL returns.

### Frontend
- **OrderDetailsPage**: Loads from `orderItems` when present (composite-key quantities/prices); uses `getLineKey` for quantity/price and cleanup; view mode shows variant (color · size) per line.
- **OrderProductSelector**: Uses `getLineKey` for quantity/price and remove; supports multiple lines per product (e.g. different variants); add/remove and display use line key.
- **EnhancedOrderDetailsModal**: Already initializes from orderItems and uses getLineKey for display/edit.
- **CreateReturnPage**: Already uses orderItems for partial return (orderProducts from orderItems, getLineKey, variant label in UI, payload with productVariantId).
- **ClientFormDynamic**: Normalizes `selectedProducts` for submit (id, name, variantId, productVariantId, color, size, quantity, price) and builds composite-key `productQuantities`/`productPrices` for order submit.
- **Add Product**: Already has hasVariants/isStitched checkboxes and sends them; dashboards already show variant count and total variant stock on product cards.
- **Supplier returns**: Confirmed CreateSupplierReturnPage and backend pass/use productVariantId; no code change.

### Product Variant – Automated Test Cases

Added `backend/tests/product-variant-order-return.test.js` to verify the variant-aware order/return/inventory flow end-to-end. Uses `createTestAppWithOrderAndReturns()` and mock auth from `testHelpers.js`.

**Test 1 – Order submit with two variant lines creates correct OrderItems**
- Submits order with same product, two variants (Red/S qty 2 @ 100, Blue/M qty 1 @ 150) using composite keys in `productQuantities`/`productPrices`.
- Asserts two `OrderItem` rows with correct `productId`, `productVariantId`, quantity, and price per line.

**Test 2 – Order confirmation decreases variant stock correctly**
- Submits order with two variant lines, confirms order.
- Asserts variant Red/S stock 10 → 8, Blue/M 10 → 9 (variant-level decrease from orderItems).

**Test 3 – Partial return selects one variant line and creates ReturnItem with productVariantId**
- Submits order, confirms, then creates CUSTOMER_PARTIAL return with only Blue/M (qty 1).
- Asserts return has one `ReturnItem` with `productVariantId` set to Blue/M variant.

**Test 4 – Customer return approval increases variant-level inventory**
- Submits order, confirms, creates partial return for one variant line, approves return.
- Asserts Blue/M variant stock increases by 1 after approval (increaseInventoryFromCustomerReturn).

Payloads use `JSON.stringify(selectedProducts/productQuantities/productPrices)` when calling order submit so Prisma receives string fields as in production. All four tests pass.

### Why Some Variant Impact Items Were Missed + Stock-Display Audit

**Why the order form stock display was missed**
- The impact plan focused on (1) **data flows** that touch variant IDs (order items, returns, inventory, profit) and (2) **business-side** product UIs (Products dashboard, Add/Edit Product). The **customer-facing** order form (ShoppingCartForm) was covered for **submit payload** (composite key for quantities/prices) but not for **availability/display**.
- For variant products, stock lives in variants (`totalVariantStock`); product-level `currentQuantity` is often 0. Any UI that shows “in stock” / “sold out” or enables “Add to Cart” must use variant-aware stock. The plan didn’t explicitly list “every place that displays or gates on product stock.”

**Systematic way to avoid similar gaps**
- For any feature that introduces a new “source of truth” (e.g. variant-level stock), list every UI and API that **displays** or **decides** on that concept (e.g. “available”, “in stock”, “total quantity”) and check: “Does this use the new source (e.g. totalVariantStock) or the old one (e.g. product.currentQuantity)?”

**Stock-display audit (variant-aware fixes applied)**

| Location | Issue | Fix |
|----------|--------|-----|
| **ShoppingCartForm.jsx** (public order form) | Sold Out / Out of Stock / Add to Cart used only `product.currentQuantity` → variant products showed as sold out. | Added `getProductAvailableQty(product)` using `totalVariantStock` when `hasVariants`; used for badge, “X in stock”, and Add to Cart vs Out of Stock. |
| **ProductsDashboard.jsx** | “Total Quantity” stat summed only `currentQuantity` → undercounted when products have variants. | Sum uses `hasVariants && totalVariantStock != null ? totalVariantStock : (currentQuantity \|\| 0)` per product. |
| **EnhancedProductsDashboard.jsx** | Same “Total Quantity” stat; one table column showed `currentQuantity` → 0 for variant products. | Same sum logic; table quantity column uses variant-aware value. |
| **ProductsManagement.jsx** (dashboard) | Table quantity column showed `currentQuantity` → 0 for variant products. | Column uses `hasVariants && totalVariantStock != null ? totalVariantStock : (currentQuantity \|\| 0)`. |

**Already correct (no change)**
- Product cards on ProductsDashboard / EnhancedProductsDashboard / ProductsManagement already showed variant breakdown and used `totalVariantStock` for the main card number where applicable.
- ProductHistoryModal shows product-level quantity (product history is product-scoped; variant-level history is in variant details).
- Add/Edit Product and variant forms correctly use variant `currentQuantity` for variant rows.

### Order Form – Variant Visibility and Images (Previously Missed)

**Gap:** The public order form (ShoppingCartForm) showed stock correctly after the stock-display fix but did not show **variants** or **variant images**. Users could not see different variants, their pictures, or add a specific variant to cart with a clear visual.

**Changes made**

1. **Product card – variant strip**
   - For products with `hasVariants` and `product.variants`, a “Variants” row of thumbnails is shown below the main image.
   - Each thumbnail uses `getImageUrl('product-variant', v.id)` with fallback to color initial.
   - Tooltip shows color/size and stock.

2. **Variant selection modal – images and immediate data**
   - Modal uses `product.variants` from the initial `/products/by-ids` response when available so it opens without waiting for an extra API call.
   - Each variant row shows: **variant image** (thumbnail), color/size, SKU, and stock (“X in stock” / “Out of stock”).
   - Fallback: if `product.variants` is empty, still uses `productVariants[product.id]` (from `fetchProductVariants`).

3. **Cart – variant line identity and variant image**
   - Cart lines are keyed by `productId` or `productId-variantId` so updating quantity or removing an item affects the correct line when the same product has multiple variants in cart.
   - **CartModal**: each line uses variant image when the item has `variantId`/`productVariantId` via `getImageUrl('product-variant', ...)`; otherwise product image. Remove and quantity controls pass `lineKey` so `removeFromCart` and `updateQuantity` work per line.

4. **Cart line key (remove/update)**
   - `getCartLineKey(item)` = `item.variantId ? \`${item.id}-${item.variantId}\` : item.id`.
   - `removeFromCart(lineKey)` and `updateQuantity(lineKey, quantity)` filter/update by this key so multiple variant lines of the same product are independent.

**Backend**
- No change. `/products/by-ids` already returns `variants` (with primary `images`) for both “all products” and “by IDs” paths.

**Full-system variant visibility audit**

| Area | Status |
|------|--------|
| **ShoppingCartForm** (order form catalog + cart) | **Fixed:** Variant strip on card, variant modal with images, cart line key and variant image in cart. |
| **CartModal** | **Fixed:** Line key for remove/update, variant image per line. |
| **ProductsDashboard / EnhancedProductsDashboard / ProductsManagement** | **Already OK:** Variant list and variant images on product cards. |
| **EditProductPage** | **Already OK:** Variant images in variant section. |
| **ProductDisplay.jsx** (ClientFormDynamic) | **Optional:** Shows variants in dropdown with stock; no variant images. Could add small thumbnails in dropdown or a variant list with images later. |
| **CreateReturnPage / OrderDetailsPage / OrderProductSelector** | **Already OK:** Order lines show variant (color/size) and use composite keys. |

---

## Supplier Dashboard: Payments Not Appearing (Invoice 1004-FEB-26-001)

### Issue
Payment made against purchase invoice **1004-FEB-26-001** did not appear on the Supplier Dashboard. User had made the payment (using advance balance) but the Payments tab showed nothing.

### Root cause (DB check)
- Script `backend/scripts/check-invoice-payments.js` was added to inspect invoice and related Payment/Transaction rows.
- For invoice 1004-FEB-26-001: **0 Payment records** were linked; **2 Transaction records** existed (purchase + payment). The payment had been recorded as an accounting transaction only (advance used, no cash/bank).
- Backend **only created a Payment row** when `cashPaymentAmount > 0`. Advance-only supplier payments created a Transaction but **no Payment**, and the Supplier Dashboard lists only Payment records, so they never appeared.

### Fixes

1. **Backend `routes/accounting/payments.js`**
   - Supplier payments now **always create a Payment record** when there is any payment (cash and/or advance): `totalSupplierPaymentAmount = cashPaymentAmount + actualAdvanceUsed`. Create Payment when `totalSupplierPaymentAmount > 0`.
   - Payment `amount` = total (cash + advance); `paymentMethod` = `'Advance'` when advance-only, or `'Cash'`/`'Bank Transfer'` when cash-only, or `'Cash + Advance'`/`'Bank Transfer + Advance'` when both.
   - Ensures all supplier payments (including advance-only) show on the Supplier Dashboard going forward.

2. **Backfill for existing advance-only payments**
   - Script `backend/scripts/backfill-supplier-advance-payments.js`: finds Transactions that are supplier payments (have `purchaseInvoiceId`, description contains `SUPPLIER_PAYMENT`) with **no linked Payment**, then creates a Payment row (amount from AP debit on transaction lines, `paymentMethod: 'Advance'`, `supplierId` from invoice). Run with `--dry-run` to preview.
   - Run was executed for the tenant; one Payment was created for the existing advance-only payment against 1004-FEB-26-001.

3. **DB check script**
   - `backend/scripts/check-invoice-payments.js [invoiceNumber]`: prints invoice details, Payment rows linked by `purchaseInvoiceId`, recent SUPPLIER_PAYMENT for the invoice’s supplier, and Transaction rows. Use to verify why a payment might not show on the supplier dashboard.

### Result
- Payment for **1004-FEB-26-001** (Rs. 3000, Advance) now has a Payment record with correct `supplierId` and appears on the Supplier Dashboard (Supplier One).
- Future supplier payments made with advance-only (or cash + advance) will always create a Payment record and appear on the dashboard.

---

## Product primary video on card showing as image

### Issue
User set a video as primary for a product (product-level media, not variant). On the products dashboard card, the primary media appeared as an image instead of a video. Variant primary videos were displaying correctly on the card.

### Cause
- Product list API already returned `productImages` with `mediaType` for the primary media; the card correctly branches on `product.productImages?.[0]?.mediaType?.startsWith('video/')`.
- Possible causes: (1) Stale list after setting primary on Edit Product page (no refetch when returning to dashboard in some flows); (2) Primary media sub-query had no `orderBy`, so in edge cases the returned row could be non-deterministic; (3) Videos on cards did not autoplay, so they could look like a static image.

### Changes

1. **Backend `routes/product.js` (GET / product list)**
   - Added `orderBy: { createdAt: 'asc' }` to the `productImages` relation (where `isPrimary: true`, take: 1) so the primary media row is deterministic.

2. **Frontend `ProductsManagement.jsx`**
   - Refetch on visibility: added a `visibilitychange` listener so when the user returns to the browser tab (e.g. after editing in another tab or window), the product list is refetched and primary media type is up to date.
   - Card videos: added `autoPlay` and `loop` to all product and variant `<video>` elements on the dashboard (card view and list view) so primary videos actually play and are clearly visible as videos rather than a static frame.

### Result
- Primary product video should display as a playing video on the card after setting it on the Edit Product page and returning to the dashboard (component remount refetches list; visibility refetch covers tab switch).
- Product and variant card videos now autoplay muted and loop, making it obvious they are videos.

---

## Edit Product page: Product media section video not playing (looked like image)

### Issue
On the Edit Product page, in the **Product media** section, uploaded videos appeared as a static image (first frame) and did not run. In the **Product Variants** section, variant videos were displaying and running correctly.

### Cause
The Product media section used a `<video>` element with only `muted`, `playsInline`, and `preload="metadata"` — no `autoPlay` or `loop`. Without autoplay, the video shows only the first frame until the user presses play, so it looked like an image.

### Fix
**Frontend `EditProductPage.jsx`**
- **Product media section:** Added `autoPlay` and `loop` to the `<video>` element for product-level media so videos autoplay muted and loop in the gallery.
- **Product Variants section:** Added `autoPlay` and `loop` to the variant media `<video>` for consistency.

### Result
Product media section videos now autoplay and loop in the gallery, so they are clearly visible as videos rather than static images.

---

## Order form multi-media UX (product & variant images/videos)

### Scope
After implementing multiple images and videos for products and variants, the **order form** (both **simple product selector** and **shopping cart** flow) was updated so customers get a consistent, beautiful UX: view all media, see videos where set as primary, and add to cart easily.

### Backend

- **`/api/products/by-ids`** (used by both simple form and shopping cart):
  - Returns **`productImages`** (full list: `id`, `mediaType`, `isPrimary`, `sortOrder`) ordered by primary first, for gallery and primary display.
  - Returns **variant `images`** (full list: `id`, `imageType`, `isPrimary`, `sortOrder`) per variant so the frontend can show variant thumbnails and detect video vs image.
  - Formatted response includes `productImages` and `variants` (with `images`) so the client can render galleries and video without extra requests.

### Simple order form (ProductDisplay – PRODUCT_SELECTOR)

- **Product media**: Main area shows primary product media as image or video; videos autoplay muted and loop. If multiple product media exist, a thumbnail strip appears; clicking a thumbnail updates the main view. Product switcher thumbnails show primary image or video per product.
- **Variants**: Variant selector is a grid of variant cards with thumbnail (image or video), color/size label, and stock. Videos in variant thumbnails autoplay and loop.
- **Selected products summary**: Each line shows a small thumbnail (image or video) from product primary or selected variant primary, with quantity controls and remove.

### Shopping cart order form (ShoppingCartForm)

- **Product cards**: Main image is primary product media (image or video); videos autoplay and loop. "View gallery" button opens a modal with product media thumbnails and main view, plus variant media section.
- **Variant strip**: Variant thumbnails show image or video per variant.
- **Variant selection modal**: Variants listed with thumbnail (image or video), color/size, stock; videos autoplay and loop.
- **Cart**: When adding to cart, each item stores `primaryMediaType` so the cart can render video correctly.

### Cart modal (CartModal)

- Each cart line shows product/variant thumbnail as image or video using `item.primaryMediaType`. Videos autoplay muted and loop.

### Result

- Simple form: Full product gallery when multiple media, variant grid with thumbnails, selected summary with thumbnails.
- Shopping cart: Primary video/image on cards, variant strip media, View gallery modal, variant picker with media, cart drawer shows video/image per line.
- Add to cart unchanged: one click for non-variant; variant modal then Add to Cart for variant products. No breaking changes to order submission.

---

## Edit Purchase: faster load and mobile-friendly

### Issue
Edit Purchase page was slow to load and not mobile-friendly (touch targets, layout on small screens).

### Loading
- **Show form as soon as invoice is loaded**: `setLoading(false)` is called immediately after resetting the form with invoice data. Product and variant data for each line are fetched in the **background** (fire-and-forget) so the user can see and edit the form without waiting for N product/variant API calls.
- **Categories**: Categories fetch runs in the background (non-blocking) with a cleanup on unmount; it no longer blocks the initial render.

### Mobile
- **Touch targets**: Invoice details and product/return inputs use `min-h-[44px]` or `min-h-[48px]`, `text-base`, and `px-3 py-2.5` / `px-4 py-3` for better tap targets and readability; buttons use `min-h-[44px]` and `touch-manipulation`.
- **Layout**: Single column on small screens (`grid-cols-1 md:grid-cols-2`), responsive padding (`p-4 sm:p-6`), responsive spacing and typography.
- **Payment modal**: Responsive padding, scrollable container, `safe-area-padding` and touch-friendly scrolling for the payments table.

---

## Edit Purchase page: loading time and mobile UX

### Issues
- Edit Purchase page was slow to load (user reported "taking so much time in loading").
- Page was not mobile friendly (layout, touch targets, spacing on small screens).

### Loading
- **Cause:** After fetching the purchase invoice, the code awaited `Promise.all` of N requests (one `GET /product/:id` and optionally `GET /product/:id/variants` per line item). With many lines, this blocked the form from rendering until all requests finished.
- **Change:** The form is shown as soon as the invoice is loaded and the form is reset. Product and variant data for each line are fetched in the background (no await). When each request completes, `selectedProducts` / `productVariants` are updated so autocomplete and variant dropdowns fill in as data arrives. The user can see and edit the form immediately.

### Mobile
- **Layout:** Tighter padding on mobile (`p-4 sm:p-6`), responsive py/px on the main container (`py-4 sm:py-8`, `px-3 sm:px-6`), single-column grid already in place for Invoice Details.
- **Touch targets:** Back button and primary actions use `min-h-[44px]` or `min-h-[48px]`, `touch-manipulation`, and `rounded-xl` for easier tapping. Footer Save/Cancel stack on small screens (`flex-col-reverse sm:flex-row`) and are full-width on mobile.
- **Inputs:** Invoice fields (Supplier Name, Invoice Date, Net Amount, Notes) use `min-h-[48px]`, `text-base`, and `px-4 py-3` so they’re easier to tap and don’t trigger zoom on focus (e.g. iOS).
- **Sections:** Products, Return Items, and Payments section headers use stacked layout on small screens so the "Add" buttons sit below the title and remain easy to tap.

### Result
- First meaningful paint is right after the single invoice API response; no blocking on product/variant calls.
- Edit Purchase is more usable on phones and small screens with larger tap areas and readable, single-column layout.

---

## Order form multi-media UX (product & variant images/videos)

### Scope
After implementing multiple images and videos for products and variants, the **order form** (both **simple product selector** and **shopping cart** flow) was updated so customers get a consistent, beautiful UX: view all media, see videos where set as primary, and add to cart easily.

### Backend

- **`/api/products/by-ids`** (used by both simple form and shopping cart):
  - Already returns **`productImages`** (full list: `id`, `mediaType`, `isPrimary`, `sortOrder`) ordered by primary first, for gallery and primary display.
  - Already returns **variant `images`** (full list: `id`, `imageType`, `isPrimary`, `sortOrder`) per variant so the frontend can show variant thumbnails and detect video vs image.
  - Formatted response includes `productImages` and `variants` (with `images`) so the client can render galleries and video without extra requests.

### Simple order form (ProductDisplay – PRODUCT_SELECTOR)

- **Product media**
  - Main area shows **primary product media** as image or video (using `productImages[0]` and `mediaType`); videos autoplay muted and loop.
  - If there are **multiple product media**, a **thumbnail strip** appears below; clicking a thumbnail updates the main view (image or video).
  - **Product switcher** thumbnails (when multiple products) show primary image or video per product.
- **Variants**
  - **Variant selector** is a grid of **variant cards** with thumbnail (image or video), color/size label, and stock; selecting a card sets the variant.
  - Videos in variant thumbnails autoplay and loop.
- **Selected products summary**
  - Each line shows a small thumbnail (image or video) from product primary or selected variant primary, with quantity controls and remove.

### Shopping cart order form (ShoppingCartForm)

- **Product cards**
  - Main product image is **primary product media** (image or video); videos autoplay muted and loop.
  - **“View gallery”** button appears when the product has multiple product media or variants with media; opens a **modal** with product media thumbnails and main view (image/video), plus a section for variant media so customers can see all photos and videos.
- **Variant strip**
  - Under each product card, variant thumbnails show **image or video** per variant (using `variant.images[0].imageType`).
- **Variant selection modal**
  - When “Add to Cart” is clicked on a product with variants, the modal lists variants with **thumbnail (image or video)**, color/size, and stock; videos autoplay and loop.
- **Cart**
  - When adding to cart, each item stores **`primaryMediaType`** (from product primary or selected variant primary) so the cart can render video correctly.

### Cart modal (CartModal)

- Each cart line shows **product/variant thumbnail** as **image or video** using `item.primaryMediaType` (video when `primaryMediaType?.startsWith('video/')`).
- Videos in the cart autoplay muted and loop for a consistent experience.

### Result

- **Simple form**: Customers see one product at a time with full product gallery (if multiple media), variant grid with thumbnails (image/video), and a clear selected summary with thumbnails.
- **Shopping cart form**: Product cards show primary video/image, variant strip shows per-variant media, “View gallery” opens a full product + variant media modal, variant picker shows media per variant, and the cart drawer shows video/image per line.
- **Add to cart** remains straightforward: one click for non-variant products; one click to open variant modal then “Add to Cart” for variant products. No breaking changes to order submission or backend order model.

---

## Order forms: multi-media (images & videos) and UX for customers

### Goal
After implementing multiple images and videos for products and variants, ensure the **order form** (both the simple product selector and the shopping-cart style) gives customers a great UX: see products clearly, view all photos and videos (product and variants), and add to cart easily.

### Backend

1. **`routes/products.js` – POST `/products/by-ids`**
   - Response already includes:
     - **productImages**: full list per product (`id`, `mediaType`, `isPrimary`, `sortOrder`), ordered by primary then sortOrder/createAt, so the first item is the primary media. Used by both “all products” and “specific productIds” branches.
     - **variants**: each variant includes **images** array (`id`, `imageType`, `isPrimary`, `sortOrder`) so the frontend can show variant thumbnails and detect video vs image.
   - Formatted response includes `productImages: product.productImages ?? []` so the client always receives an array.

### Frontend – ProductDisplay (simple order form / product selector)

- **Main product area**: Uses `product.productImages` when present. Primary or selected gallery item is shown as **video** (autoPlay, loop, muted) or **image**. Fallback to legacy single image URL when no productImages.
- **Product media gallery**: If a product has multiple `productImages`, thumbnails are shown below the main area; clicking a thumbnail updates the main view. Both images and videos supported in the strip.
- **Product thumbnails** (switching between products): Each product thumbnail is rendered as video or image based on `product.productImages?.[0]?.mediaType`.
- **Variant selection**: Replaced plain dropdown with **variant cards** that show a thumbnail (image or video) per variant, plus color/size and stock. Variants are seeded from `products[].variants` when available (e.g. from by-ids) so variant images are used without an extra fetch.
- **Selected products summary**: Each line shows a small thumbnail (video or image) using variant or product primary media.
- **`getImageUrl`** (api.js): Supports optional `imageId` for product/variant so the correct media item is requested from the public image API.

### Frontend – ShoppingCartForm (shopping-cart style order form)

- **Product cards**: Primary media is shown as **video** (autoPlay, loop, muted) or **image** using `product.productImages?.[0]?.mediaType`. Variant strip below product name shows each variant’s primary media as video or image using `v.images?.[0]?.imageType`.
- **Add to cart**: Cart item stores **primaryMediaType** (from `variant?.images?.[0]?.imageType ?? product.productImages?.[0]?.mediaType`) so the cart and receipt can render video where applicable.
- **Variant selection modal**: When the product has variants, the modal lists variants with a thumbnail (video or image) per variant, stock, and “Add to Cart” for the chosen variant.
- **“View gallery”**: If a product has multiple product media or variants with media, a **“View gallery”** button appears on the product card. It opens a modal that shows:
  - **Product** section: main view (image or video) and thumbnails for all `productImages`; clicking a thumbnail changes the main view.
  - **Variants** section: grid of variant thumbnails (image or video) with variant label (e.g. color, size).

### Frontend – CartModal

- Cart line items use **primaryMediaType** on the item: if `item.primaryMediaType?.startsWith('video/')`, the line shows a **video** (muted, autoPlay, loop); otherwise an image. URL is still built from `getImageUrl('product', item.id)` or `getImageUrl('product-variant', item.variantId)` so the correct primary media is served.

### Result

- **Simple form (ProductDisplay)**: Customers see one product at a time with a clear main image/video, optional gallery thumbnails, variant cards with thumbnails and stock, and a selected summary with media. Adding/removing and quantity work as before.
- **Shopping-cart form**: Product grid shows primary media (image or video), variant strip shows each variant’s media, “View gallery” opens a modal for all product and variant media, variant modal makes it easy to pick a variant and add to cart.
- **Cart**: Cart modal shows each item as image or video according to primary media type, with no extra API calls.

---

## Default 50% markup for retail and sale price (new products from purchase)

### Requirement
At purchase time only purchase price is entered; retail and sale are not. New products created from purchases should have default retail and sale price so they always have a value (50% increase from purchase price).

### Changes
- **purchaseInvoice.js**: When creating products via `createMany`, set `currentRetailPrice` and `lastSalePrice` to `purchasePrice * 1.5`.
- **product.js**: When creating a product via API, if retail/sale not provided but purchase price is, set both to `purchasePrice * 1.5`.
- **images.js**: When creating a product from a purchase item (image upload), set `currentRetailPrice` and `lastSalePrice` to `purchasePrice * 1.5`.
- **inventoryService.js**: All new product creation paths now set both `currentRetailPrice` and `lastSalePrice` to the same 50% markup (already had currentRetailPrice; added lastSalePrice).

### Result
New products created from any purchase path get `lastPurchasePrice`, `currentRetailPrice`, and `lastSalePrice`; retail and sale default to 50% above purchase price when not provided.

---

## Edit Purchase: Create New Product & Variants (parity with Add Purchase)

### Requirement
On Edit Purchase Invoice, provide the same flows as Add Purchase: (1) when a product is not found by search, offer to create a new product and use it in that row; (2) a “+ New” button to open Create Product modal; (3) for products with variants, the “Create new variant (in catalog)” expandable form so users can add a new variant and use it in the purchase.

### Changes (frontend – EditPurchasePage.jsx)

1. **State**
   - `createProductContextIndex`, `createProductPrefillName`, `createProductSku`, `createProductCategory`, `createProductShowNewCategory` for the Create Product modal.
   - `addVariantForIndex`, `isCreatingVariant`, `newVariantInputsByIndex` for the “Create new variant (in catalog)” inline form.

2. **Product search**
   - Dropdown shows when `showProductSuggestions` is true and results exist OR when search returned empty and query length ≥ 2.
   - When there are no results and query ≥ 2: show “No products found – Create product ‘X’ and use it here?” with a clickable “Create ‘X’” that opens the Create Product modal and prefills name.
   - “+ New” button added next to the product name input to open the Create Product modal (with optional prefill from current name).

3. **Create Product modal**
   - Same fields as Add Purchase: name, category (with “+ Add new category”), SKU (auto from name), Stitched product / Has variants, description.
   - On submit: **create product via API** (`POST /product`) immediately (no pending-in-memory); on success, call `handleProductSelect(index, newProduct)` for the context row, refresh categories if new category, close modal. Product is created in DB and selected for that row.

4. **Variants section**
   - After “Add variant line”, added “Create new variant (in catalog)” button (only when product has variants and a real product id).
   - When expanded: Color (required), Size (required if stitched), datalists from existing variants, “Add & use” / “Cancel”. “Add & use” calls `handleCreateVariant(firstIndex)` using `newVariantInputsByIndex[firstIndex]` for color/size; on success, variant list is refreshed and the new variant is selected on the first line; inline form is closed.

5. **handleCreateVariant**
   - When `addVariantForIndex === index` (inline “Create new variant” form open), uses `newVariantInputsByIndex[index]` for color/size; otherwise uses the row’s `watch('items.{index}.color/size')` (existing behavior for the single-line “Create New Variant” button). After creating from inline form, clears `addVariantForIndex` and `newVariantInputsByIndex` for that index.

6. **removeItem / removeProductGroup**
   - When removing a row or a product group, `addVariantForIndex` and `newVariantInputsByIndex` are adjusted/cleared so indices stay consistent.

### Result
- Edit Purchase now matches Add Purchase for: “create new product if not found” (from search or “+ New”), Create Product modal with immediate API create, and “Create new variant (in catalog)” in the variants section with the same UX (expandable form, Add & use, Cancel).

---

## Customers List Pending Balance vs Detail Page

### Issue
On the Customers list, the amount shown next to a customer (e.g. "Rs. 1,200" as pending) did not match the customer detail page Pending Balance (Rs. 3,200). The detail page was correct; the list was wrong.

### Cause
- **List** uses `customerService.calculatePendingPayment(customerId)`, which (1) only included orders with `status: 'CONFIRMED'`, and (2) used `order.verifiedPaymentAmount` as paid. So DISPATCHED/COMPLETED orders were excluded, and paid amount did not match actual Payment records.
- **Detail** uses `balanceService.calculateCustomerBalance()` (and Overview/Orders tiles): includes CONFIRMED, DISPATCHED, COMPLETED; paid = sum of Payment records (CUSTOMER_PAYMENT) per order.

### Fix
**Backend `services/customerService.js` – `calculatePendingPayment()`**
- Include orders with `status: { in: ['CONFIRMED', 'DISPATCHED', 'COMPLETED'] }` (same as balanceService).
- Fetch Payment records for the customer (`type: 'CUSTOMER_PAYMENT'`, `orderId` not null), group by `orderId`, and use sum per order as paid amount (no longer `order.verifiedPaymentAmount`).
- Use `orderItems` for order total when present (same as balanceService); otherwise legacy selectedProducts/productQuantities/productPrices.
- Include `refundAmount` and subtract it: `pending = orderTotal - paidAmount - refundAmount`.

### Result
Customers list "Pending: Rs. X" now matches the customer detail page Pending Balance (e.g. Rs. 3,200 when total spent 4,200 and total paid 1,000).

---

## Customer Dashboard Payments Tab & Record Payment

### Issue
1. Payments were not appearing on the Customer dashboard Payments tab.
2. Record Payment on the customer dashboard should work the same as the order payment section.

### Cause
1. **Payments not showing**: CustomerDetailsPage used `response.data.payments` but the accounting payments API returns `response.data.data` (same as PaymentsPage, OrderDetailsPage, SupplierDetailsPage).
2. **Record Payment**: When selecting an order, payment account was optional; orders require a payment account (same as OrderDetailsPage Receive Payment flow).

### Fix
**Frontend `CustomerDetailsPage.jsx`**
- `fetchPayments()`: Use `response.data.data` when `response.data?.success` (instead of `response.data.payments`).
- Record Payment modal: Require payment account when an order is selected (`needsAccount = isOrderPayment || paymentIsVerified`); show validation error if missing.
- Payment Account label: Show required asterisk when `paymentOrderId || paymentIsVerified`.
- PaymentAccountSelector: Set `required={!!paymentOrderId || paymentIsVerified}`.
- Record Payment handler: Add success check; consistent error handling for both string and object error formats.
- Verify Payment handler: Same error handling for backend error response.

### Result
- Payments tab now displays payment history correctly.
- Record Payment requires payment account for order-linked payments (matches order page flow).
- Error toasts show correct messages from backend.

---

## Shipping Variance Not Appearing in Accounting Ledger

### Issue
Profit & Analytics correctly showed Rs. 100 shipping variance (expense), but the amount did not appear in Accounting and the user could not see on which account it was posted or in that account’s ledger.

### Cause
- Shipping variance **expense** is intended to be posted to **account 5110 – Shipping Variance Expense** (and 5100 – Shipping Expense).
- The journal entry was **unbalanced**: it posted two debits (Dr 5100, Dr 5110) with **no credit**. `accountingService.createTransaction()` requires debits = credits and throws; the error was caught and logged, so the order was still updated with `shippingVariance = -100` but **no accounting transaction was created**. Hence the variance appeared in profit stats but not in any ledger.
- Reversal entries when clearing or changing variance (e.g. expense → cleared) also used two credits with no debit and would have failed the same way.

### Fix
1. **Backend `routes/order.js`**
   - **Dispatch path (variance expense):** Replaced the unbalanced “Dr 5100, Dr 5110” with a balanced entry: **Dr Shipping Variance Expense (5110), Cr Shipping Expense (5100)**. The Rs. 100 expense now posts to 5110 and appears on that account’s ledger.
   - **Adjust-shipping-cost path (expense):** Same balanced entry (Dr 5110, Cr 5100) for new or adjusted variance expense.
   - **Reversals:** When clearing variance or switching from expense to income (or vice versa), reversals updated to balanced entries that reverse the above (e.g. Dr 5100, Cr 5110 when clearing expense variance).
2. **Frontend `ReportsPage.jsx`**
   - Under Shipping Variance Analysis, added a short note: variance expense is posted to **Shipping Variance Expense (5110)** and variance income to **Shipping Variance Income (4300)**, and that their ledgers can be viewed under Accounting → Accounts → select account → View Ledger.

### Where to see it in Accounting
- **Account:** **5110 – Shipping Variance Expense** (type EXPENSE).
- **Ledger:** Accounting → Accounts → find “Shipping Variance Expense (5110)” → **View Ledger**. Each shipping variance expense (e.g. “Shipping Variance (Expense): 1004-FEB-26-001”) appears as a debit line there.

### Existing orders with variance but no ledger entry
For orders that already had shipping variance (e.g. Rs. 100) recorded before this fix, no accounting entry was created. To post them now you can: (1) open the order, go to shipping adjustment, re-enter the same actual shipping cost and save (this will create the balanced entry), or (2) use a one-time backfill script if needed for many orders.

---

## Associate Direct Payment with Order (No Accounting)

### Requirement
On the Customer dashboard Payments tab, for payments that are **not yet associated with an order** (direct payments), allow the user to associate them with an order. **No new accounting entry** should be created, because the amount is already posted (e.g. to Customer Advance Balance).

### Changes

1. **Backend `routes/accounting/payments.js`**
   - New endpoint: `PATCH /accounting/payments/:id/associate-order`
   - Body: `{ orderId: string }`
   - Validates: payment exists, is CUSTOMER_PAYMENT, currently has `orderId = null` (direct payment), order belongs to same customer
   - Updates only `payment.orderId`; no accounting transaction created
   - Returns success with updated payment including order relation

2. **Frontend `CustomerDetailsPage.jsx`**
   - For direct payments (`!payment.orderId`), show "Associate with Order" button instead of disabled "View Order"
   - Modal to select an order from `customerOrders` dropdown
   - Calls `PATCH /accounting/payments/:id/associate-order` with selected `orderId`
   - Refreshes payments and customer details on success
   - Modal copy clarifies: "This payment has already been posted. Linking it to an order will update the record only—no new accounting entry will be created."

### Result
- Direct payments can be linked to a customer order without creating a new accounting entry
- Balance and ledger continue to reconcile correctly (Payment record update is sufficient; balanceService already uses Payment records for order-linked vs direct payments)