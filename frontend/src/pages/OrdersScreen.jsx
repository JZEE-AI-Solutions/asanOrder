import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import OrderDetailsModal from '../components/OrderDetailsModal'
import { 
  ArrowLeftIcon,
  ShoppingBagIcon,
  EyeIcon,
  CheckIcon,
  FunnelIcon,
  PhotoIcon,
  CalendarIcon,
  UserIcon,
  PhoneIcon,
  CurrencyDollarIcon
} from '@heroicons/react/24/outline'

const OrdersScreen = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('newest')

  // Get default filter from URL state
  useEffect(() => {
    if (location.state?.defaultFilter) {
      setStatusFilter(location.state.defaultFilter)
    }
  }, [location.state])

  useEffect(() => {
    fetchOrders()
  }, [statusFilter, sortBy])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/order?status=${statusFilter}&limit=100&sort=${sortBy}`)
      setOrders(response.data.orders)
    } catch (error) {
      toast.error('Failed to fetch orders')
    } finally {
      setLoading(false)
    }
  }

  const confirmOrder = async (orderId) => {
    try {
      await api.post(`/order/${orderId}/confirm`)
      toast.success('Order confirmed successfully!')
      fetchOrders()
    } catch (error) {
      toast.error('Failed to confirm order')
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
      case 'PENDING':
        return '⏳'
      case 'CONFIRMED':
        return '✅'
      case 'DISPATCHED':
        return '🚚'
      case 'COMPLETED':
        return '🎉'
      case 'CANCELLED':
        return '❌'
      default:
        return '📋'
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING':
        return 'text-yellow-600'
      case 'CONFIRMED':
        return 'text-green-600'
      case 'DISPATCHED':
        return 'text-blue-600'
      case 'CANCELLED':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  const filteredOrders = orders.filter(order => {
    const formData = JSON.parse(order.formData)
    const customerName = formData['Customer Name'] || ''
    const phone = formData['Mobile Number'] || ''
    const searchLower = searchTerm.toLowerCase()
    
    return customerName.toLowerCase().includes(searchLower) || 
           phone.includes(searchLower) ||
           order.id.toLowerCase().includes(searchLower)
  })

  const renderDressImages = (order) => {
    if (!order.images) return null
    
    try {
      const images = JSON.parse(order.images)
      if (!images || images.length === 0) return null

      return (
        <div className="mt-3">
          <div className="flex items-center mb-2">
            <PhotoIcon className="h-4 w-4 text-gray-500 mr-1" />
            <span className="text-sm font-medium text-gray-700">Dress Images ({images.length})</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {images.slice(0, 4).map((image, index) => (
              <div key={index} className="relative group">
                <img
                  src={`http://localhost:5000/uploads/${image}`}
                  alt={`Dress ${index + 1}`}
                  className="w-full h-16 sm:h-20 object-cover rounded-lg border border-gray-200"
                  onError={(e) => {
                    e.target.style.display = 'none'
                  }}
                />
                {images.length > 4 && index === 3 && (
                  <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                    <span className="text-white text-xs font-medium">+{images.length - 4}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    } catch (error) {
      return null
    }
  }

  if (loading) {
    return <LoadingSpinner className="min-h-screen" />
  }

  return (
    <div className="page-container">
      {/* Header */}
      <header className="bg-white shadow-2xl sticky top-0 z-10 border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-4">
            <button
              onClick={() => navigate('/business')}
              className="mr-4 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 text-gradient">Orders</h1>
              <p className="text-sm text-gray-600">
                {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} found
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Filters */}
        <div className="card mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="form-label">Search</label>
              <input
                type="text"
                placeholder="Search by customer name, phone, or order ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="form-label">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input-field"
              >
                <option value="all">All Orders</option>
                <option value="PENDING">Pending</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="DISPATCHED">Dispatched</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="form-label">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="input-field"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="status">By Status</option>
              </select>
            </div>
          </div>
        </div>

        {/* Orders List */}
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingBagIcon className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Orders Found</h3>
            <p className="text-gray-600">
              {searchTerm ? 'No orders match your search criteria.' : 'No orders found for the selected status.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const formData = JSON.parse(order.formData)
              return (
                <div key={order.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
                  <div className="flex flex-col lg:flex-row lg:items-start space-y-4 lg:space-y-0 lg:space-x-6">
                    {/* Order Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center mb-3">
                        <span className="text-xl mr-3">{getStatusIcon(order.status)}</span>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">
                            Order #{order.orderNumber}
                          </h3>
                          <span className={`${getStatusBadge(order.status)} text-sm`}>
                            {order.status}
                          </span>
                        </div>
                      </div>

                      {/* Customer Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div className="flex items-center text-sm">
                          <UserIcon className="h-4 w-4 text-gray-500 mr-2" />
                          <span className="font-medium text-gray-700">Customer:</span>
                          <span className="ml-2 text-gray-900">{formData['Customer Name'] || 'N/A'}</span>
                        </div>
                        <div className="flex items-center text-sm">
                          <PhoneIcon className="h-4 w-4 text-gray-500 mr-2" />
                          <span className="font-medium text-gray-700">Phone:</span>
                          <span className="ml-2 text-gray-900">{formData['Mobile Number'] || 'N/A'}</span>
                        </div>
                        <div className="flex items-center text-sm">
                          <CalendarIcon className="h-4 w-4 text-gray-500 mr-2" />
                          <span className="font-medium text-gray-700">Date:</span>
                          <span className="ml-2 text-gray-900">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {formData['Payment Amount'] && (
                          <div className="flex items-center text-sm">
                            <CurrencyDollarIcon className="h-4 w-4 text-gray-500 mr-2" />
                            <span className="font-medium text-gray-700">Amount:</span>
                            <span className="ml-2 text-gray-900">Rs. {formData['Payment Amount']}</span>
                          </div>
                        )}
                      </div>

                      {/* Dress Images */}
                      {renderDressImages(order)}

                      {/* Additional Info */}
                      {formData['Dress Size'] && (
                        <div className="mt-3 text-sm">
                          <span className="font-medium text-gray-700">Size:</span>
                          <span className="ml-2 text-gray-900">{formData['Dress Size']}</span>
                        </div>
                      )}
                      {formData['Dress Quantity'] && (
                        <div className="mt-1 text-sm">
                          <span className="font-medium text-gray-700">Quantity:</span>
                          <span className="ml-2 text-gray-900">{formData['Dress Quantity']}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row lg:flex-col space-y-2 sm:space-y-0 sm:space-x-2 lg:space-x-0 lg:space-y-2">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="w-full sm:w-auto lg:w-full border border-primary-600 text-primary-600 hover:bg-primary-50 text-sm py-2 px-4 rounded flex items-center justify-center"
                      >
                        <EyeIcon className="h-4 w-4 mr-2" />
                        View Details
                      </button>
                      
                      {order.status === 'PENDING' && (
                        <button
                          onClick={() => confirmOrder(order.id)}
                          className="w-full sm:w-auto lg:w-full bg-green-600 hover:bg-green-700 text-white text-sm py-2 px-4 rounded flex items-center justify-center"
                        >
                          <CheckIcon className="h-4 w-4 mr-2" />
                          Confirm Order
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <OrderDetailsModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onConfirm={confirmOrder}
        />
      )}
    </div>
  )
}

export default OrdersScreen
