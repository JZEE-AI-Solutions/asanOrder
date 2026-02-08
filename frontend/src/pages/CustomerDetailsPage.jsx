import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, PhoneIcon, EnvelopeIcon, MapPinIcon, CalendarIcon, CurrencyDollarIcon, ShoppingBagIcon, ClockIcon, PencilIcon, CheckIcon, EyeIcon, XCircleIcon, CheckCircleIcon, TruckIcon, DocumentTextIcon, ArrowPathIcon, PlusIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'
import PaymentAccountSelector from '../components/accounting/PaymentAccountSelector'

const CustomerDetailsPage = () => {
  const { customerId } = useParams()
  const navigate = useNavigate()
  const [customerDetails, setCustomerDetails] = useState(null)
  const [customerOrders, setCustomerOrders] = useState([])
  const [customerLogs, setCustomerLogs] = useState([])
  const [customerBalance, setCustomerBalance] = useState(null)
  const [customerPayments, setCustomerPayments] = useState([])
  const [customerReturns, setCustomerReturns] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  
  // Balance management
  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [balanceAmount, setBalanceAmount] = useState('')
  const [balanceDate, setBalanceDate] = useState('')
  const [updatingBalance, setUpdatingBalance] = useState(false)
  
  // Payment recording
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentAccountId, setPaymentAccountId] = useState(null)
  const [paymentOrderId, setPaymentOrderId] = useState(null)
  const [useAdvanceBalance, setUseAdvanceBalance] = useState(false)
  const [advanceAmountUsed, setAdvanceAmountUsed] = useState('')
  const [recordingPayment, setRecordingPayment] = useState(false)
  
  // Associate direct payment with order (no accounting)
  const [showAssociateModal, setShowAssociateModal] = useState(false)
  const [associatePaymentId, setAssociatePaymentId] = useState(null)
  const [associateOrderId, setAssociateOrderId] = useState(null)
  const [associatingPayment, setAssociatingPayment] = useState(false)
  
  useEffect(() => {
    if (customerId) {
      fetchCustomerDetails()
    }
  }, [customerId])

  const fetchCustomerDetails = async () => {
    try {
      setLoading(true)
      const [detailsRes, ordersRes, logsRes, balanceRes] = await Promise.all([
        api.get(`/customer/${customerId}`),
        api.get(`/customer/${customerId}/orders`),
        api.get(`/customer/${customerId}/logs`),
        api.get(`/accounting/balances/customers/${customerId}`).catch(() => ({ data: null }))
      ])

      setCustomerDetails(detailsRes.data.customer)
      setCustomerOrders(ordersRes.data.orders)
      setCustomerLogs(logsRes.data.logs)
      if (balanceRes.data) {
        setCustomerBalance(balanceRes.data)
      }
      
      // Fetch payments and returns after orders are loaded
      fetchPayments()
      fetchReturns()
    } catch (error) {
      console.error('Failed to fetch customer details:', error)
      toast.error('Failed to fetch customer details')
      navigate('/business/customers')
    } finally {
      setLoading(false)
    }
  }
  
  const fetchPayments = async () => {
    try {
      const response = await api.get('/accounting/payments', {
        params: { customerId, type: 'CUSTOMER_PAYMENT', limit: 100 }
      })
      if (response.data?.success) {
        setCustomerPayments(response.data.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch payments:', error)
    }
  }
  
  const fetchReturns = async () => {
    try {
      const response = await api.get('/accounting/order-returns', {
        params: { 
          returnType: 'CUSTOMER_FULL,CUSTOMER_PARTIAL'
        }
      })
      // Filter returns for this customer's orders
      const orderIds = customerOrders.map(o => o.id)
      const filteredReturns = (response.data.data || []).filter(r => 
        r.orderId && orderIds.includes(r.orderId)
      )
      setCustomerReturns(filteredReturns)
    } catch (error) {
      console.error('Failed to fetch returns:', error)
    }
  }
  
  useEffect(() => {
    if (customerOrders.length > 0) {
      fetchReturns()
    }
  }, [customerOrders.length])

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const parseJSON = (data) => {
    if (!data) return {}
    if (typeof data === 'object') return data
    try {
      return JSON.parse(data)
    } catch (e) {
      console.error('Failed to parse JSON:', e)
      return {}
    }
  }

  const calculateOrderTotal = (order) => {
    let total = 0
    // Prefer normalized orderItems when present (variant orders / new flow)
    if (order.orderItems && order.orderItems.length > 0) {
      total = order.orderItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0), 0)
    } else {
      const selectedProducts = parseJSON(order.selectedProducts) || []
      const productQuantities = parseJSON(order.productQuantities) || {}
      const productPrices = parseJSON(order.productPrices) || {}
      selectedProducts.forEach(product => {
        const quantity = productQuantities[product.id] || product.quantity || 1
        const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0
        total += price * quantity
      })
    }
    const shippingCharges = order.shippingCharges || 0
    total += shippingCharges
    return total
  }

  const getPaymentStatus = (order) => {
    const total = calculateOrderTotal(order)
    const claimed = order.paymentAmount || 0
    const verified = order.paymentVerified ? (order.verifiedPaymentAmount || 0) : 0
    // Paid = sum of Payment records (order.totalPaid from API when available); else fallback to verified only
    const paid = (order.totalPaid != null && order.totalPaid !== undefined)
      ? Number(order.totalPaid)
      : (order.paymentVerified ? verified : 0)
    const remaining = total - paid
    return {
      total,
      paid,
      remaining,
      claimed,
      verified,
      isFullyPaid: paid >= total,
      isPartiallyPaid: paid > 0 && paid < total,
      isUnpaid: paid === 0,
      isVerified: order.paymentVerified || false
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      CONFIRMED: 'bg-green-100 text-green-800',
      DISPATCHED: 'bg-blue-100 text-blue-800',
      COMPLETED: 'bg-purple-100 text-purple-800',
      CANCELLED: 'bg-red-100 text-red-800'
    }
    return `px-3 py-1 inline-flex items-center text-xs font-semibold rounded-full ${styles[status] || 'bg-gray-100 text-gray-800'}`
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'PENDING':
        return <ClockIcon className="h-4 w-4" />
      case 'CONFIRMED':
        return <CheckCircleIcon className="h-4 w-4" />
      case 'DISPATCHED':
        return <TruckIcon className="h-4 w-4" />
      case 'COMPLETED':
        return <CheckCircleIcon className="h-4 w-4" />
      case 'CANCELLED':
        return <XCircleIcon className="h-4 w-4" />
      default:
        return <ClockIcon className="h-4 w-4" />
    }
  }

  const getActionIcon = (action) => {
    switch (action) {
      case 'CREATED':
        return '🆕'
      case 'UPDATED':
        return '✏️'
      case 'ORDER_PLACED':
        return '🛒'
      case 'INFO_CHANGED':
        return '📝'
      default:
        return '📋'
    }
  }

  const handleEditClick = () => {
    setIsEditing(true)
    setEditForm({
      name: customerDetails?.name || '',
      email: customerDetails?.email || '',
      address: customerDetails?.address || '',
      shippingAddress: customerDetails?.shippingAddress || '',
      city: customerDetails?.city || '',
      state: customerDetails?.state || '',
      country: customerDetails?.country || '',
      postalCode: customerDetails?.postalCode || '',
      notes: customerDetails?.notes || ''
    })
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditForm({})
  }

  const handleSaveEdit = async () => {
    try {
      setSaving(true)
      await api.put(`/customer/${customerId}`, editForm)
      toast.success('Customer updated successfully!')
      setIsEditing(false)
      setEditForm({})
      fetchCustomerDetails()
    } catch (error) {
      console.error('Failed to update customer:', error)
      toast.error('Failed to update customer')
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (field, value) => {
    setEditForm(prev => ({
      ...prev,
      [field]: value
    }))
  }

  if (loading) {
    return (
      <ModernLayout>
        <LoadingSpinner className="min-h-screen" />
      </ModernLayout>
    )
  }

  if (!customerDetails) return null

  return (
    <ModernLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/business/customers')}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="h-6 w-6" />
            </button>
            <div className="flex items-center space-x-3">
              <div className="h-12 w-12 bg-pink-100 rounded-full flex items-center justify-center">
                <span className="text-pink-600 font-semibold text-lg">
                  {customerDetails.name ? customerDetails.name.charAt(0).toUpperCase() : 'C'}
                </span>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  {customerDetails.name || 'Unknown Customer'}
                </h1>
                <p className="text-sm text-gray-500 mt-1">{customerDetails.phoneNumber}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {!isEditing && (
              <button
                onClick={handleEditClick}
                className="flex items-center space-x-1 px-4 py-2 text-sm font-medium text-pink-600 bg-pink-50 rounded-lg hover:bg-pink-100 transition-colors"
              >
                <PencilIcon className="h-4 w-4" />
                <span>Edit</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'orders'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Orders ({customerOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('payments')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'payments'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Payments ({customerPayments.length})
            </button>
            <button
              onClick={() => setActiveTab('returns')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'returns'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Returns ({customerReturns.length})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'logs'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Activity Logs
            </button>
            <button
              onClick={() => navigate(`/business/customers/${customerId}/ledger`)}
              className={`py-4 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300`}
            >
              <DocumentTextIcon className="h-4 w-4 inline mr-1" />
              Ledger
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <PhoneIcon className="h-5 w-5 text-gray-400" />
                      <span className="text-gray-900">{customerDetails.phoneNumber}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium text-gray-600 w-16">Name:</span>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                          placeholder="Customer name"
                        />
                      ) : (
                        <span className="text-gray-900">{customerDetails.name || 'Not provided'}</span>
                      )}
                    </div>
                    {customerDetails.email && (
                      <div className="flex items-center space-x-3">
                        <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                        {isEditing ? (
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => handleInputChange('email', e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                            placeholder="Email address"
                          />
                        ) : (
                          <span className="text-gray-900">{customerDetails.email}</span>
                        )}
                      </div>
                    )}
                    {customerDetails.address && (
                      <div className="flex items-start space-x-3">
                        <MapPinIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                        {isEditing ? (
                          <textarea
                            value={editForm.address}
                            onChange={(e) => handleInputChange('address', e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                            placeholder="Address"
                            rows={2}
                          />
                        ) : (
                          <span className="text-gray-900">{customerDetails.address}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-start space-x-3">
                      <MapPinIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-600">Shipping Address:</span>
                        {isEditing ? (
                          <textarea
                            value={editForm.shippingAddress}
                            onChange={(e) => handleInputChange('shippingAddress', e.target.value)}
                            className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                            placeholder="Shipping address (required)"
                            rows={2}
                            required
                          />
                        ) : (
                          <span className="text-gray-900 block mt-1">
                            {customerDetails.shippingAddress || 'Not provided'}
                          </span>
                        )}
                      </div>
                    </div>
                    {customerDetails.city && (
                      <div className="flex items-center space-x-3 ml-8">
                        <span className="text-gray-500">{customerDetails.city}</span>
                        {customerDetails.state && <span className="text-gray-500">, {customerDetails.state}</span>}
                        {customerDetails.country && <span className="text-gray-500">, {customerDetails.country}</span>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Statistics</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <ShoppingBagIcon className="h-5 w-5 text-pink-600" />
                        <span className="text-sm font-medium text-gray-600">Total Orders</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{customerOrders.length}</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
                        <span className="text-sm font-medium text-gray-600">Total Spent</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        Rs. {customerOrders.reduce((sum, order) => sum + calculateOrderTotal(order), 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  {(() => {
                    // Use same source as Orders tab: sum of payments per order (order.totalPaid from API = Payment records)
                    const ordersInScope = customerOrders.filter(o => ['CONFIRMED', 'DISPATCHED', 'COMPLETED'].includes(o.status))
                    const totalPaid = ordersInScope.reduce((sum, order) => sum + getPaymentStatus(order).paid, 0)
                    const totalPending = ordersInScope.reduce((sum, order) => sum + getPaymentStatus(order).remaining, 0)
                    return (
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                          <p className="text-xs font-medium text-green-600 mb-1">Total Paid</p>
                          <p className="text-lg font-bold text-green-900">Rs. {totalPaid.toFixed(2)}</p>
                        </div>
                        <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                          <p className="text-xs font-medium text-red-600 mb-1">Pending Balance</p>
                          <p className="text-lg font-bold text-red-900">Rs. {totalPending.toFixed(2)}</p>
                          <p className="text-xs text-gray-500 mt-1">(Confirmed, dispatched & completed orders)</p>
                        </div>
                      </div>
                    )
                  })()}
                  {customerDetails.lastOrderDate && (
                    <div className="flex items-center space-x-2 mt-4">
                      <ClockIcon className="h-5 w-5 text-gray-400" />
                      <span className="text-sm text-gray-600">Last Order:</span>
                      <span className="text-sm font-medium text-gray-900">
                        {formatDate(customerDetails.lastOrderDate)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Notes</h3>
                {isEditing ? (
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                    placeholder="Customer notes"
                    rows={3}
                  />
                ) : (
                  <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">
                    {customerDetails.notes || 'No notes available'}
                  </p>
                )}
              </div>

              {/* Edit Actions */}
              {isEditing && (
                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-pink-600 border border-transparent rounded-md hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <LoadingSpinner />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              {customerOrders.length === 0 ? (
                <div className="text-center py-12 card">
                  <ShoppingBagIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No orders found for this customer</p>
                </div>
              ) : (
                <>
                  {/* Orders Summary - from orders (uses totalPaid per order so matches ledger) */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    {(() => {
                      const totalOrders = customerOrders.length
                      const totalAmount = customerOrders.reduce((sum, order) => sum + calculateOrderTotal(order), 0)
                      const ordersInScope = customerOrders.filter(o => ['CONFIRMED', 'DISPATCHED', 'COMPLETED'].includes(o.status))
                      const totalPaid = ordersInScope.reduce((sum, order) => sum + getPaymentStatus(order).paid, 0)
                      const totalPending = ordersInScope.reduce((sum, order) => sum + getPaymentStatus(order).remaining, 0)
                      
                      return (
                        <>
                          <div className="card p-4 bg-blue-50 border-2 border-blue-200">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-blue-600">Total Orders</p>
                                <p className="text-2xl font-bold text-blue-900 mt-1">{totalOrders}</p>
                              </div>
                              <ShoppingBagIcon className="h-8 w-8 text-blue-600" />
                            </div>
                          </div>
                          <div className="card p-4 bg-green-50 border-2 border-green-200">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-green-600">Total Amount</p>
                                <p className="text-2xl font-bold text-green-900 mt-1">Rs. {totalAmount.toFixed(2)}</p>
                              </div>
                              <CurrencyDollarIcon className="h-8 w-8 text-green-600" />
                            </div>
                          </div>
                          <div className="card p-4 bg-purple-50 border-2 border-purple-200">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-purple-600">Total Paid</p>
                                <p className="text-2xl font-bold text-purple-900 mt-1">Rs. {totalPaid.toFixed(2)}</p>
                              </div>
                              <CheckCircleIcon className="h-8 w-8 text-purple-600" />
                            </div>
                          </div>
                          <div className="card p-4 bg-red-50 border-2 border-red-200">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-red-600">Pending Balance</p>
                                <p className="text-2xl font-bold text-red-900 mt-1">Rs. {totalPending.toFixed(2)}</p>
                              </div>
                              <ClockIcon className="h-8 w-8 text-red-600" />
                            </div>
                          </div>
                        </>
                      )
                    })()}
                  </div>

                  {/* Orders List */}
                  <div className="space-y-4">
                    {customerOrders.map((order) => {
                      const paymentStatus = getPaymentStatus(order)
                      const selectedProducts = parseJSON(order.selectedProducts) || []
                      
                      return (
                        <div 
                          key={order.id} 
                          className="card p-6 hover:shadow-lg transition-shadow border-2 border-gray-200"
                        >
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                            {/* Order Info */}
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-3">
                                <h4 className="text-lg font-bold text-gray-900">Order #{order.orderNumber}</h4>
                                <span className={getStatusBadge(order.status)}>
                                  <span className="mr-1">{getStatusIcon(order.status)}</span>
                                  {order.status}
                                </span>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Order Date</p>
                                  <p className="text-sm font-medium text-gray-900">{formatDate(order.createdAt)}</p>
                                </div>
                                {order.form && (
                                  <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Form</p>
                                    <p className="text-sm font-medium text-gray-900">{order.form.name}</p>
                                  </div>
                                )}
                              </div>

                              {/* Products Summary: orderItems (variant flow) or legacy selectedProducts */}
                              {((order.orderItems && order.orderItems.length > 0) || selectedProducts.length > 0) && (
                                <div className="mb-4">
                                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                                    Products ({order.orderItems?.length || selectedProducts.length})
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {order.orderItems && order.orderItems.length > 0
                                      ? order.orderItems.slice(0, 5).map((item, idx) => (
                                          <span
                                            key={idx}
                                            className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700 text-xs font-medium"
                                          >
                                            {item.productName || 'Item'} (Qty: {item.quantity})
                                          </span>
                                        ))
                                      : selectedProducts.slice(0, 5).map((product, idx) => {
                                          const quantity = parseJSON(order.productQuantities)?.[product.id] || product.quantity || 1
                                          return (
                                            <span
                                              key={idx}
                                              className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700 text-xs font-medium"
                                            >
                                              {product.name || 'Unknown'} (Qty: {quantity})
                                            </span>
                                          )
                                        })}
                                    {(order.orderItems?.length > 5 || selectedProducts.length > 5) && (
                                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700 text-xs font-medium">
                                        +{(order.orderItems?.length || selectedProducts.length) - 5} more
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Payment Information */}
                              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Payment Information</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div>
                                    <p className="text-xs text-gray-600 mb-1">Total Amount</p>
                                    <p className="text-sm font-bold text-gray-900">Rs. {paymentStatus.total.toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600 mb-1">Paid Amount</p>
                                    <p className="text-sm font-bold text-green-600">Rs. {paymentStatus.paid.toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600 mb-1">Pending Balance</p>
                                    <p className={`text-sm font-bold ${paymentStatus.remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                      Rs. {paymentStatus.remaining.toFixed(2)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600 mb-1">Payment Status</p>
                                    {paymentStatus.isFullyPaid ? (
                                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                                        <CheckCircleIcon className="h-3 w-3 mr-1" />
                                        Fully Paid
                                      </span>
                                    ) : paymentStatus.isPartiallyPaid ? (
                                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                                        <ClockIcon className="h-3 w-3 mr-1" />
                                        Partially Paid
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                                        <XCircleIcon className="h-3 w-3 mr-1" />
                                        Unpaid
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col gap-2 md:min-w-[120px]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/business/orders/${order.id}`)
                                }}
                                className="flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                              >
                                <EyeIcon className="h-4 w-4 mr-2" />
                                View Details
                              </button>
                              {order.status === 'DISPATCHED' && paymentStatus.remaining > 0 && (
                                <div className="text-center">
                                  <p className="text-xs text-red-600 font-semibold mb-1">Payment Pending</p>
                                  <p className="text-xs text-gray-500">Rs. {paymentStatus.remaining.toFixed(2)}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Payments Tab */}
          {activeTab === 'payments' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Payment History</h2>
                <button
                  onClick={() => {
                    setPaymentAmount('')
                    setPaymentAccountId(null)
                    setPaymentOrderId(null)
                    setUseAdvanceBalance(false)
                    setShowPaymentModal(true)
                  }}
                  className="btn-primary flex items-center px-4 py-2"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Record Payment
                </button>
              </div>
              
              {customerPayments.length === 0 ? (
                <div className="text-center py-12 card">
                  <CurrencyDollarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No payments found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {customerPayments.map((payment) => (
                    <div key={payment.id} className="card p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-900">{payment.paymentNumber}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            Amount: <span className="font-semibold">Rs. {payment.amount.toFixed(2)}</span>
                            {payment.account && (
                              <span className="ml-2">• {payment.account.name}</span>
                            )}
                            {payment.orderId && (
                              <span className="ml-2">• Order: {payment.order?.orderNumber || payment.orderId}</span>
                            )}
                            {!payment.orderId && (
                              <span className="ml-2 text-blue-600">• Direct Payment</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDate(payment.date)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {payment.orderId ? (
                            <button
                              onClick={() => navigate(`/business/orders/${payment.orderId}`)}
                              className="btn-secondary text-sm px-3 py-1.5"
                            >
                              View Order
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setAssociatePaymentId(payment.id)
                                setAssociateOrderId(null)
                                setShowAssociateModal(true)
                              }}
                              className="btn-primary text-sm px-3 py-1.5"
                            >
                              Associate with Order
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Returns Tab */}
          {activeTab === 'returns' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Return Orders</h2>
                <button
                  onClick={() => navigate(`/business/returns/new?customerId=${customerId}`)}
                  className="btn-primary flex items-center px-4 py-2"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create Return
                </button>
              </div>
              
              {customerReturns.length === 0 ? (
                <div className="text-center py-12 card">
                  <ArrowPathIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No returns found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {customerReturns.map((returnRecord) => (
                    <div key={returnRecord.id} className="card p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-900">{returnRecord.returnNumber}</span>
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              returnRecord.status === 'REFUNDED' ? 'bg-green-100 text-green-800' :
                              returnRecord.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                              returnRecord.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {returnRecord.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            Amount: <span className="font-semibold">Rs. {returnRecord.totalAmount.toFixed(2)}</span>
                            {returnRecord.orderId && (
                              <span className="ml-2">• Order: {returnRecord.order?.orderNumber || returnRecord.orderId}</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDate(returnRecord.returnDate)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate(`/business/returns/${returnRecord.id}`)}
                            className="btn-secondary text-sm px-3 py-1.5"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              {customerLogs.length === 0 ? (
                <div className="text-center py-12 card">
                  <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No activity logs found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {customerLogs.map((log) => (
                    <div key={log.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <span className="text-2xl">{getActionIcon(log.action)}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-gray-900">{log.description || log.action}</p>
                          <p className="text-sm text-gray-500">{formatDate(log.createdAt)}</p>
                        </div>
                        {log.fieldName && (
                          <p className="text-sm text-gray-600 mt-1">
                            Field: {log.fieldName}
                            {log.oldValue && log.newValue && (
                              <span className="ml-2">
                                "{log.oldValue}" → "{log.newValue}"
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Balance Update Modal */}
        {showBalanceModal && (
          <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Update Customer Balance</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Balance Amount (Rs.) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={balanceAmount}
                      onChange={(e) => setBalanceAmount(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                      placeholder="0.00"
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Positive = Customer owes us (AR), Negative = Customer advance (they paid us)
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Balance Date
                    </label>
                    <input
                      type="date"
                      value={balanceDate}
                      onChange={(e) => setBalanceDate(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => {
                        setShowBalanceModal(false)
                        setBalanceAmount('')
                        setBalanceDate('')
                      }}
                      className="flex-1 btn-secondary px-6 py-3"
                      disabled={updatingBalance}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!balanceAmount) {
                          toast.error('Please enter balance amount')
                          return
                        }
                        setUpdatingBalance(true)
                        try {
                          await api.put(`/customer/${customerId}/balance`, {
                            balance: parseFloat(balanceAmount),
                            openingBalanceDate: balanceDate || undefined
                          })
                          toast.success('Customer balance updated successfully!')
                          setShowBalanceModal(false)
                          setBalanceAmount('')
                          setBalanceDate('')
                          fetchCustomerDetails()
                        } catch (error) {
                          console.error('Failed to update balance:', error)
                          toast.error(error.response?.data?.error || 'Failed to update balance')
                        } finally {
                          setUpdatingBalance(false)
                        }
                      }}
                      className="flex-1 btn-primary px-6 py-3"
                      disabled={updatingBalance || !balanceAmount}
                    >
                      {updatingBalance ? 'Updating...' : 'Update Balance'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Payment Recording Modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Record Payment</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount (Rs.) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Order (Optional)
                    </label>
                    <select
                      value={paymentOrderId || ''}
                      onChange={(e) => setPaymentOrderId(e.target.value || null)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    >
                      <option value="">Direct Payment (No Order)</option>
                      {customerOrders.map(order => (
                        <option key={order.id} value={order.id}>
                          {order.orderNumber} - Rs. {calculateOrderTotal(order).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {customerBalance && customerBalance.availableAdvance > 0 && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useAdvanceBalance}
                          onChange={(e) => setUseAdvanceBalance(e.target.checked)}
                          className="mr-2 h-4 w-4 text-blue-600"
                        />
                        <span className="text-sm font-medium text-gray-900">
                          Use Advance Balance (Available: Rs. {customerBalance.availableAdvance.toFixed(2)})
                        </span>
                      </label>
                      {useAdvanceBalance && (
                        <div className="mt-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={Math.min(customerBalance.availableAdvance, parseFloat(paymentAmount) || 0)}
                            value={advanceAmountUsed}
                            onChange={(e) => setAdvanceAmountUsed(e.target.value)}
                            className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm"
                            placeholder={`Max: Rs. ${Math.min(customerBalance.availableAdvance, parseFloat(paymentAmount) || 0).toFixed(2)}`}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  
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
                  </div>
                  
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => {
                        setShowPaymentModal(false)
                        setPaymentAmount('')
                        setPaymentAccountId(null)
                        setPaymentOrderId(null)
                        setUseAdvanceBalance(false)
                        setAdvanceAmountUsed('')
                      }}
                      className="flex-1 btn-secondary px-6 py-3"
                      disabled={recordingPayment}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
                          toast.error('Please enter a valid payment amount')
                          return
                        }
                        if (!paymentAccountId) {
                          toast.error('Please select a payment account')
                          return
                        }
                        setRecordingPayment(true)
                        try {
                          const response = await api.post('/accounting/payments', {
                            date: new Date().toISOString(),
                            type: 'CUSTOMER_PAYMENT',
                            amount: parseFloat(paymentAmount),
                            paymentAccountId: paymentAccountId || null,
                            customerId,
                            orderId: paymentOrderId || null,
                            isVerified: true,
                            useAdvanceBalance,
                            advanceAmountUsed: useAdvanceBalance ? parseFloat(advanceAmountUsed) : undefined
                          })
                          if (response.data?.success) {
                            toast.success('Payment recorded successfully!')
                            setShowPaymentModal(false)
                            setPaymentAmount('')
                            setPaymentAccountId(null)
                            setPaymentOrderId(null)
                            setUseAdvanceBalance(false)
                            setAdvanceAmountUsed('')
                            fetchCustomerDetails()
                            fetchPayments()
                          }
                        } catch (error) {
                          console.error('Failed to record payment:', error)
                          const errMsg = error.response?.data?.error
                          const msg = typeof errMsg === 'string' ? errMsg : (errMsg?.message || 'Failed to record payment')
                          toast.error(msg)
                        } finally {
                          setRecordingPayment(false)
                        }
                      }}
                      className="flex-1 btn-primary px-6 py-3"
                      disabled={recordingPayment || !paymentAmount || parseFloat(paymentAmount) <= 0}
                    >
                      {recordingPayment ? 'Recording...' : 'Record Payment'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Associate Direct Payment with Order Modal */}
        {showAssociateModal && associatePaymentId && (
          <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Associate Payment with Order</h3>
                <p className="text-sm text-gray-600 mb-4">
                  This payment has already been posted. Linking it to an order will update the record only—no new accounting entry will be created.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Order <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={associateOrderId || ''}
                    onChange={(e) => setAssociateOrderId(e.target.value || null)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  >
                    <option value="">Choose an order...</option>
                    {customerOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.orderNumber} - Rs. {calculateOrderTotal(order).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowAssociateModal(false)
                      setAssociatePaymentId(null)
                      setAssociateOrderId(null)
                    }}
                    className="flex-1 btn-secondary px-6 py-3"
                    disabled={associatingPayment}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!associateOrderId) {
                        toast.error('Please select an order')
                        return
                      }
                      setAssociatingPayment(true)
                      try {
                        const response = await api.patch(
                          `/accounting/payments/${associatePaymentId}/associate-order`,
                          { orderId: associateOrderId }
                        )
                        if (response.data?.success) {
                          toast.success('Payment associated with order successfully')
                          setShowAssociateModal(false)
                          setAssociatePaymentId(null)
                          setAssociateOrderId(null)
                          fetchCustomerDetails()
                          fetchPayments()
                        }
                      } catch (error) {
                        console.error('Failed to associate payment:', error)
                        const errMsg = error.response?.data?.error
                        const msg = typeof errMsg === 'string' ? errMsg : (errMsg?.message || 'Failed to associate payment')
                        toast.error(msg)
                      } finally {
                        setAssociatingPayment(false)
                      }
                    }}
                    className="flex-1 btn-primary px-6 py-3"
                    disabled={associatingPayment || !associateOrderId}
                  >
                    {associatingPayment ? 'Associating...' : 'Associate'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
      </div>
    </ModernLayout>
  )
}

export default CustomerDetailsPage

