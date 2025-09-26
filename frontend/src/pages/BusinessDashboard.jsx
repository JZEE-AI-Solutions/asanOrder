import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import OrderDetailsModal from '../components/OrderDetailsModal'
import EnhancedProductsDashboard from './EnhancedProductsDashboard'
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
  ArrowTopRightOnSquareIcon,
  CubeIcon,
  ChartBarIcon as ChartBarIconOutline
} from '@heroicons/react/24/outline'

const BusinessDashboard = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [forms, setForms] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const [tenantRes, recentOrdersRes, statsRes, formsRes] = await Promise.all([
        api.get('/tenant/owner/me'),
        api.get('/order?limit=5&sort=newest'), // Only fetch recent 5 orders
        api.get('/order/stats/dashboard'),
        api.get('/form') // Fetch published forms for business owner
      ])

      setTenant(tenantRes.data.tenant)
      setRecentOrders(recentOrdersRes.data.orders)
      setStats(statsRes.data.stats)
      setForms(formsRes.data.forms || []) // Store forms for display
    } catch (error) {
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

  const copyFormLink = (form) => {
    const url = `${window.location.origin}/form/${form.formLink}`
    navigator.clipboard.writeText(url)
    toast.success('Form link copied to clipboard!')
  }

  const openForm = (form) => {
    const url = `${window.location.origin}/form/${form.formLink}`
    window.open(url, '_blank')
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
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <>
            {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
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
            <div className="w-12 h-12 mx-auto mb-3 bg-purple-100 rounded-full flex items-center justify-center group-hover:bg-purple-200 transition-colors">
              <ShoppingBagIcon className="h-6 w-6 text-purple-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 group-hover:text-purple-600 mb-1">{stats?.totalOrders || 0}</p>
            <p className="text-sm font-semibold text-gray-600 mb-2">Total Orders</p>
            <ArrowRightIcon className="h-4 w-4 text-gray-400 mx-auto group-hover:text-purple-500" />
          </button>

          <button
            onClick={() => handleStatClick('PENDING')}
            className="card-compact text-center hover:shadow-xl hover:border-yellow-300 transition-all duration-300 cursor-pointer group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-yellow-100 rounded-full flex items-center justify-center group-hover:bg-yellow-200 transition-colors">
              <ClockIcon className="h-6 w-6 text-yellow-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-yellow-600 group-hover:text-yellow-700 mb-1">{stats?.pendingOrders || 0}</p>
            <p className="text-sm font-semibold text-gray-600 mb-2">Pending</p>
            <ArrowRightIcon className="h-4 w-4 text-gray-400 mx-auto group-hover:text-yellow-500" />
          </button>

          <button
            onClick={() => handleStatClick('CONFIRMED')}
            className="card-compact text-center hover:shadow-xl hover:border-green-300 transition-all duration-300 cursor-pointer group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
              <CheckIcon className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-green-600 group-hover:text-green-700 mb-1">{stats?.confirmedOrders || 0}</p>
            <p className="text-sm font-semibold text-gray-600 mb-2">Confirmed</p>
            <ArrowRightIcon className="h-4 w-4 text-gray-400 mx-auto group-hover:text-green-500" />
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

export default BusinessDashboard
