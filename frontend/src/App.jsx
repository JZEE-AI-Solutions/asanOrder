import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'

// Pages
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import TenantDetails from './pages/TenantDetails'
import BusinessDashboard from './pages/BusinessDashboard'
import OrdersScreen from './pages/OrdersScreen'
import StockKeeperDashboard from './pages/StockKeeperDashboard'
import ClientFormDynamic from './pages/ClientFormDynamic'
import OrderReceipt from './pages/OrderReceipt'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/form/:formLink" element={<ClientFormDynamic />} />
            <Route path="/order/:orderId" element={<OrderReceipt />} />
            
            {/* Protected routes */}
            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminDashboard />
              </ProtectedRoute>
            } />
            
            <Route path="/admin/tenant/:tenantId" element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <TenantDetails />
              </ProtectedRoute>
            } />
            
            <Route path="/business" element={
              <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                <BusinessDashboard />
              </ProtectedRoute>
            } />
            
            <Route path="/business/orders" element={
              <ProtectedRoute allowedRoles={['BUSINESS_OWNER']}>
                <OrdersScreen />
              </ProtectedRoute>
            } />
            
            <Route path="/stock" element={
              <ProtectedRoute allowedRoles={['STOCK_KEEPER']}>
                <StockKeeperDashboard />
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
  )
}

export default App
