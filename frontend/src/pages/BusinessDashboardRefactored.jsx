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
import ProductManagementModal from '../components/ProductManagementModal'
import CustomerDetailsModal from '../components/CustomerDetailsModal'
import AddCustomerModal from '../components/AddCustomerModal'

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
  const [showProductManagement, setShowProductManagement] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [showCustomerDetails, setShowCustomerDetails] = useState(false)
  const [showAddCustomer, setShowAddCustomer] = useState(false)

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

  const handleOrderConfirm = async (orderId) => {
    try {
      await api.post(`/order/${orderId}/confirm`)
      refreshOrders()
    } catch (error) {
      console.error('Failed to confirm order:', error)
    }
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
    setSelectedForm(form)
    setShowProductManagement(true)
  }

  const handleCustomerSearch = (searchTerm) => {
    setCustomerSearch(searchTerm)
    refreshCustomers({ search: searchTerm })
  }

  const handleCustomerClick = async (customer) => {
    try {
      const response = await api.get(`/customer/${customer.id}`)
      setSelectedCustomer(response.data.customer)
      setShowCustomerDetails(true)
    } catch (error) {
      console.error('Failed to fetch customer details:', error)
    }
  }

  const handleCustomerCreated = () => {
    refreshCustomers()
    fetchCustomerStats()
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
            onAddCustomer={() => setShowAddCustomer(true)}
            onRefreshCustomers={() => refreshCustomers()}
            onCustomerClick={handleCustomerClick}
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

      {showProductManagement && selectedForm && (
        <ProductManagementModal
          form={selectedForm}
          onClose={() => {
            setShowProductManagement(false)
            setSelectedForm(null)
          }}
          onSuccess={() => {
            setShowProductManagement(false)
            setSelectedForm(null)
            refreshForms()
          }}
        />
      )}

      {showCustomerDetails && selectedCustomer && (
        <CustomerDetailsModal
          customer={selectedCustomer}
          isOpen={showCustomerDetails}
          onClose={() => {
            setShowCustomerDetails(false)
            setSelectedCustomer(null)
          }}
        />
      )}

      <AddCustomerModal
        isOpen={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        onSuccess={handleCustomerCreated}
      />
    </div>
  )
}

export default BusinessDashboardRefactored
