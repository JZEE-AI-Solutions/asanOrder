import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import OrderDetailsModal from '../components/OrderDetailsModal'
import EnhancedProductsDashboard from './EnhancedProductsDashboard'
import ConfirmationModal from '../components/ConfirmationModal'
import { useOrderStats } from '../hooks/useOrders'
import { 
  DocumentTextIcon, 
  ShoppingBagIcon,
  EyeIcon,
  CheckIcon,
  ShareIcon,
  LinkIcon,
  ArrowRightIcon,
  ChartBarIcon,
  ClockIcon,
  CurrencyDollarIcon,
  UsersIcon,
  UserPlusIcon,
  ArrowTopRightOnSquareIcon,
  CubeIcon,
  ChartBarIcon as ChartBarIconOutline,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EyeSlashIcon,
  CalendarIcon
} from '@heroicons/react/24/outline'

const BusinessDashboard = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [forms, setForms] = useState([])
  const [profitStats, setProfitStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  
  // Use the same hook as OrdersScreen for consistency
  const { stats: orderStats, loading: statsLoading, refreshStats, error: statsError } = useOrderStats()
  
  // Form management state
  const [allForms, setAllForms] = useState([]) // All forms (published and unpublished)
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: null
  })
  
  // Customer management state
  const [customers, setCustomers] = useState([])
  const [customerStats, setCustomerStats] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerPage, setCustomerPage] = useState(1)
  const [customerLoading, setCustomerLoading] = useState(false)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  useEffect(() => {
    // Fetch stats using the hook - call it separately to ensure it runs
    console.log('🔄 Calling refreshStats...')
    refreshStats().then((data) => {
      console.log('✅ Stats fetched successfully:', data)
    }).catch((error) => {
      console.error('❌ Stats fetch failed:', error)
    })
  }, []) // Empty deps - only run once on mount
  
  // Debug: Log stats when they change
  useEffect(() => {
    console.log('📊 Dashboard Stats State:')
    console.log('  - orderStats:', orderStats)
    console.log('  - orderStats?.stats:', orderStats?.stats)
    console.log('  - statsLoading:', statsLoading)
    console.log('  - statsError:', statsError)
    if (orderStats) {
      console.log('  - totalOrders:', orderStats.stats?.totalOrders)
      console.log('  - totalRevenue:', orderStats.stats?.totalRevenue)
    }
    if (statsError) {
      console.error('❌ Stats Error:', statsError)
    }
  }, [orderStats, statsLoading, statsError])

  const fetchDashboardData = async () => {
    try {
      const [tenantRes, recentOrdersRes, formsRes, allFormsRes, profitRes] = await Promise.all([
        api.get('/tenant/owner/me'),
        api.get('/order?limit=5&sort=newest'), // Only fetch recent 5 orders
        api.get('/form'), // Fetch published forms for business owner
        api.get('/form?includeUnpublished=true').catch(() => ({ data: { forms: [] } })), // Fetch all forms including unpublished for management
        api.get('/order/stats/profit').catch((err) => {
          console.error('Profit stats error:', err)
          return { data: { totalRevenue: 0, totalCost: 0, totalProfit: 0, profitMargin: 0, orderCount: 0, orders: [] } }
        }) // Profit stats, don't fail if error
      ])

      setTenant(tenantRes.data.tenant)
      setRecentOrders(recentOrdersRes.data.orders)
      setForms(formsRes.data.forms || []) // Store published forms for display
      setAllForms(allFormsRes.data.forms || []) // Store all forms for management
      setProfitStats(profitRes.data || { totalRevenue: 0, totalCost: 0, totalProfit: 0, profitMargin: 0, orderCount: 0, orders: [] }) // Profit statistics
    } catch (error) {
      console.error('Dashboard fetch error:', error)
      console.error('Error response:', error.response?.data)
      toast.error('Failed to fetch dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const confirmOrder = async (orderId) => {
    try {
      await api.post(`/order/${orderId}/confirm`)
      toast.success('Order confirmed successfully!')
      fetchDashboardData()
    } catch (error) {
      toast.error('Failed to confirm order')
    }
  }

  const shareFormLink = (form) => {
    const url = `${window.location.origin}/form/${form.formLink}`
    const message = `Hi! You can place your order for ${tenant.businessName} using this link: ${url}`
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank')
  }

  // Form management handlers
  const handleCreateForm = () => {
    navigate('/business/forms/new')
  }

  const handleEditForm = (form) => {
    navigate(`/business/forms/${form.id}/edit`)
  }

  const publishForm = async (formId) => {
    try {
      const response = await api.post(`/form/${formId}/publish`)
      toast.success('Form published successfully!')
      toast.success(`Form URL: ${response.data.formUrl}`)
      fetchDashboardData()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to publish form')
    }
  }

  const unpublishForm = async (formId, formName) => {
    try {
      await api.post(`/form/${formId}/unpublish`)
      toast.success(`Form "${formName}" unpublished successfully!`)
      fetchDashboardData()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to unpublish form')
    }
  }

  const deleteForm = async (formId, formName) => {
    if (!window.confirm(`Are you sure you want to delete "${formName}"? This action cannot be undone.`)) {
      return
    }

    try {
      await api.delete(`/form/${formId}`)
      toast.success('Form deleted successfully!')
      fetchDashboardData()
    } catch (error) {
      if (error.response?.data?.ordersCount > 0) {
        toast.error(`Cannot delete form with ${error.response.data.ordersCount} orders. Unpublish it instead.`)
      } else {
        toast.error(error.response?.data?.error || 'Failed to delete form')
      }
    }
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

  // Customer management functions
  const fetchCustomers = async (page = 1, search = '') => {
    try {
      setCustomerLoading(true)
      const response = await api.get(`/customer?page=${page}&limit=20&search=${search}`)
      setCustomers(response.data.customers)
      setCustomerPage(page)
    } catch (error) {
      toast.error('Failed to fetch customers')
    } finally {
      setCustomerLoading(false)
    }
  }

  const fetchCustomerStats = async () => {
    try {
      const response = await api.get('/customer/stats/overview')
      setCustomerStats(response.data.stats)
    } catch (error) {
      console.error('Failed to fetch customer stats:', error)
    }
  }

  const handleCustomerSearch = (searchTerm) => {
    setCustomerSearch(searchTerm)
    fetchCustomers(1, searchTerm)
  }

  const handleCustomerClick = (customer) => {
    navigate(`/business/customers/${customer.id}`)
  }


  // Fetch customers when customers tab is activated
  useEffect(() => {
    if (activeTab === 'customers') {
      fetchCustomers()
      fetchCustomerStats()
    }
  }, [activeTab])

  const copyFormLink = (form) => {
    const url = `${window.location.origin}/form/${form.formLink}`
    navigator.clipboard.writeText(url)
    toast.success('Form link copied to clipboard!')
  }

  const openForm = (form) => {
    const url = `${window.location.origin}/form/${form.formLink}`
    window.open(url, '_blank')
  }

  const manageProducts = (form) => {
    navigate(`/business/forms/${form.id}/products`)
  }

  const handleStatClick = (filter) => {
    navigate('/business/orders', { 
      state: { defaultFilter: filter } 
    })
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

  if (loading) {
    return <LoadingSpinner className="min-h-screen" />
  }

  return (
    <div className="page-container">
      {/* Header */}
      <header className="bg-white shadow-2xl border-b border-gray-200">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4 sm:py-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 truncate text-gradient">
                {tenant?.businessName}
              </h1>
              <p className="text-sm sm:text-base text-gray-600 mt-1">
                <UsersIcon className="h-4 w-4 inline mr-1" />
                Welcome back, {user.name}
              </p>
            </div>
            <button
              onClick={logout}
              className="ml-4 btn-outline-gray"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Navigation Tabs */}
        <div className="mb-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <ChartBarIconOutline className="h-5 w-5 inline mr-2" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('products')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'products'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <CubeIcon className="h-5 w-5 inline mr-2" />
              Products
            </button>
            <button
              onClick={() => setActiveTab('customers')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'customers'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <UsersIcon className="h-5 w-5 inline mr-2" />
              Customers
            </button>
            <button
              onClick={() => setActiveTab('forms')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'forms'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <DocumentTextIcon className="h-5 w-5 inline mr-2" />
              Order Forms
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            {/* Stats Cards - Primary Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
          <div className="card-compact text-center hover:shadow-xl transition-all duration-300">
            <div className="w-12 h-12 mx-auto mb-3 bg-pink-100 rounded-full flex items-center justify-center">
              <DocumentTextIcon className="h-6 w-6 text-pink-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{forms.length}</p>
            <p className="text-sm font-semibold text-gray-600">Active Forms</p>
          </div>

          <button
            onClick={() => handleStatClick('all')}
            className="card-compact text-center hover:shadow-xl hover:border-pink-300 transition-all duration-300 cursor-pointer group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-pink-100 rounded-full flex items-center justify-center group-hover:bg-pink-200 transition-colors">
              <ShoppingBagIcon className="h-6 w-6 text-pink-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 group-hover:text-pink-600 mb-1">
              {statsLoading ? '...' : (orderStats?.stats?.totalOrders ?? 0)}
            </p>
            <p className="text-sm font-semibold text-gray-600 mb-2">Total Orders</p>
            {statsError && (
              <p className="text-xs text-red-500 mt-1">Error: {statsError}</p>
            )}
            <ArrowRightIcon className="h-4 w-4 text-gray-400 mx-auto group-hover:text-pink-500" />
          </button>

          <button
            onClick={() => handleStatClick('all')}
            className="card-compact text-center hover:shadow-xl hover:border-green-300 transition-all duration-300 cursor-pointer group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
              <CurrencyDollarIcon className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 group-hover:text-green-600 mb-1">
              Rs. {(orderStats?.stats?.totalRevenue || 0).toLocaleString()}
            </p>
            <p className="text-sm font-semibold text-gray-600 mb-2">Total Revenue</p>
            <ArrowRightIcon className="h-4 w-4 text-gray-400 mx-auto group-hover:text-green-500" />
          </button>

          <button
            onClick={() => handleStatClick('PENDING')}
            className="card-compact text-center hover:shadow-xl hover:border-yellow-300 transition-all duration-300 cursor-pointer group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-yellow-100 rounded-full flex items-center justify-center group-hover:bg-yellow-200 transition-colors">
              <ClockIcon className="h-6 w-6 text-yellow-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-yellow-600 group-hover:text-yellow-700 mb-1">{orderStats?.stats?.pendingOrders || 0}</p>
            <p className="text-sm font-semibold text-gray-600 mb-2">Pending Orders</p>
            <ArrowRightIcon className="h-4 w-4 text-gray-400 mx-auto group-hover:text-yellow-500" />
          </button>
        </div>

        {/* Stats Cards - Secondary Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
          <button
            onClick={() => handleStatClick('CONFIRMED')}
            className="card-compact text-center hover:shadow-xl hover:border-purple-300 transition-all duration-300 cursor-pointer group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-purple-100 rounded-full flex items-center justify-center group-hover:bg-purple-200 transition-colors">
              <CheckIcon className="h-6 w-6 text-purple-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 group-hover:text-purple-600 mb-1">{orderStats?.stats?.confirmedOrders || 0}</p>
            <p className="text-sm font-semibold text-gray-600 mb-2">Confirmed</p>
            <ArrowRightIcon className="h-4 w-4 text-gray-400 mx-auto group-hover:text-purple-500" />
          </button>

          <button
            onClick={() => handleStatClick('DISPATCHED')}
            className="card-compact text-center hover:shadow-xl hover:border-blue-300 transition-all duration-300 cursor-pointer group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              <ShoppingBagIcon className="h-6 w-6 text-blue-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 group-hover:text-blue-600 mb-1">{orderStats?.stats?.dispatchedOrders || 0}</p>
            <p className="text-sm font-semibold text-gray-600 mb-2">Dispatched</p>
            <ArrowRightIcon className="h-4 w-4 text-gray-400 mx-auto group-hover:text-blue-500" />
          </button>

          <button
            onClick={() => handleStatClick('COMPLETED')}
            className="card-compact text-center hover:shadow-xl hover:border-green-300 transition-all duration-300 cursor-pointer group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
              <CheckIcon className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 group-hover:text-green-600 mb-1">{orderStats?.stats?.completedOrders || 0}</p>
            <p className="text-sm font-semibold text-gray-600 mb-2">Completed</p>
            <ArrowRightIcon className="h-4 w-4 text-gray-400 mx-auto group-hover:text-green-500" />
          </button>

          <div className="card-compact text-center hover:shadow-xl transition-all duration-300">
            <div className="w-12 h-12 mx-auto mb-3 bg-indigo-100 rounded-full flex items-center justify-center">
              <CalendarIcon className="h-6 w-6 text-indigo-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">{orderStats?.stats?.ordersThisMonth || 0}</p>
            <p className="text-sm font-semibold text-gray-600">This Month</p>
          </div>
        </div>

        {/* Profit Statistics Row - Always show */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
          <div className="card-compact text-center hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
            <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center">
              <CurrencyDollarIcon className="h-6 w-6 text-green-600" />
            </div>
            <p className={`text-2xl sm:text-3xl font-bold mb-1 ${(profitStats?.totalProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              Rs. {(profitStats?.totalProfit || 0).toLocaleString()}
            </p>
            <p className="text-sm font-semibold text-gray-600">Net Profit</p>
            <p className="text-xs text-gray-500 mt-1">Margin: {(profitStats?.profitMargin || 0).toFixed(1)}%</p>
          </div>
          <div className="card-compact text-center hover:shadow-xl transition-all duration-300">
            <div className="w-12 h-12 mx-auto mb-3 bg-red-100 rounded-full flex items-center justify-center">
              <CurrencyDollarIcon className="h-6 w-6 text-red-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Rs. {(profitStats?.totalCost || 0).toLocaleString()}</p>
            <p className="text-sm font-semibold text-gray-600">Total Cost</p>
          </div>
          <button
            onClick={() => navigate('/business/reports')}
            className="card-compact text-center hover:shadow-xl hover:border-purple-300 transition-all duration-300 cursor-pointer group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-purple-100 rounded-full flex items-center justify-center group-hover:bg-purple-200 transition-colors">
              <ChartBarIcon className="h-6 w-6 text-purple-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 group-hover:text-purple-600 mb-1">{profitStats?.orderCount || 0}</p>
            <p className="text-sm font-semibold text-gray-600 mb-2">Orders Analyzed</p>
            <p className="text-xs text-purple-600 group-hover:text-purple-700">View Reports →</p>
          </button>
        </div>

        {/* Forms Section */}
        <div className="card mb-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center mb-2 sm:mb-0">
              <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center mr-3">
                <DocumentTextIcon className="h-5 w-5 text-pink-600" />
              </div>
              Your Published Forms
            </h3>
            <div className="flex items-center text-sm text-gray-500">
              <ChartBarIcon className="h-4 w-4 mr-1" />
              {forms.length} form{forms.length !== 1 ? 's' : ''} available
            </div>
          </div>
          
          {forms.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {forms.map((form) => (
                <div key={form.id} className="card-compact hover:shadow-xl hover:border-pink-300 transition-all duration-300 group">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="font-semibold text-gray-900 text-base truncate pr-2 group-hover:text-pink-600 transition-colors">{form.name}</h4>
                    <span className={`badge ${form.isPublished ? 'badge-confirmed' : 'badge-pending'} whitespace-nowrap`}>
                      {form.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  
                  <div className="flex items-center text-sm text-gray-500 mb-4">
                    <CurrencyDollarIcon className="h-4 w-4 mr-1" />
                    <span className="font-semibold">{form._count?.orders || 0}</span>
                    <span className="ml-1">orders received</span>
                  </div>
                  
                  {form.isPublished && (
                    <div className="space-y-2">
                      <button
                        onClick={() => openForm(form)}
                        className="w-full btn-primary text-sm py-2.5 flex items-center justify-center"
                      >
                        <ArrowTopRightOnSquareIcon className="h-4 w-4 mr-2" />
                        Open Form
                      </button>
                      
                      {/* Check if form has Product Selector field */}
                      {form.fields && form.fields.some(field => field.fieldType === 'PRODUCT_SELECTOR') && (
                        <button
                          onClick={() => manageProducts(form)}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm py-2.5 flex items-center justify-center rounded-lg transition-colors duration-200"
                        >
                          <ShoppingBagIcon className="h-4 w-4 mr-2" />
                          Manage Products
                        </button>
                      )}
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => shareFormLink(form)}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs py-2 px-3 rounded-lg flex items-center justify-center transition-colors duration-200"
                        >
                          <ShareIcon className="h-3 w-3 mr-1" />
                          Share
                        </button>
                        <button
                          onClick={() => copyFormLink(form)}
                          className="btn-outline text-xs py-2 px-3 flex items-center justify-center"
                        >
                          <LinkIcon className="h-3 w-3 mr-1" />
                          Copy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DocumentTextIcon className="h-8 w-8 text-gray-400" />
              </div>
              <h4 className="text-xl font-semibold text-gray-900 mb-2">No Published Forms Yet</h4>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                You don't have any published forms yet. Contact your admin to create and publish forms for your business.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-lg mx-auto">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Only published and visible forms are shown here. Hidden or draft forms are not visible to business owners.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Recent Orders Section */}
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center mb-2 sm:mb-0">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                <ShoppingBagIcon className="h-5 w-5 text-purple-600" />
              </div>
              Recent Orders
            </h3>
            <button
              onClick={() => handleStatClick('all')}
              className="w-full sm:w-auto btn-primary text-sm py-2.5 px-6 flex items-center justify-center"
            >
              View All Orders
              <ArrowRightIcon className="h-4 w-4 ml-2" />
            </button>
          </div>

          {recentOrders.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShoppingBagIcon className="h-8 w-8 text-gray-400" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">No Recent Orders</h4>
              <p className="text-gray-500">No recent orders found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentOrders.map((order) => {
                const formData = JSON.parse(order.formData)
                return (
                  <div key={order.id} className="card-compact hover:shadow-xl hover:border-pink-300 transition-all duration-300 group">
                    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start space-y-4 lg:space-y-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center mb-3 flex-wrap">
                          <span className="text-2xl mr-3">{getStatusIcon(order.status)}</span>
                          <h4 className="font-semibold text-gray-900 text-base group-hover:text-pink-600 transition-colors">
                            Order #{order.orderNumber}
                          </h4>
                          <span className={`ml-3 badge ${getStatusBadge(order.status)}`}>
                            {order.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                          <p><span className="font-semibold">Customer:</span> <span className="break-words">{formData['Customer Name'] || 'N/A'}</span></p>
                          <p><span className="font-semibold">Phone:</span> <span className="break-all">{formData['Mobile Number'] || 'N/A'}</span></p>
                          {formData['Payment Amount'] && (
                            <p><span className="font-semibold">Amount:</span> <span className="font-bold text-green-600">Rs. {formData['Payment Amount']}</span></p>
                          )}
                          <p><span className="font-semibold">Date:</span> {new Date(order.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 lg:ml-6">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="w-full sm:w-auto btn-outline text-sm py-2.5 px-4 flex items-center justify-center"
                        >
                          <EyeIcon className="h-4 w-4 mr-2" />
                          View
                        </button>
                        
                        {order.status === 'PENDING' && (
                          <button
                            onClick={() => confirmOrder(order.id)}
                            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center transition-colors duration-200 shadow-lg hover:shadow-xl"
                          >
                            <CheckIcon className="h-4 w-4 mr-2" />
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
        </div>
          </>
        )}

        {activeTab === 'products' && (
          <EnhancedProductsDashboard />
        )}

        {activeTab === 'customers' && (
          <div className="space-y-6">
            {/* Customer Stats */}
            {customerStats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                  <div className="flex items-center">
                    <div className="p-2 bg-pink-100 rounded-lg">
                      <UsersIcon className="h-6 w-6 text-pink-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Total Customers</p>
                      <p className="text-2xl font-bold text-gray-900">{customerStats.totalCustomers}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                  <div className="flex items-center">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <CurrencyDollarIcon className="h-6 w-6 text-green-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                      <p className="text-2xl font-bold text-gray-900">Rs. {customerStats.totalRevenue?.toLocaleString() || 0}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                  <div className="flex items-center">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <ChartBarIcon className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">Avg Order Value</p>
                      <p className="text-2xl font-bold text-gray-900">Rs. {customerStats.averageOrderValue?.toLocaleString() || 0}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                  <div className="flex items-center">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <ClockIcon className="h-6 w-6 text-purple-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">New (30 days)</p>
                      <p className="text-2xl font-bold text-gray-900">{customerStats.newCustomersLast30Days}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Search and Filters */}
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Search customers by name, phone, or email..."
                    value={customerSearch}
                    onChange={(e) => handleCustomerSearch(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => navigate('/business/customers/new')}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center"
                  >
                    <UserPlusIcon className="h-4 w-4 mr-2" />
                    Add Customer
                  </button>
                  <button
                    onClick={() => fetchCustomers()}
                    className="px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Customer List */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Customers</h3>
              </div>
              
              {customerLoading ? (
                <div className="p-8 text-center">
                  <LoadingSpinner />
                  <p className="mt-2 text-gray-600">Loading customers...</p>
                </div>
              ) : customers.length === 0 ? (
                <div className="p-8 text-center">
                  <UsersIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No customers found</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {customers.map((customer) => (
                    <div
                      key={customer.id}
                      onClick={() => handleCustomerClick(customer)}
                      className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0">
                              <div className="h-10 w-10 bg-pink-100 rounded-full flex items-center justify-center">
                                <span className="text-pink-600 font-semibold text-sm">
                                  {customer.name ? customer.name.charAt(0).toUpperCase() : 'C'}
                                </span>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {customer.name || 'Unknown Customer'}
                              </p>
                              <p className="text-sm text-gray-500 truncate">
                                {customer.phoneNumber}
                              </p>
                              {customer.email && (
                                <p className="text-sm text-gray-500 truncate">
                                  {customer.email}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-6">
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">
                              {customer.totalOrders} orders
                            </p>
                            <p className="text-sm text-gray-500">
                              Rs. {customer.totalSpent?.toLocaleString() || 0}
                            </p>
                          </div>
                          
                          <div className="text-right">
                            <p className="text-sm text-gray-500">
                              Last order
                            </p>
                            <p className="text-sm font-medium text-gray-900">
                              {customer.lastOrderDate 
                                ? new Date(customer.lastOrderDate).toLocaleDateString()
                                : 'Never'
                              }
                            </p>
                          </div>
                          
                          <ArrowRightIcon className="h-5 w-5 text-gray-400" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'forms' && (
          <div className="card p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-medium text-gray-900">Order Forms</h3>
              <button
                onClick={handleCreateForm}
                className="btn-primary flex items-center mt-2 sm:mt-0"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Create Form
              </button>
            </div>
            
            {!allForms || allForms.length === 0 ? (
              <div className="text-center py-8">
                <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Forms Created Yet</h3>
                <p className="text-gray-600 mb-4">Create your first form to start accepting orders</p>
                <button
                  onClick={handleCreateForm}
                  className="btn-primary"
                >
                  Create Your First Form
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Form Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Orders
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fields
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {allForms.map((form) => (
                      <tr key={form.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {form.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`badge ${form.isPublished ? 'badge-confirmed' : 'badge-pending'}`}>
                            {form.isPublished ? 'Published' : 'Draft'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {form._count?.orders || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {form.fields?.length || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            {form.isPublished ? (
                              <button
                                onClick={() => unpublishForm(form.id, form.name)}
                                className="text-yellow-600 hover:text-yellow-900 flex items-center"
                              >
                                <EyeSlashIcon className="h-4 w-4 mr-1" />
                                Unpublish
                              </button>
                            ) : (
                              <button
                                onClick={() => publishForm(form.id)}
                                className="text-green-600 hover:text-green-900 flex items-center"
                              >
                                <ShareIcon className="h-4 w-4 mr-1" />
                                Publish
                              </button>
                            )}
                            <button
                              onClick={() => handleEditForm(form)}
                              className="text-primary-600 hover:text-primary-900 flex items-center"
                            >
                              <PencilIcon className="h-4 w-4 mr-1" />
                              Edit
                            </button>
                            <button
                              onClick={() => deleteForm(form.id, form.name)}
                              className="text-red-600 hover:text-red-900 flex items-center"
                            >
                              <TrashIcon className="h-4 w-4 mr-1" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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

      {/* Form Modals */}

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

    </div>
  )
}

export default BusinessDashboard
