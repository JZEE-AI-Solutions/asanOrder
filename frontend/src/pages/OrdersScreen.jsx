import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import api, { getImageUrl } from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import WhatsAppConfirmationModal from '../components/WhatsAppConfirmationModal'
import ConfirmationModal from '../components/ConfirmationModal'
import PaymentAccountSelector from '../components/accounting/PaymentAccountSelector'

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
  ChartBarIcon,
  TrashIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  TruckIcon
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
  const [showTrashed, setShowTrashed] = useState(false)
  // Receive Payment Modal State
  const [showReceivePaymentModal, setShowReceivePaymentModal] = useState(false)
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentAccountId, setPaymentAccountId] = useState(null)
  const [processingPayment, setProcessingPayment] = useState(false)
  // Shipping Adjustment Modal State
  const [showShippingAdjustmentModal, setShowShippingAdjustmentModal] = useState(false)
  const [selectedOrderForShippingAdjustment, setSelectedOrderForShippingAdjustment] = useState(null)
  const [adjustmentActualCost, setAdjustmentActualCost] = useState('')
  const [adjustingShipping, setAdjustingShipping] = useState(false)
  // Action Menu State
  const [openActionMenu, setOpenActionMenu] = useState(null)
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: null
  })

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
  }, [statusFilter, sortBy, showTrashed])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        status: statusFilter,
        limit: '100',
        sort: sortBy,
        includeDeleted: showTrashed ? 'true' : 'false'
      })
      const response = await api.get(`/order?${params}`)
      setOrders(response.data.orders)
    } catch (error) {
      toast.error('Failed to fetch orders')
    } finally {
      setLoading(false)
    }
  }

  const [whatsappModal, setWhatsappModal] = useState({ isOpen: false, url: null, phone: null })
  const [showConfirmWithPaymentModal, setShowConfirmWithPaymentModal] = useState(false)
  const [orderToConfirm, setOrderToConfirm] = useState(null)
  const [confirmPaymentAmount, setConfirmPaymentAmount] = useState('')
  const [confirmPaymentAccountId, setConfirmPaymentAccountId] = useState(null)
  const [confirmingOrder, setConfirmingOrder] = useState(false)

  const confirmOrder = async (orderId) => {
    // Find the order to check if it has claimed payment
    const order = orders.find(o => o.id === orderId)
    
    // If order has claimed payment, show payment verification modal first
    if (order && order.paymentAmount && order.paymentAmount > 0) {
      setOrderToConfirm(order)
      setConfirmPaymentAmount(order.paymentAmount.toString())
      setConfirmPaymentAccountId(order.paymentAccountId || null)
      setShowConfirmWithPaymentModal(true)
      return
    }
    
    // Otherwise, confirm order directly
    await doConfirmOrder(orderId)
  }

  const doConfirmOrder = async (orderId, verifiedAmount = null, paymentAccountId = null) => {
    try {
      setConfirmingOrder(true)
      
      const payload = {}
      
      // Include payment verification if provided
      if (verifiedAmount !== null && paymentAccountId) {
        payload.verifiedAmount = parseFloat(verifiedAmount)
        payload.paymentAccountId = paymentAccountId
      }
      
      const response = await api.post(`/order/${orderId}/confirm`, payload)
      
      const message = response.data.payment 
        ? `Order confirmed and payment of Rs. ${response.data.payment.amount.toFixed(2)} verified successfully!`
        : 'Order confirmed successfully!'
      toast.success(message)
      
      // Show WhatsApp confirmation modal if URL is available
      if (response.data.whatsappUrl) {
        setWhatsappModal({
          isOpen: true,
          url: response.data.whatsappUrl,
          phone: response.data.customerPhone || 'customer'
        })
      }
      
      setShowConfirmWithPaymentModal(false)
      setOrderToConfirm(null)
      setConfirmPaymentAmount('')
      setConfirmPaymentAccountId(null)
      
      fetchOrders()
      refreshStats()
    } catch (error) {
      console.error('Failed to confirm order:', error)
      const errorMsg = error.response?.data?.error?.message || 'Failed to confirm order'
      toast.error(errorMsg)
    } finally {
      setConfirmingOrder(false)
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

  const showConfirmation = (title, message, type = 'warning', confirmText = 'Confirm', cancelText = 'Cancel') => {
    return new Promise((resolve) => {
      setConfirmationModal({
        isOpen: true,
        title,
        message,
        type,
        confirmText,
        cancelText,
        onConfirm: () => {
          closeConfirmation()
          resolve(true)
        }
      })
    })
  }

  const closeConfirmation = () => {
    setConfirmationModal({
      isOpen: false,
      title: '',
      message: '',
      type: 'warning',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      onConfirm: null
    })
  }

  const handleDeleteOrder = async (orderId, orderNumber) => {
    const confirmed = await showConfirmation(
      'Delete Order',
      `Are you sure you want to delete order ${orderNumber}? This will move it to trash.`,
      'danger',
      'Delete',
      'Cancel'
    )
    
    if (!confirmed) return

    try {
      await api.delete(`/order/${orderId}`)
      toast.success('Order moved to trash successfully')
      fetchOrders()
      refreshStats()
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to delete order'
      toast.error(errorMsg)
    }
  }

  const handleRestoreOrder = async (orderId, orderNumber) => {
    try {
      await api.post(`/order/${orderId}/restore`)
      toast.success('Order restored successfully')
      fetchOrders()
      refreshStats()
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to restore order'
      toast.error(errorMsg)
    }
  }

  // Calculate order total and pending amount for an order
  const calculateOrderPaymentInfo = (order) => {
    try {
      const formData = JSON.parse(order.formData || '{}')
      let selectedProducts = []
      let productQuantities = {}
      let productPrices = {}

      try {
        selectedProducts = typeof order.selectedProducts === 'string'
          ? JSON.parse(order.selectedProducts)
          : (order.selectedProducts || [])
        productQuantities = typeof order.productQuantities === 'string'
          ? JSON.parse(order.productQuantities)
          : (order.productQuantities || {})
        productPrices = typeof order.productPrices === 'string'
          ? JSON.parse(order.productPrices)
          : (order.productPrices || {})
      } catch (e) {
        console.error('Error parsing products:', e)
      }

      let productsTotal = 0
      if (Array.isArray(selectedProducts)) {
        selectedProducts.forEach(product => {
          const quantity = productQuantities[product.id] || product.quantity || 1
          const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0
          productsTotal += quantity * price
        })
      }

      const shippingCharges = parseFloat(order.shippingCharges || 0)
      const orderTotal = productsTotal + shippingCharges
      
      // Use verified payment amount if verified, otherwise use 0
      const paidAmount = order.paymentVerified && order.verifiedPaymentAmount !== null && order.verifiedPaymentAmount !== undefined
        ? parseFloat(order.verifiedPaymentAmount)
        : 0
      
      const pendingAmount = Math.max(0, orderTotal - paidAmount)
      
      return { orderTotal, paidAmount, pendingAmount }
    } catch (e) {
      return { orderTotal: 0, paidAmount: 0, pendingAmount: 0 }
    }
  }

  const handleReceivePayment = (order) => {
    const paymentInfo = calculateOrderPaymentInfo(order)
    setSelectedOrderForPayment(order)
    setPaymentAmount(paymentInfo.pendingAmount > 0 ? paymentInfo.pendingAmount.toString() : '')
    setPaymentAccountId(null)
    setShowReceivePaymentModal(true)
  }

  const handleAdjustShippingCost = (order) => {
    setSelectedOrderForShippingAdjustment(order)
    setAdjustmentActualCost(order.actualShippingCost !== null && order.actualShippingCost !== undefined ? order.actualShippingCost.toString() : '')
    setShowShippingAdjustmentModal(true)
    setOpenActionMenu(null) // Close action menu
  }

  const handleSubmitShippingAdjustment = async () => {
    if (!selectedOrderForShippingAdjustment) return

    if (adjustmentActualCost === '' || adjustmentActualCost === null) {
      toast.error('Please enter the actual shipping cost')
      return
    }

    const actualCost = parseFloat(adjustmentActualCost)
    if (isNaN(actualCost) || actualCost < 0) {
      toast.error('Please enter a valid shipping cost')
      return
    }

    try {
      setAdjustingShipping(true)
      const response = await api.post(`/order/${selectedOrderForShippingAdjustment.id}/adjust-shipping-cost`, {
        actualShippingCost: actualCost
      })
      
      toast.success(response.data?.message || 'Shipping cost adjusted successfully!')
      setShowShippingAdjustmentModal(false)
      setSelectedOrderForShippingAdjustment(null)
      setAdjustmentActualCost('')
      fetchOrders()
      refreshStats()
    } catch (error) {
      console.error('Adjust shipping cost error:', error)
      const errorMsg = error.response?.data?.error?.message || error.response?.data?.error || 'Failed to adjust shipping cost'
      toast.error(errorMsg)
    } finally {
      setAdjustingShipping(false)
    }
  }

  const handleSubmitPayment = async () => {
    if (!selectedOrderForPayment) return

    const paymentValue = parseFloat(paymentAmount) || 0
    if (paymentValue <= 0) {
      toast.error('Payment amount must be greater than 0')
      return
    }

    if (!paymentAccountId) {
      toast.error('Please select a payment account')
      return
    }

    if (!selectedOrderForPayment.customerId) {
      toast.error('Order customer information is missing')
      return
    }

    setProcessingPayment(true)
    try {
      const response = await api.post('/accounting/payments', {
        date: new Date().toISOString(),
        type: 'CUSTOMER_PAYMENT',
        amount: paymentValue,
        paymentAccountId: paymentAccountId,
        customerId: selectedOrderForPayment.customerId,
        orderId: selectedOrderForPayment.id
      })

      if (response.data?.success) {
        toast.success(`Payment of Rs. ${paymentValue.toFixed(2)} received successfully!`)
        setShowReceivePaymentModal(false)
        setPaymentAmount('')
        setPaymentAccountId(null)
        setSelectedOrderForPayment(null)
        fetchOrders()
        refreshStats()
      }
    } catch (error) {
      console.error('Receive payment error:', error)
      const errorMsg = error.response?.data?.error || 'Failed to record payment'
      toast.error(typeof errorMsg === 'string' ? errorMsg : (errorMsg?.message || 'Failed to record payment'))
    } finally {
      setProcessingPayment(false)
    }
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
              disabled={showTrashed}
            >
              <option value="all">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <button
            onClick={() => {
              setShowTrashed(!showTrashed)
              setStatusFilter('all')
            }}
            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium flex items-center ${
              showTrashed
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <TrashIcon className="h-4 w-4 mr-2" />
            {showTrashed ? 'Show Active' : 'Show Trashed'}
          </button>

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
                  const claimedPaymentAmount = parseFloat(order.paymentAmount || formData['Payment Amount'] || 0)
                  const orderTotal = productsTotal + shippingCharges
                  // Use verified payment amount if payment is verified, otherwise use 0 (unverified payments don't count as received)
                  const receivedAmount = order.paymentVerified && order.verifiedPaymentAmount !== null && order.verifiedPaymentAmount !== undefined
                    ? parseFloat(order.verifiedPaymentAmount)
                    : 0
                  const pendingAmount = Math.max(0, orderTotal - receivedAmount)
                  const displayTotal = orderTotal > 0 ? orderTotal : claimedPaymentAmount
                  
                  return (
                    <tr key={order.id} className={`hover:bg-gray-50 ${showTrashed ? 'opacity-75 bg-red-50' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                        <div className="flex items-center space-x-2">
                          <span>{order.orderNumber}</span>
                          {showTrashed && (
                            <span className="px-2 py-0.5 text-xs font-semibold text-red-600 bg-red-100 rounded">
                              Trashed
                            </span>
                          )}
                        </div>
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
                          {/* Show actual shipping cost and COD fee for dispatched orders */}
                          {(order.status === 'DISPATCHED' || order.status === 'COMPLETED') && (
                            <>
                              {order.actualShippingCost !== null && order.actualShippingCost !== undefined && (
                                <div className="text-xs text-blue-600 font-medium flex items-center">
                                  <TruckIcon className="h-3 w-3 mr-1" />
                                  Actual: Rs. {parseFloat(order.actualShippingCost).toLocaleString()}
                                </div>
                              )}
                              {order.codFee !== null && order.codFee !== undefined && order.codFee > 0 && (
                                <div className="text-xs text-indigo-600 font-medium">
                                  COD Fee: Rs. {parseFloat(order.codFee).toLocaleString()}
                                </div>
                              )}
                            </>
                          )}
                          <div className="text-xs text-green-600 font-medium">
                            Paid: Rs. {receivedAmount.toLocaleString()}
                          </div>
                          {pendingAmount > 0 && (
                            <div className="text-xs text-orange-600 font-medium">Pending: Rs. {pendingAmount.toLocaleString()}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          {!showTrashed && (() => {
                            const paymentInfo = calculateOrderPaymentInfo(order)
                            const canReceivePayment = (order.status === 'CONFIRMED' || order.status === 'DISPATCHED') && 
                                                     paymentInfo.pendingAmount > 0
                            
                            return (
                              <>
                                {canReceivePayment && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleReceivePayment(order)
                                    }}
                                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs font-semibold flex items-center min-h-[32px]"
                                    title="Receive Payment"
                                  >
                                    <CurrencyDollarIcon className="h-3 w-3 mr-1" />
                                    Receive
                                  </button>
                                )}
                                {order.status === 'CONFIRMED' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      navigate(`/business/orders/${order.id}/dispatch`)
                                    }}
                                    className="text-green-600 hover:text-green-900 font-semibold"
                                  >
                                    Dispatch
                                  </button>
                                )}
                                <button
                                  onClick={() => navigate(`/business/orders/${order.id}`)}
                                  className="text-brand-600 hover:text-brand-900 font-semibold"
                                >
                                  View
                                </button>
                                {(order.status === 'DISPATCHED' || order.status === 'COMPLETED') && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleAdjustShippingCost(order)
                                    }}
                                    className="text-orange-600 hover:text-orange-900 font-semibold flex items-center"
                                    title="Adjust Shipping Cost"
                                  >
                                    <PencilIcon className="h-4 w-4 mr-1" />
                                    Adjust
                                  </button>
                                )}
                              </>
                            )
                          })()}
                          {showTrashed ? (
                            <button
                              onClick={() => handleRestoreOrder(order.id, order.orderNumber)}
                              className="text-green-600 hover:text-green-900 font-semibold flex items-center"
                              title="Restore Order"
                            >
                              <ArrowPathIcon className="h-4 w-4 mr-1" />
                              Restore
                            </button>
                          ) : (
                            <>
                              {order.status === 'PENDING' && (
                                <>
                                  <button
                                    onClick={() => confirmOrder(order.id)}
                                    className="text-green-600 hover:text-green-900 font-semibold"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => handleDeleteOrder(order.id, order.orderNumber)}
                                    className="text-red-600 hover:text-red-900 font-semibold flex items-center"
                                    title="Delete Order"
                                  >
                                    <TrashIcon className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                            </>
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
            const claimedPaymentAmount = parseFloat(order.paymentAmount || formData['Payment Amount'] || 0)
            const orderTotal = productsTotal + shippingCharges
            // Use verified payment amount if payment is verified, otherwise use 0 (unverified payments don't count as received)
            const receivedAmount = order.paymentVerified && order.verifiedPaymentAmount !== null && order.verifiedPaymentAmount !== undefined
              ? parseFloat(order.verifiedPaymentAmount)
              : 0
            const pendingAmount = Math.max(0, orderTotal - receivedAmount)
            const displayTotal = orderTotal > 0 ? orderTotal : claimedPaymentAmount
            // Check if there's a claimed but unverified payment
            const hasUnverifiedClaim = claimedPaymentAmount > 0 && !order.paymentVerified
            
            return (
              <div key={order.id} className={`card hover:shadow-lg transition-all duration-200 ${showTrashed ? 'opacity-75 border-2 border-red-200' : ''}`}>
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-gray-900 truncate">{order.orderNumber}</h3>
                      {showTrashed && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-xs font-semibold text-red-600 bg-red-100 rounded">
                          Trashed
                        </span>
                      )}
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
                      {/* Show actual shipping cost and COD fee for dispatched orders */}
                      {(order.status === 'DISPATCHED' || order.status === 'COMPLETED') && (
                        <>
                          {order.actualShippingCost !== null && order.actualShippingCost !== undefined && (
                            <div className="flex justify-between items-center text-xs mb-1">
                              <span className="text-gray-600 font-medium flex items-center">
                                <TruckIcon className="h-3 w-3 mr-1" />
                                Actual Shipping:
                              </span>
                              <span className="font-semibold text-blue-600">
                                Rs. {parseFloat(order.actualShippingCost).toLocaleString()}
                              </span>
                            </div>
                          )}
                          {order.codFee !== null && order.codFee !== undefined && order.codFee > 0 && (
                            <div className="flex justify-between items-center text-xs mb-1">
                              <span className="text-gray-600 font-medium">COD Fee:</span>
                              <span className="font-semibold text-indigo-600">
                                Rs. {parseFloat(order.codFee).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                      {hasUnverifiedClaim && (
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="text-gray-600 font-medium">Claimed:</span>
                          <span className="font-bold text-yellow-600">
                            Rs. {claimedPaymentAmount.toLocaleString()}
                          </span>
                          <span className="text-xs text-yellow-600 ml-1">(Not Verified)</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-600 font-medium">Paid:</span>
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

                  {/* Compact Action Buttons */}
                  <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-between">
                    <button
                      onClick={() => navigate(`/business/orders/${order.id}`)}
                      className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center"
                    >
                      <EyeIcon className="h-4 w-4 mr-1" />
                      View Details
                    </button>
                    
                    {!showTrashed && (
                      <div className="flex items-center gap-1 relative">
                        {(() => {
                          const paymentInfo = calculateOrderPaymentInfo(order)
                          const canReceivePayment = (order.status === 'CONFIRMED' || order.status === 'DISPATCHED') && 
                                                   paymentInfo.pendingAmount > 0
                          
                          return (
                            <>
                              {canReceivePayment && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleReceivePayment(order)
                                  }}
                                  className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                  title="Receive Payment"
                                >
                                  <CurrencyDollarIcon className="h-5 w-5" />
                                </button>
                              )}
                              {order.status === 'CONFIRMED' && (
                                <button
                                  onClick={() => navigate(`/business/orders/${order.id}/dispatch`)}
                                  className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                  title="Dispatch Order"
                                >
                                  <CheckIcon className="h-5 w-5" />
                                </button>
                              )}
                              {order.status === 'PENDING' && (
                                <button
                                  onClick={() => confirmOrder(order.id)}
                                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Confirm Order"
                                >
                                  <CheckIcon className="h-5 w-5" />
                                </button>
                              )}
                              
                              {/* Action Menu Dropdown */}
                              <div className="relative">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenActionMenu(openActionMenu === order.id ? null : order.id)
                                  }}
                                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                  title="More Actions"
                                >
                                  <EllipsisVerticalIcon className="h-5 w-5" />
                                </button>
                                
                                {openActionMenu === order.id && (
                                  <>
                                    <div 
                                      className="fixed inset-0 z-10" 
                                      onClick={() => setOpenActionMenu(null)}
                                    />
                                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                                      {(order.status === 'DISPATCHED' || order.status === 'COMPLETED') && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleAdjustShippingCost(order)
                                          }}
                                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                                        >
                                          <PencilIcon className="h-4 w-4 mr-2" />
                                          Adjust Shipping Cost
                                        </button>
                                      )}
                                      {order.status === 'PENDING' && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleDeleteOrder(order.id, order.orderNumber)
                                            setOpenActionMenu(null)
                                          }}
                                          className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                                        >
                                          <TrashIcon className="h-4 w-4 mr-2" />
                                          Delete Order
                                        </button>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </>
                          )
                        })()}
                      </div>
                    )}
                    
                    {showTrashed && (
                      <button
                        onClick={() => handleRestoreOrder(order.id, order.orderNumber)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Restore Order"
                      >
                        <ArrowPathIcon className="h-5 w-5" />
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

    {/* Confirmation Modal */}
    <ConfirmationModal
      isOpen={confirmationModal.isOpen}
      onClose={closeConfirmation}
      onConfirm={confirmationModal.onConfirm}
      title={confirmationModal.title}
      message={confirmationModal.message}
      type={confirmationModal.type}
      confirmText={confirmationModal.confirmText}
      cancelText={confirmationModal.cancelText}
    />

    {/* Confirm Order with Payment Verification Modal */}
    {showConfirmWithPaymentModal && orderToConfirm && (
      <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Confirm Order & Verify Payment</h3>
            <div className="space-y-4">
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Customer Claimed:</span>
                  <span className="text-lg font-bold text-yellow-700">
                    Rs. {(orderToConfirm.paymentAmount || 0).toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  This is the amount the customer claimed to have paid
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Verified Amount (Rs.) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={confirmPaymentAmount}
                  onChange={(e) => setConfirmPaymentAmount(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 bg-white text-gray-900 text-lg font-semibold"
                  placeholder="0.00"
                  disabled={confirmingOrder}
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the actual amount you received and verified
                </p>
              </div>

              {/* Warning if verified amount differs from claimed */}
              {parseFloat(confirmPaymentAmount) > 0 && parseFloat(confirmPaymentAmount) < (orderToConfirm.paymentAmount || 0) && (
                <div className="p-3 bg-orange-50 border border-orange-300 rounded-lg">
                  <div className="flex items-start">
                    <ExclamationTriangleIcon className="h-5 w-5 text-orange-600 mr-2 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-orange-800">Payment Shortfall Detected</p>
                      <p className="text-xs text-orange-700 mt-1">
                        Customer claimed <strong>Rs. {(orderToConfirm.paymentAmount || 0).toFixed(2)}</strong>, 
                        but you're verifying only <strong>Rs. {parseFloat(confirmPaymentAmount).toFixed(2)}</strong>.
                      </p>
                      <p className="text-xs text-orange-700 mt-1">
                        Shortfall: <strong>Rs. {((orderToConfirm.paymentAmount || 0) - parseFloat(confirmPaymentAmount)).toFixed(2)}</strong>
                      </p>
                      <p className="text-xs text-orange-600 mt-2 font-medium">
                        The customer will still owe the remaining balance after confirmation.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Account <span className="text-red-500">*</span>
                </label>
                <PaymentAccountSelector
                  value={confirmPaymentAccountId}
                  onChange={setConfirmPaymentAccountId}
                  showQuickAdd={true}
                  required={true}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Select the account where payment was received (Cash or Bank)
                </p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  <strong>Note:</strong> This will:
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Confirm the order and update status to CONFIRMED</li>
                    <li>Create accounting entries (Debit Cash/Bank, Credit AR)</li>
                    <li>Record the payment in payment history</li>
                    <li>Update customer balance</li>
                  </ul>
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowConfirmWithPaymentModal(false)
                    setOrderToConfirm(null)
                    setConfirmPaymentAmount('')
                    setConfirmPaymentAccountId(null)
                  }}
                  className="flex-1 btn-secondary px-6 py-3"
                  disabled={confirmingOrder}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const amount = parseFloat(confirmPaymentAmount) || 0
                    if (amount <= 0) {
                      toast.error('Verified amount must be greater than 0')
                      return
                    }
                    if (!confirmPaymentAccountId) {
                      toast.error('Please select a payment account')
                      return
                    }
                    doConfirmOrder(orderToConfirm.id, amount, confirmPaymentAccountId)
                  }}
                  className="flex-1 btn-primary px-6 py-3 bg-yellow-600 hover:bg-yellow-700"
                  disabled={confirmingOrder || !confirmPaymentAmount || parseFloat(confirmPaymentAmount) <= 0 || !confirmPaymentAccountId}
                >
                  {confirmingOrder ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Confirming...
                    </>
                  ) : (
                    <>
                      <CheckIcon className="h-5 w-5 mr-2" />
                      Confirm & Verify Payment
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Receive Payment Modal */}
    {showReceivePaymentModal && selectedOrderForPayment && (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900">
              Receive Payment - {selectedOrderForPayment.orderNumber}
            </h3>
            <button
              onClick={() => {
                setShowReceivePaymentModal(false)
                setPaymentAmount('')
                setPaymentAccountId(null)
                setSelectedOrderForPayment(null)
              }}
              className="text-gray-400 hover:text-gray-600"
              disabled={processingPayment}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Payment Summary */}
            {(() => {
              const paymentInfo = calculateOrderPaymentInfo(selectedOrderForPayment)
              return (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total Order Amount:</span>
                    <span className="font-bold text-gray-900">Rs. {paymentInfo.orderTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Already Paid:</span>
                    <span className="font-bold text-green-600">Rs. {paymentInfo.paidAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-gray-300 pt-2">
                    <span className="text-gray-600 font-semibold">Remaining Balance:</span>
                    <span className="font-bold text-red-600">Rs. {paymentInfo.pendingAmount.toFixed(2)}</span>
                  </div>
                </div>
              )
            })()}

            {/* Payment Input */}
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2">
                Payment Amount (Rs.)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-gray-900 text-lg font-semibold"
                placeholder="0.00"
                disabled={processingPayment}
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the payment amount received
              </p>
            </div>

            {/* Payment Account Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Account <span className="text-red-500">*</span>
              </label>
              <PaymentAccountSelector
                value={paymentAccountId}
                onChange={setPaymentAccountId}
                showQuickAdd={true}
                required={true}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Select the account where payment was received (Cash or Bank)
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-4">
              <button
                onClick={() => {
                  setShowReceivePaymentModal(false)
                  setPaymentAmount('')
                  setPaymentAccountId(null)
                  setSelectedOrderForPayment(null)
                }}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-semibold transition-colors"
                disabled={processingPayment}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitPayment}
                className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={processingPayment || !paymentAmount || parseFloat(paymentAmount) <= 0 || !paymentAccountId}
              >
                {processingPayment ? 'Processing...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Shipping Cost Adjustment Modal */}
    {showShippingAdjustmentModal && selectedOrderForShippingAdjustment && (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900">Adjust Shipping Cost</h3>
            <button
              onClick={() => {
                setShowShippingAdjustmentModal(false)
                setAdjustmentActualCost('')
                setSelectedOrderForShippingAdjustment(null)
              }}
              className="text-gray-400 hover:text-gray-600"
              disabled={adjustingShipping}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Customer Charged:</span>
                <span className="text-lg font-bold text-blue-600">
                  Rs. {(selectedOrderForShippingAdjustment.shippingCharges || 0).toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                This is the amount committed to the customer and will not change
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Actual Shipping Cost <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={adjustmentActualCost}
                onChange={(e) => {
                  const value = e.target.value
                  setAdjustmentActualCost(value === '' ? '' : value)
                }}
                placeholder="Enter actual shipping cost"
                className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                disabled={adjustingShipping}
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the actual amount paid to logistics company
              </p>
            </div>

            {adjustmentActualCost && selectedOrderForShippingAdjustment.shippingCharges > 0 && (() => {
              const actual = parseFloat(adjustmentActualCost) || 0
              const charged = parseFloat(selectedOrderForShippingAdjustment.shippingCharges) || 0
              const variance = actual - charged
              return (
                <div className={`p-3 rounded-lg border ${
                  variance > 0 
                    ? 'bg-red-50 border-red-200' 
                    : variance < 0 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium text-gray-700">Shipping Variance:</span>
                    <span className={`font-bold ${
                      variance > 0 ? 'text-red-600' : variance < 0 ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      {variance > 0 ? '+' : ''}Rs. {variance.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {variance > 0 
                      ? 'You paid more than charged to customer' 
                      : variance < 0 
                      ? 'You paid less than charged to customer' 
                      : 'No variance'}
                  </p>
                </div>
              )
            })()}

            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-800">
                <strong>Note:</strong> This records the actual cost paid. Customer commitment remains unchanged at Rs. {(selectedOrderForShippingAdjustment.shippingCharges || 0).toFixed(2)}.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setShowShippingAdjustmentModal(false)
                  setAdjustmentActualCost('')
                  setSelectedOrderForShippingAdjustment(null)
                }}
                className="flex-1 btn-secondary px-6 py-3"
                disabled={adjustingShipping}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitShippingAdjustment}
                disabled={adjustingShipping || !adjustmentActualCost || parseFloat(adjustmentActualCost) < 0}
                className="flex-1 btn-primary px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {adjustingShipping ? 'Recording...' : 'Record Shipping Cost'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  )
}

export default OrdersScreen
