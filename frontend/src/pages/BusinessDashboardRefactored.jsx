import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTenant, useOrders, useForms, useCustomers } from '../hooks'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import OrderDetailsModal from '../components/OrderDetailsModal'
import EnhancedOrderDetailsModal from '../components/EnhancedOrderDetailsModal'
import EnhancedProductsDashboard from './EnhancedProductsDashboard'
import WhatsAppConfirmationModal from '../components/WhatsAppConfirmationModal'
import PaymentAccountSelector from '../components/accounting/PaymentAccountSelector'
import { CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

// Dashboard Components
import DashboardHeader from '../components/dashboard/DashboardHeader'
import DashboardTabs from '../components/dashboard/DashboardTabs'
import StatsOverview from '../components/dashboard/StatsOverview'
import FormsSection from '../components/dashboard/FormsSection'
import RecentOrdersSection from '../components/dashboard/RecentOrdersSection'
import CustomersSection from '../components/dashboard/CustomersSection'

const BusinessDashboardRefactored = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  
  // State
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [selectedForm, setSelectedForm] = useState(null)

  // Hooks
  const { tenant, loading: tenantLoading } = useTenant()
  const { orders: recentOrders, loading: ordersLoading, refreshOrders } = useOrders({ limit: 5, sort: 'newest' })
  const { forms, loading: formsLoading, refreshForms } = useForms()
  const { customers, loading: customersLoading, refreshCustomers } = useCustomers()
  const { stats: orderStats, loading: statsLoading } = useOrders()

  // Customer management state
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerStats, setCustomerStats] = useState(null)

  // Define fetchCustomerStats before using it
  const fetchCustomerStats = useCallback(async () => {
    try {
      const response = await api.get('/customer/stats/overview')
      setCustomerStats(response.data.stats)
    } catch (error) {
      console.error('Failed to fetch customer stats:', error)
    }
  }, [])

  // Load initial data
  useEffect(() => {
    if (tenant) {
      refreshOrders()
      refreshForms()
    }
  }, [tenant]) // Remove refreshOrders and refreshForms from dependencies

  // Load customers when customers tab is activated
  useEffect(() => {
    if (activeTab === 'customers') {
      refreshCustomers()
      fetchCustomerStats()
    }
  }, [activeTab, refreshCustomers, fetchCustomerStats])

  // Event handlers
  const handleStatClick = (filter) => {
    navigate('/business/orders', { 
      state: { defaultFilter: filter } 
    })
  }

  const [whatsappModal, setWhatsappModal] = useState({ isOpen: false, url: null, phone: null })
  const [showConfirmWithPaymentModal, setShowConfirmWithPaymentModal] = useState(false)
  const [orderToConfirm, setOrderToConfirm] = useState(null)
  const [confirmPaymentAmount, setConfirmPaymentAmount] = useState('')
  const [confirmPaymentAccountId, setConfirmPaymentAccountId] = useState(null)
  const [confirmingOrder, setConfirmingOrder] = useState(false)

  const handleOrderConfirm = async (orderId) => {
    // Find the order to check if it has claimed payment
    const order = recentOrders.find(o => o.id === orderId)
    
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
      
      refreshOrders()
    } catch (error) {
      console.error('Failed to confirm order:', error)
      const errorMsg = error.response?.data?.error?.message || 'Failed to confirm order'
      toast.error(errorMsg)
    } finally {
      setConfirmingOrder(false)
    }
  }

  const handleOrderDelete = async (orderId, orderNumber) => {
    // Use a simple confirmation approach similar to FormsPage
    const confirmed = window.confirm(`Are you sure you want to delete order ${orderNumber}? This will move it to trash.`)
    if (!confirmed) return

    try {
      await api.delete(`/order/${orderId}`)
      toast.success('Order moved to trash successfully')
      refreshOrders()
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to delete order'
      toast.error(errorMsg)
    }
  }

  const handleWhatsAppConfirm = () => {
    if (whatsappModal.url) {
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

  const handleFormOpen = (form) => {
    const url = `${window.location.origin}/form/${form.formLink}`
    window.open(url, '_blank')
  }

  const handleFormShare = (form) => {
    const url = `${window.location.origin}/form/${form.formLink}`
    const message = `Hi! You can place your order for ${tenant.businessName} using this link: ${url}`
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank')
  }

  const handleFormCopyLink = (form) => {
    const url = `${window.location.origin}/form/${form.formLink}`
    navigator.clipboard.writeText(url)
    toast.success('Form link copied to clipboard!')
  }

  const handleManageProducts = (form) => {
    navigate(`/business/forms/${form.id}/products`)
  }

  const handleCustomerSearch = (searchTerm) => {
    setCustomerSearch(searchTerm)
    refreshCustomers({ search: searchTerm })
  }

  const handleCustomerClick = (customer) => {
    navigate(`/business/customers/${customer.id}`)
  }

  const handleCustomerReceivePayment = (customer) => {
    navigate(`/business/customers/${customer.id}?tab=payments&receivePayment=true`)
  }

  const handleOrderUpdate = () => {
    // Refresh orders data after update
    refreshOrders()
    toast.success('Order updated successfully!')
  }

  // Utility functions
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
      case 'PENDING': return '⏳'
      case 'CONFIRMED': return '✅'
      case 'DISPATCHED': return '🚚'
      case 'COMPLETED': return '🎉'
      case 'CANCELLED': return '❌'
      default: return '📋'
    }
  }

  if (tenantLoading) {
    return <LoadingSpinner className="min-h-screen" />
  }

  return (
    <div className="page-container">
      <DashboardHeader 
        tenant={tenant}
        user={user}
        onLogout={logout}
      />

      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <DashboardTabs 
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            <StatsOverview 
              stats={orderStats}
              forms={forms}
              onStatClick={handleStatClick}
            />
            
            <FormsSection
              forms={forms}
              tenant={tenant}
              onOpenForm={handleFormOpen}
              onShareForm={handleFormShare}
              onCopyFormLink={handleFormCopyLink}
              onManageProducts={handleManageProducts}
            />
            
            <RecentOrdersSection
              recentOrders={recentOrders}
              onViewOrder={setSelectedOrder}
              onConfirmOrder={handleOrderConfirm}
              onDeleteOrder={handleOrderDelete}
              onViewAllOrders={() => handleStatClick('all')}
              getStatusBadge={getStatusBadge}
              getStatusIcon={getStatusIcon}
            />
          </>
        )}

        {activeTab === 'products' && (
          <EnhancedProductsDashboard />
        )}

        {activeTab === 'customers' && (
          <CustomersSection
            customers={customers}
            customerStats={customerStats}
            customerLoading={customersLoading}
            customerSearch={customerSearch}
            onSearchChange={handleCustomerSearch}
            onAddCustomer={() => navigate('/business/customers/new')}
            onRefreshCustomers={() => refreshCustomers()}
            onCustomerClick={handleCustomerClick}
            onReceivePayment={handleCustomerReceivePayment}
          />
        )}
      </div>

      {/* Modals */}
        {selectedOrder && (
          <EnhancedOrderDetailsModal
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onConfirm={handleOrderConfirm}
            onUpdate={handleOrderUpdate}
          />
        )}

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

export default BusinessDashboardRefactored
