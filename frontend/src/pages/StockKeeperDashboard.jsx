import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import OrderDetailsModal from '../components/OrderDetailsModal'
import { 
  ShoppingBagIcon,
  EyeIcon,
  TruckIcon,
  CheckIcon
} from '@heroicons/react/24/outline'

const StockKeeperDashboard = () => {
  const { user, logout } = useAuth()
  const [orders, setOrders] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [statusFilter, setStatusFilter] = useState('CONFIRMED')

  useEffect(() => {
    fetchDashboardData()
  }, [statusFilter])

  const fetchDashboardData = async () => {
    try {
      const [ordersRes, statsRes] = await Promise.all([
        api.get(`/order?status=${statusFilter}&limit=50`),
        api.get('/order/stats/dashboard')
      ])

      setOrders(ordersRes.data.orders)
      setStats(statsRes.data.stats)
    } catch (error) {
      toast.error('Failed to fetch dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const dispatchOrder = async (orderId) => {
    try {
      await api.post(`/order/${orderId}/dispatch`)
      toast.success('Order dispatched successfully!')
      fetchDashboardData()
    } catch (error) {
      toast.error('Failed to dispatch order')
    }
  }

  const getStatusBadge = (status) => {
    const badges = {
      PENDING: 'badge badge-pending',
      CONFIRMED: 'badge badge-confirmed',
      DISPATCHED: 'badge badge-dispatched',
      CANCELLED: 'badge badge-cancelled'
    }
    return badges[status] || 'badge'
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'CONFIRMED':
        return '✅'
      case 'DISPATCHED':
        return '🚚'
      case 'COMPLETED':
        return '🎉'
      default:
        return '📦'
    }
  }

  if (loading) {
    return <LoadingSpinner className="min-h-screen" />
  }

  return (
    <div className="page-container">
      {/* Header */}
      <header className="bg-white shadow-2xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 text-gradient">Stock Keeper Dashboard</h1>
              <p className="text-gray-600">Welcome back, {user.name}</p>
            </div>
            <button
              onClick={logout}
              className="btn-outline-gray"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8">
          <div className="card-compact text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-pink-100 rounded-full flex items-center justify-center">
              <CheckIcon className="h-6 w-6 text-pink-600" />
            </div>
            <p className="text-2xl font-bold text-pink-600 mb-1">{stats?.confirmedOrders || 0}</p>
            <p className="text-sm font-semibold text-gray-600">Ready to Dispatch</p>
          </div>

          <div className="card-compact text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center">
              <TruckIcon className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-600 mb-1">{stats?.dispatchedOrders || 0}</p>
            <p className="text-sm font-semibold text-gray-600">Dispatched</p>
          </div>

          <div className="card-compact text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-purple-100 rounded-full flex items-center justify-center">
              <ShoppingBagIcon className="h-6 w-6 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-1">{stats?.totalOrders || 0}</p>
            <p className="text-sm font-semibold text-gray-600">Total Orders</p>
          </div>
        </div>

        {/* Orders Section */}
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                <ShoppingBagIcon className="h-5 w-5 text-purple-600" />
              </div>
              Orders
            </h3>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field w-auto"
            >
              <option value="CONFIRMED">Ready to Dispatch</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="all">All Orders</option>
            </select>
          </div>

          {orders.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShoppingBagIcon className="h-8 w-8 text-gray-400" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">No Orders Found</h4>
              <p className="text-gray-500">
                {statusFilter === 'CONFIRMED' 
                  ? 'No orders ready for dispatch' 
                  : 'No orders found'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => {
                const formData = JSON.parse(order.formData)
                return (
                  <div key={order.id} className="card-compact hover:shadow-xl hover:border-pink-300 transition-all duration-300 group">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          <span className="text-2xl mr-3">{getStatusIcon(order.status)}</span>
                          <h4 className="font-semibold text-gray-900 group-hover:text-pink-600 transition-colors">
                            Order #{order.orderNumber}
                          </h4>
                          <span className={`ml-3 badge ${getStatusBadge(order.status)}`}>
                            {order.status}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-600 space-y-1">
                          <p><span className="font-semibold">Business:</span> {order.tenant.businessName}</p>
                          <p><span className="font-semibold">Customer:</span> {formData['Customer Name'] || 'N/A'}</p>
                          <p><span className="font-semibold">Phone:</span> {formData['Mobile Number'] || 'N/A'}</p>
                          <p><span className="font-semibold">Address:</span> {formData['Shipping Address'] || 'N/A'}</p>
                          {formData['Payment Amount'] && (
                            <p><span className="font-semibold">Amount:</span> <span className="font-bold text-green-600">Rs. {formData['Payment Amount']}</span></p>
                          )}
                          <p><span className="font-semibold">Confirmed:</span> {new Date(order.updatedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="btn-outline text-sm py-2 px-3 flex items-center"
                        >
                          <EyeIcon className="h-4 w-4 mr-1" />
                          View
                        </button>
                        
                        {order.status === 'CONFIRMED' && (
                          <button
                            onClick={() => dispatchOrder(order.id)}
                            className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 px-3 rounded-lg flex items-center transition-colors duration-200 shadow-lg hover:shadow-xl"
                          >
                            <TruckIcon className="h-4 w-4 mr-1" />
                            Dispatch
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Quick Info */}
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Form: {order.form?.name}</span>
                        <span>
                          {order.status === 'CONFIRMED' 
                            ? '🔄 Ready for dispatch' 
                            : order.status === 'DISPATCHED' 
                            ? '✅ Dispatched' 
                            : '📦 Processing'
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">Instructions</h4>
          <div className="text-sm text-blue-800 space-y-1">
            <p>• Review confirmed orders and verify customer details</p>
            <p>• Check dress images and requirements carefully</p>
            <p>• Mark orders as "Dispatched" once they're ready for delivery</p>
            <p>• Contact business owner if you have any questions about an order</p>
          </div>
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onConfirm={selectedOrder.status === 'CONFIRMED' ? dispatchOrder : null}
        />
      )}
    </div>
  )
}

export default StockKeeperDashboard
