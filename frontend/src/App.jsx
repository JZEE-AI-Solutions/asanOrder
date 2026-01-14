import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import SuspenseWrapper from './components/SuspenseWrapper'

// Lazy loaded components
import {
  LazyAdminDashboard,
  LazyTenantDetails,
  LazyBusinessDashboard,
  LazyBusinessDashboardRefactored,
  LazyModernDashboard,
  LazyOrdersScreen,
  LazyOrdersPage,
  LazyFormsPage,
  LazyCustomersPage,
  LazySuppliersPage,
  LazyProductsPage,
  LazyPurchasesPage,
  LazyReturnsPage,
  LazySupplierReturnsPage,
  LazyCreateReturnPage,
  LazyCreateSupplierReturnPage,
  LazyCreateStandaloneSupplierReturnPage,
  LazyVendorsPage,
  LazyOrderDetailsPage,
  LazyStockKeeperDashboard,
  LazyClientFormDynamic,
  LazyOrderReceipt,
  LazyCustomerDetailsPage,
  LazyAddCustomerPage,
  LazyAddSupplierPage,
  LazyEditSupplierPage,
  LazyAddProductPage,
  LazyEditProductPage,
  LazyAddPurchasePage,
  LazyProductManagementPage,
  LazyReportsPage,
  LazyEditPurchasePage,
  LazyPurchaseInvoiceDetailsPage,
  LazyCreateFormPage,
  LazyEditFormPage,
  LazySettingsPage,
  LazyAccountingDashboard,
  LazyExpensesPage,
  LazyBalancesPage,
  LazyTransactionsPage,
  LazyPaymentsPage,
  LazyAccountingReturnsPage,
  LazyAccountingSettingsPage,
  LazyAccountLedgerPage,
  LazySupplierLedgerPage,
  LazyCustomerLedgerPage
} from './components/LazyComponents'

// Synchronous components
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-gray-50">
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/form/:formLink" element={
                <SuspenseWrapper>
                  <LazyClientFormDynamic />
                </SuspenseWrapper>
              } />
              <Route path="/order/:orderId" element={
                <SuspenseWrapper>
                  <LazyOrderReceipt />
                </SuspenseWrapper>
              } />

              {/* Protected routes */}
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <SuspenseWrapper>
                    <LazyAdminDashboard />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/admin/tenant/:tenantId" element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <SuspenseWrapper>
                    <LazyTenantDetails />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyModernDashboard />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/orders" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyOrdersPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/orders/:orderId" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyOrderDetailsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/customers" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyCustomersPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/customers/new" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyAddCustomerPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/customers/:customerId" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyCustomerDetailsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/customers/:customerId/ledger" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyCustomerLedgerPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/suppliers" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazySuppliersPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/suppliers/new" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyAddSupplierPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/suppliers/:supplierId/edit" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyEditSupplierPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/suppliers/:id/ledger" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazySupplierLedgerPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/forms" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyFormsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/forms/new" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyCreateFormPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/forms/:formId/edit" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyEditFormPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/forms/:formId/products" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyProductManagementPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/products" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyProductsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/products/new" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyAddProductPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/products/:productId/edit" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyEditProductPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/settings" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazySettingsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/reports" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyReportsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/purchases" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyPurchasesPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/purchases/add" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyAddPurchasePage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/purchases/:invoiceId" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyPurchaseInvoiceDetailsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />
              <Route path="/business/purchases/:invoiceId/edit" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyEditPurchasePage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/returns" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazySupplierReturnsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/returns/new" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyCreateReturnPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/returns/supplier/new" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyCreateSupplierReturnPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/returns/standalone/new" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyCreateStandaloneSupplierReturnPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/vendors" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyVendorsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              {/* Accounting routes */}
              <Route path="/business/accounting" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyAccountingDashboard />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/accounting/expenses" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyExpensesPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/accounting/balances" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyBalancesPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/accounting/transactions" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyTransactionsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/accounting/payments" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyPaymentsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/accounting/returns" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyAccountingReturnsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/accounting/settings" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyAccountingSettingsPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              <Route path="/business/accounting/ledger/:accountId" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyAccountLedgerPage />
                  </SuspenseWrapper>
                </ProtectedRoute>
              } />

              {/* Default redirect based on role */}
              <Route path="/" element={<Login />} />
            </Routes>

            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
              }}
            />
          </div>
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
