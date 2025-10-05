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
  LazyOrdersScreen,
  LazyStockKeeperDashboard,
  LazyClientFormDynamic,
  LazyOrderReceipt
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
                  <LazyBusinessDashboardRefactored />
                </SuspenseWrapper>
              </ProtectedRoute>
            } />
            
            <Route path="/business/orders" element={
              <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                <SuspenseWrapper>
                  <LazyOrdersScreen />
                </SuspenseWrapper>
              </ProtectedRoute>
            } />
            
            <Route path="/stock" element={
              <ProtectedRoute allowedRoles={['STOCK_KEEPER']}>
                <SuspenseWrapper>
                  <LazyStockKeeperDashboard />
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
