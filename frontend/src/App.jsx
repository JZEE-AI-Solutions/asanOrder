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
  LazyProductsPage,
  LazyPurchasesPage,
  LazyReturnsPage,
  LazyVendorsPage,
  LazyOrderDetailsPage,
  LazyStockKeeperDashboard,
  LazyClientFormDynamic,
  LazyOrderReceipt,
  LazyCustomerDetailsPage,
  LazyAddCustomerPage,
  LazyAddProductPage,
  LazyProductManagementPage,
  LazyReportsPage
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

              <Route path="/business/forms" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyFormsPage />
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

              <Route path="/business/returns" element={
                <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                  <SuspenseWrapper>
                    <LazyReturnsPage />
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
