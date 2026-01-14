import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import api, { getImageUrl } from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import WhatsAppConfirmationModal from '../components/WhatsAppConfirmationModal'

import {
  ShoppingBagIcon,
  EyeIcon,
  CheckIcon,
  FunnelIcon,
  PhotoIcon,
  CalendarIcon,
  UserIcon,
  PhoneIcon,
  CurrencyDollarIcon,
  Squares2X2Icon,
  ListBulletIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'
import { useOrderStats } from '../hooks/useOrders'
import { StatsCard } from '../components/ui/StatsCard'

const OrdersScreen = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const { stats: orderStats, loading: statsLoading, refreshStats } = useOrderStats()

  useEffect(() => {
    refreshStats()
  }, [])

  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [displayMode, setDisplayMode] = useState('card')

  // Helper function to find phone number from formData
  const getPhoneNumber = (formData) => {
    if (!formData) return 'N/A'
    
    // Try common phone field names
    const phoneFieldNames = [
      'Phone Number',
      'Mobile Number',
      'Contact Number',
      'Phone',
      'Mobile',
      'Contact',
      'WhatsApp Number',
      'WhatsApp'
    ]
    
    // First, try exact matches
    for (const fieldName of phoneFieldNames) {
      if (formData[fieldName]) {
        return formData[fieldName]
      }
    }
    
    // Then, try case-insensitive partial matches
    const formDataKeys = Object.keys(formData)
    for (const key of formDataKeys) {
      const lowerKey = key.toLowerCase()
      if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('contact')) {
        return formData[key]
      }
    }
    
    return 'N/A'
  }

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

  const [whatsappModal, setWhatsappModal] = useState({ isOpen: false, url: null, phone: null })

  const confirmOrder = async (orderId) => {
    try {
      const response = await api.post(`/order/${orderId}/confirm`)
      toast.success('Order confirmed successfully!')
      
      // Show WhatsApp confirmation modal if URL is available
      if (response.data.whatsappUrl) {
        setWhatsappModal({
          isOpen: true,
          url: response.data.whatsappUrl,
          phone: response.data.customerPhone || 'customer'
        })
      }
      
      fetchOrders()
      refreshStats()
    } catch (error) {
      toast.error('Failed to confirm order')
    }
  }

  const handleWhatsAppConfirm = () => {
    if (whatsappModal.url) {
      // Open WhatsApp in a new tab/window
      const whatsappWindow = window.open(whatsappModal.url, '_blank', 'noopener,noreferrer')
      
      if (whatsappWindow) {
        toast.success('Opening WhatsApp...', { duration: 2000 })
      } else {
        toast.error('Please allow popups to open WhatsApp', { duration: 3000 })
      }
    }
    setWhatsappModal({ isOpen: false, url: null, phone: null })
  }

  const handleWhatsAppCancel = () => {
    setWhatsappModal({ isOpen: false, url: null, phone: null })
  }

  const getStatusBadge = (status) => {
    const styles = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      CONFIRMED: 'bg-green-100 text-green-800',
      DISPATCHED: 'bg-blue-100 text-blue-800',
      CANCELLED: 'bg-red-100 text-red-800',
      COMPLETED: 'bg-purple-100 text-purple-800'
    }
    return `px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status] || 'bg-gray-100 text-gray-800'}`
  }

  const filteredOrders = orders.filter(order => {
    try {
      const formData = JSON.parse(order.formData)
      const customerName = formData['Customer Name'] || ''
      const phone = getPhoneNumber(formData) || ''
      const searchLower = searchTerm.toLowerCase()

      return customerName.toLowerCase().includes(searchLower) ||
        phone.toLowerCase().includes(searchLower) ||
        order.orderNumber?.toLowerCase().includes(searchLower)
    } catch (e) {
      return false
    }
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
          <div className="flex -space-x-2 overflow-hidden">
            {images.slice(0, 4).map((image, index) => (
              <img
                key={index}
                src={getImageUrl('order-image', image)} // Assuming backend handles this path or direct URL
                alt={`Dress ${index + 1}`}
                className="inline-block h-8 w-8 rounded-full ring-2 ring-white object-cover"
                onError={(e) => {
                  // Fallback for old image paths if needed, or placeholder
                  if (!e.target.src.includes('localhost:5000')) {
                    e.target.src = `http://localhost:5000/uploads/${image}`
                  } else {
                    e.target.style.display = 'none'
                  }
                }}
              />
            ))}
            {images.length > 4 && (
              <div className="flex items-center justify-center h-8 w-8 rounded-full ring-2 ring-white bg-gray-100 text-xs font-medium text-gray-500">
                +{images.length - 4}
              </div>
            )}
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-brand-600">Orders</h1>
            <p className="text-gray-500 mt-1">Manage and track your customer orders</p>
          </div>
          <button
            onClick={() => {
              fetchOrders()
              refreshStats()
            }}
            className="p-2 text-gray-500 hover:text-brand-600 transition-colors rounded-lg hover:bg-gray-100"
            title="Refresh"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Stats Grid - Essential Stats Only */}
        {orderStats?.stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <StatsCard
              title="Total Orders"
              value={orderStats.stats.totalOrders}
              icon={ShoppingBagIcon}
              iconClassName="bg-pink-100 text-pink-600"
            />
            <StatsCard
              title="Total Revenue"
              value={`Rs. ${orderStats.stats.totalRevenue?.toLocaleString() || 0}`}
              icon={CurrencyDollarIcon}
              iconClassName="bg-green-100 text-green-600"
            />
            <StatsCard
              title="Pending Orders"
              value={orderStats.stats.pendingOrders}
              icon={ClockIcon}
              iconClassName="bg-yellow-100 text-yellow-600"
            />
            <StatsCard
              title="This Month"
              value={orderStats.stats.ordersThisMonth || 0}
              icon={CalendarIcon}
              iconClassName="bg-blue-100 text-blue-600"
            />
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          <div className="sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-field"
            >
              <option value="all">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="sm:w-48">
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

          <div className="flex space-x-2">
            <button
              onClick={() => setDisplayMode('card')}
              className={`p-2 rounded-lg transition-colors ${displayMode === 'card'
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              <Squares2X2Icon className="h-5 w-5" />
            </button>
            <button
              onClick={() => setDisplayMode('list')}
              className={`p-2 rounded-lg transition-colors ${displayMode === 'list'
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              <ListBulletIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingBagIcon className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Orders Found</h3>
          <p className="text-gray-500">Try adjusting your filters or search criteria.</p>
        </div>
      ) : displayMode === 'list' ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Products</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredOrders.map((order) => {
                  const formData = JSON.parse(order.formData)
                  
                  // Parse products data
                  let selectedProducts = []
                  let productQuantities = {}
                  let productPrices = {}
                  let productsTotal = 0
                  
                  try {
                    if (order.selectedProducts) {
                      const parsed = typeof order.selectedProducts === 'string' 
                        ? JSON.parse(order.selectedProducts) 
                        : order.selectedProducts
                      
                      // Ensure it's an array
                      if (Array.isArray(parsed)) {
                        selectedProducts = parsed
                      } else if (typeof parsed === 'object' && parsed !== null) {
                        // Convert object to array
                        selectedProducts = Object.values(parsed)
                      } else {
                        selectedProducts = []
                      }
                    }
                    if (order.productQuantities) {
                      const parsed = typeof order.productQuantities === 'string'
                        ? JSON.parse(order.productQuantities)
                        : order.productQuantities
                      productQuantities = typeof parsed === 'object' && parsed !== null ? parsed : {}
                    }
                    if (order.productPrices) {
                      const parsed = typeof order.productPrices === 'string'
                        ? JSON.parse(order.productPrices)
                        : order.productPrices
                      productPrices = typeof parsed === 'object' && parsed !== null ? parsed : {}
                    }
                    
                    // Calculate products total
                    if (Array.isArray(selectedProducts)) {
                      selectedProducts.forEach(product => {
                        const quantity = productQuantities[product.id] || product.quantity || 1
                        const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0
                        productsTotal += quantity * price
                      })
                    }
                  } catch (e) {
                    console.error('Error parsing products:', e)
                    selectedProducts = []
                  }
                  
                  const shippingCharges = parseFloat(order.shippingCharges || 0)
                  const paymentAmount = parseFloat(order.paymentAmount || formData['Payment Amount'] || 0)
                  const orderTotal = productsTotal + shippingCharges
                  const receivedAmount = paymentAmount
                  const pendingAmount = Math.max(0, orderTotal - receivedAmount)
                  const displayTotal = orderTotal > 0 ? orderTotal : paymentAmount
                  
                  return (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        {order.orderNumber}
                      </td>
                      <td className="px-6 py-4">
                        {Array.isArray(selectedProducts) && selectedProducts.length > 0 ? (
                          <div className="flex items-center space-x-2">
                            <div className="flex -space-x-1">
                              {selectedProducts.slice(0, 3).map((product, idx) => {
                                if (!product || !product.id) return null
                                return (
                                  <img
                                    key={product.id || idx}
                                    src={getImageUrl('product', product.id)}
                                    alt={product.name || 'Product'}
                                    className="w-8 h-8 rounded border border-gray-300 object-cover"
                                    onError={(e) => {
                                      e.target.style.display = 'none'
                                    }}
                                  />
                                )
                              })}
                            </div>
                            <div className="text-xs">
                              <div className="font-semibold text-gray-900">{selectedProducts[0]?.name || 'Products'}</div>
                              {selectedProducts.length > 1 && (
                                <div className="text-gray-500">+{selectedProducts.length - 1} more</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">No products</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{formData['Customer Name'] || 'N/A'}</div>
                        <div className="text-sm text-gray-500">{getPhoneNumber(formData)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={getStatusBadge(order.status)}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          <div className="font-bold text-gray-900">Rs. {displayTotal.toLocaleString()}</div>
                          {shippingCharges > 0 && (
                            <div className="text-xs text-gray-600 font-medium">Shipping: Rs. {shippingCharges.toLocaleString()}</div>
                          )}
                          <div className="text-xs text-green-600 font-medium">Received: Rs. {receivedAmount.toLocaleString()}</div>
                          {pendingAmount > 0 && (
                            <div className="text-xs text-orange-600 font-medium">Pending: Rs. {pendingAmount.toLocaleString()}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => navigate(`/business/orders/${order.id}`)}
                            className="text-brand-600 hover:text-brand-900 font-semibold"
                          >
                            View
                          </button>
                          {order.status === 'PENDING' && (
                            <button
                              onClick={() => confirmOrder(order.id)}
                              className="text-green-600 hover:text-green-900 font-semibold"
                            >
                              Confirm
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredOrders.map((order) => {
                  const formData = JSON.parse(order.formData)
                  
                  // Parse products data
                  let selectedProducts = []
                  let productQuantities = {}
                  let productPrices = {}
                  let productsTotal = 0
                  
                  try {
                    if (order.selectedProducts) {
                      const parsed = typeof order.selectedProducts === 'string' 
                        ? JSON.parse(order.selectedProducts) 
                        : order.selectedProducts
                      
                      // Ensure it's an array
                      if (Array.isArray(parsed)) {
                        selectedProducts = parsed
                      } else if (typeof parsed === 'object' && parsed !== null) {
                        // Convert object to array
                        selectedProducts = Object.values(parsed)
                      } else {
                        selectedProducts = []
                      }
                    }
                    if (order.productQuantities) {
                      const parsed = typeof order.productQuantities === 'string'
                        ? JSON.parse(order.productQuantities)
                        : order.productQuantities
                      productQuantities = typeof parsed === 'object' && parsed !== null ? parsed : {}
                    }
                    if (order.productPrices) {
                      const parsed = typeof order.productPrices === 'string'
                        ? JSON.parse(order.productPrices)
                        : order.productPrices
                      productPrices = typeof parsed === 'object' && parsed !== null ? parsed : {}
                    }
                    
                    // Calculate products total
                    if (Array.isArray(selectedProducts)) {
                      selectedProducts.forEach(product => {
                        const quantity = productQuantities[product.id] || product.quantity || 1
                        const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0
                        productsTotal += quantity * price
                      })
                    }
                  } catch (e) {
                    console.error('Error parsing products:', e)
                    selectedProducts = []
                  }
            
            const shippingCharges = parseFloat(order.shippingCharges || 0)
            const paymentAmount = parseFloat(order.paymentAmount || formData['Payment Amount'] || 0)
            const orderTotal = productsTotal + shippingCharges
            const receivedAmount = paymentAmount
            const pendingAmount = Math.max(0, orderTotal - receivedAmount)
            const displayTotal = orderTotal > 0 ? orderTotal : paymentAmount
            
            return (
              <div key={order.id} className="card hover:shadow-lg transition-all duration-200">
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-gray-900 truncate">{order.orderNumber}</h3>
                      <p className="text-sm text-gray-700 flex items-center mt-1 font-medium">
                        <UserIcon className="h-4 w-4 mr-1 flex-shrink-0" />
                        <span className="truncate">{formData['Customer Name'] || 'N/A'}</span>
                      </p>
                    </div>
                    <span className={getStatusBadge(order.status)}>
                      {order.status}
                    </span>
                  </div>

                  {/* Products Section */}
                  {Array.isArray(selectedProducts) && selectedProducts.length > 0 && (
                    <div className="mb-4 pb-4 border-b border-gray-200">
                      <div className="flex items-center mb-2">
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Products ({selectedProducts.length})</span>
                      </div>
                      <div className="space-y-2">
                        {selectedProducts.slice(0, 3).map((product, idx) => (
                          <div key={product.id || idx} className="flex items-center space-x-2 text-sm">
                            <img
                              src={getImageUrl('product', product.id)}
                              alt={product.name}
                              className="w-8 h-8 rounded object-cover border border-gray-300 flex-shrink-0"
                              onError={(e) => {
                                e.target.style.display = 'none'
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 truncate text-xs">{product.name}</p>
                              <p className="text-xs text-gray-600">
                                Qty: {productQuantities[product.id] || 1} × Rs. {parseFloat(productPrices[product.id] || 0).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        ))}
                        {selectedProducts.length > 3 && (
                          <p className="text-xs text-gray-500 font-medium">+{selectedProducts.length - 3} more products</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Payment Information */}
                  <div className="mb-4 space-y-2">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Total Amount</span>
                        <span className="text-base font-bold text-gray-900">
                          Rs. {displayTotal.toLocaleString()}
                        </span>
                      </div>
                      {shippingCharges > 0 && (
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="text-gray-600 font-medium">Shipping:</span>
                          <span className="font-semibold text-gray-700">
                            Rs. {shippingCharges.toLocaleString()}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-600 font-medium">Received:</span>
                        <span className="font-bold text-green-600">
                          Rs. {receivedAmount.toLocaleString()}
                        </span>
                      </div>
                      {pendingAmount > 0 && (
                        <div className="flex justify-between items-center text-xs mt-1">
                          <span className="text-gray-600 font-medium">Pending:</span>
                          <span className="font-bold text-orange-600">
                            Rs. {pendingAmount.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-gray-600">
                      <PhoneIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="truncate">{getPhoneNumber(formData)}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                      <CalendarIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                      {new Date(order.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  {renderDressImages(order)}

                  <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-2">
                    <button
                      onClick={() => navigate(`/business/orders/${order.id}`)}
                      className="btn-secondary text-sm py-1.5 px-4"
                    >
                      View Details
                    </button>
                    {order.status === 'PENDING' && (
                      <button
                        onClick={() => confirmOrder(order.id)}
                        className="btn-primary text-sm py-1.5 px-4"
                      >
                        Confirm
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

    {/* WhatsApp Confirmation Modal */}
    <WhatsAppConfirmationModal
      isOpen={whatsappModal.isOpen}
      onClose={handleWhatsAppCancel}
      onConfirm={handleWhatsAppConfirm}
      customerPhone={whatsappModal.phone}
    />
    </div>
  )
}

export default OrdersScreen
