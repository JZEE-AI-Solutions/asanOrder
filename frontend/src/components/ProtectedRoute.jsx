import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LoadingSpinner from './LoadingSpinner'

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, loading, isAuthenticated } = useAuth()

  if (loading) {
    return <LoadingSpinner />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // Redirect based on user role
    switch (user.role) {
      case 'ADMIN':
        return <Navigate to="/admin" replace />
      case 'BUSINESS_OWNER':
        return <Navigate to="/business" replace />
      case 'STOCK_KEEPER':
        return <Navigate to="/stock" replace />
      default:
        return <Navigate to="/login" replace />
    }
  }

  return children
}

export default ProtectedRoute
