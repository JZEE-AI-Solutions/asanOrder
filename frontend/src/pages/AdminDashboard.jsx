import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import CreateTenantModal from '../components/CreateTenantModal'
import EditTenantModal from '../components/EditTenantModal'
import ConfirmationModal from '../components/ConfirmationModal'
import {
  UserGroupIcon,
  DocumentTextIcon,
  ShoppingBagIcon,
  PlusIcon,
  EyeIcon,
  ArrowRightIcon,
  PencilIcon,
  TrashIcon,
  EyeSlashIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'

const AdminDashboard = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [tenants, setTenants] = useState([])
  const [forms, setForms] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [showCreateTenant, setShowCreateTenant] = useState(false)
  const [showEditTenant, setShowEditTenant] = useState(false)
  const [selectedTenant, setSelectedTenant] = useState(null)
  const [confirmationModal, setConfirmationModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: null
  })

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const [statsRes, tenantsRes, formsRes, ordersRes] = await Promise.all([
        api.get('/order/stats/dashboard'),
        api.get('/tenant'),
        api.get('/form'),
        api.get('/order?limit=10')
      ])

      setStats(statsRes.data.stats)
      setRecentOrders(statsRes.data.recentOrders || [])
      setTenants(tenantsRes.data.tenants || [])
      setForms(formsRes.data.forms || [])
      setOrders(ordersRes.data.orders || [])
    } catch (error) {
      console.error('Dashboard data fetch error:', error)
      const errorMsg = typeof error.response?.data?.error === 'string'
        ? error.response?.data?.error
        : error.response?.data?.error?.message || 'Failed to fetch dashboard data'
      toast.error(errorMsg)
    } finally {
      setLoading(false)
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
          setConfirmationModal(prev => ({ ...prev, isOpen: false }))
          resolve(true)
        }
      })
    })
  }

  const closeConfirmation = () => {
    setConfirmationModal(prev => ({ ...prev, isOpen: false }))
  }

  const handleFormCreated = () => {
    setShowCreateForm(false)
    fetchDashboardData()
  }

  const handleTenantCreated = () => {
    setShowCreateTenant(false)
    fetchDashboardData()
  }

  const handleEditTenant = (tenant) => {
    setSelectedTenant(tenant)
    setShowEditTenant(true)
  }

  const handleTenantUpdated = () => {
    setShowEditTenant(false)
    setSelectedTenant(null)
    fetchDashboardData()
  }

  const handleClearAllData = async (tenant) => {
    const confirmed = await showConfirmation(
      'Clear All Data',
      `⚠️ WARNING: This will permanently delete ALL data for "${tenant.businessName}" including:\n\n• All Orders\n• All Products\n• All Purchase Invoices\n• All Forms\n• All Customers\n• All Returns\n• All Product Logs\n• All Accounting Transactions (including opening balance transactions)\n• All Expenses, Payments, Suppliers, Investors, etc.\n• All User-Created Cash/Bank Accounts (default system accounts preserved)\n\nSystem accounts will be preserved but reset to balance 0.\n\nThis action CANNOT be undone! Are you absolutely sure?`,
      'danger',
      'Yes, Clear All Data',
      'Cancel'
    )
    
    if (!confirmed) return

    try {
      const response = await api.delete(`/tenant/${tenant.id}/clear-all-data`)
      toast.success(`All data cleared successfully for ${tenant.businessName}!`)
      if (response.data.stats) {
        console.log('Cleared data stats:', response.data.stats)
      }
      fetchDashboardData()
    } catch (error) {
      const errorMsg = typeof error.response?.data?.error === 'string'
        ? error.response?.data?.error
        : error.response?.data?.error?.message || 'Failed to clear tenant data'
      toast.error(errorMsg)
      console.error('Clear data error:', error)
    }
  }

  const handleEditForm = (form) => {
    setSelectedForm(form)
    setShowEditForm(true)
  }

  const handleFormUpdated = () => {
    setShowEditForm(false)
    setSelectedForm(null)
    fetchDashboardData()
  }

  const deleteForm = async (formId, formName) => {
    const confirmed = await showConfirmation(
      'Delete Form',
      `Are you sure you want to delete "${formName}"? This action cannot be undone.`,
      'danger',
      'Delete',
      'Cancel'
    )
    
    if (!confirmed) return

    try {
      await api.delete(`/form/${formId}`)
      toast.success('Form deleted successfully!')
      fetchDashboardData()
    } catch (error) {
      if (error.response?.data?.ordersCount > 0) {
        toast.error(`Cannot delete form with ${error.response.data.ordersCount} orders. Hide it instead.`)
      } else {
        toast.error('Failed to delete form')
      }
    }
  }

  const toggleFormVisibility = async (formId, isCurrentlyHidden, formName) => {
    const action = isCurrentlyHidden ? 'show' : 'hide'
    const actionText = isCurrentlyHidden ? 'show' : 'hide'
    
    const confirmed = await showConfirmation(
      `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} Form`,
      `Are you sure you want to ${actionText} "${formName}"? ${isCurrentlyHidden ? 'It will be visible to business owners.' : 'It will not be visible to business owners.'}`,
      isCurrentlyHidden ? 'info' : 'warning',
      actionText.charAt(0).toUpperCase() + actionText.slice(1),
      'Cancel'
    )
    
    if (!confirmed) return
    
    try {
      await api.patch(`/form/${formId}/visibility`, { 
        isHidden: !isCurrentlyHidden 
      })
      toast.success(`Form "${formName}" ${action === 'hide' ? 'hidden' : 'shown'} successfully!`)
      fetchDashboardData()
    } catch (error) {
      toast.error(`Failed to ${action} form`)
    }
  }

  const publishForm = async (formId) => {
    try {
      const response = await api.post(`/form/${formId}/publish`)
      toast.success('Form published successfully!')
      toast.success(`Form URL: ${response.data.formUrl}`)
      fetchDashboardData()
    } catch (error) {
      toast.error('Failed to publish form')
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

  if (loading) {
    return <LoadingSpinner className="min-h-screen" />
  }

  return (
    <div className="page-container">
      {/* Header */}
      <header className="bg-white shadow-2xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-4 sm:py-6 space-y-3 sm:space-y-0">
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 text-gradient">Admin Dashboard</h1>
              <p className="text-sm sm:text-base text-gray-600">Welcome back, {user.name}</p>
            </div>
            <button
              onClick={logout}
              className="btn-outline-gray text-sm py-2.5 px-4 self-start sm:self-auto"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <div className="card-compact">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center">
                <UserGroupIcon className="h-6 w-6 text-pink-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-600">Total Tenants</p>
                <p className="text-2xl font-bold text-gray-900">{tenants.length}</p>
              </div>
            </div>
          </div>

          <div className="card-compact">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <DocumentTextIcon className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-600">Total Forms</p>
                <p className="text-2xl font-bold text-gray-900">{forms.length}</p>
              </div>
            </div>
          </div>

          <div className="card-compact">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <ShoppingBagIcon className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-600">Total Orders</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.totalOrders || 0}</p>
              </div>
            </div>
          </div>

          <div className="card-compact">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <ShoppingBagIcon className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-600">Pending Orders</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.pendingOrders || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <nav className="flex space-x-2 sm:space-x-8 overflow-x-auto">
            {[
              { id: 'overview', name: 'Overview' },
              { id: 'tenants', name: 'Tenants' },
              { id: 'forms', name: 'Forms' },
              { id: 'orders', name: 'Orders' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 px-4 border-b-2 font-semibold text-sm whitespace-nowrap transition-colors duration-200 ${
                  activeTab === tab.id
                    ? 'border-pink-500 text-pink-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Orders */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                  <ShoppingBagIcon className="h-5 w-5 text-purple-600" />
                </div>
                Recent Orders
              </h3>
              <div className="space-y-3">
                {recentOrders && recentOrders.length > 0 ? (
                  recentOrders.slice(0, 5).map((order) => (
                    <div key={order.id} className="card-compact flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{order.tenant?.businessName || 'N/A'}</p>
                        <p className="text-xs text-gray-600 truncate">{order.form?.name || 'N/A'}</p>
                      </div>
                      <span className={`badge ${getStatusBadge(order.status)} text-xs ml-2`}>
                        {order.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm">No recent orders</p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="card">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center mr-3">
                  <PlusIcon className="h-5 w-5 text-pink-600" />
                </div>
                Quick Actions
              </h3>
              <div className="space-y-4">
                <button
                  onClick={() => setShowCreateTenant(true)}
                  className="w-full btn-primary flex items-center justify-center text-sm py-3"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create New Tenant
                </button>
                <p className="text-sm text-gray-600 text-center">
                  Create forms inside tenant details
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tenants' && (
          <div className="card">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900 flex items-center mb-2 sm:mb-0">
                <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center mr-3">
                  <UserGroupIcon className="h-5 w-5 text-pink-600" />
                </div>
                Tenants
              </h3>
              <button
                onClick={() => setShowCreateTenant(true)}
                className="btn-primary flex items-center justify-center text-sm py-2.5 px-4 self-start sm:self-auto"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Create Tenant
              </button>
            </div>
            
            {/* Mobile Card View */}
            <div className="block sm:hidden space-y-4">
              {tenants && tenants.length > 0 ? (
                tenants.map((tenant) => (
                <div key={tenant.id} className="card-compact">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-semibold text-gray-900 text-sm">{tenant.businessName}</h4>
                    <span className="badge badge-confirmed text-xs">
                      {tenant.businessType.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="space-y-2 text-xs text-gray-600">
                    <p><span className="font-semibold">Contact:</span> {tenant.contactPerson}</p>
                    <p><span className="font-semibold">WhatsApp:</span> {tenant.whatsappNumber}</p>
                    <p><span className="font-semibold">Email:</span> {tenant.owner.email}</p>
                    <div className="flex justify-between">
                      <span><span className="font-semibold">Forms:</span> {tenant._count.forms}</span>
                      <span><span className="font-semibold">Orders:</span> {tenant._count.orders}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => navigate(`/admin/tenant/${tenant.id}`)}
                      className="flex-1 btn-outline text-sm py-2.5 flex items-center justify-center"
                    >
                      View Details
                      <ArrowRightIcon className="h-4 w-4 ml-1" />
                    </button>
                    <button
                      onClick={() => handleClearAllData(tenant)}
                      className="btn-danger text-sm py-2.5 flex items-center justify-center"
                      title="Clear all tenant data"
                    >
                      <ExclamationTriangleIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                ))
              ) : (
                <div className="card-compact text-center py-8">
                  <p className="text-gray-500 text-sm">No tenants found</p>
                </div>
              )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Business
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact Person
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      WhatsApp
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Forms
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Orders
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tenants && tenants.length > 0 ? (
                    tenants.map((tenant) => (
                    <tr key={tenant.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {tenant.businessName}
                          </div>
                          <div className="text-sm text-gray-500">
                            {tenant.owner.email}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {tenant.contactPerson}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {tenant.whatsappNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {tenant.businessType.replace('_', ' ')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {tenant._count.forms}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {tenant._count.orders}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEditTenant(tenant)}
                            className="text-primary-600 hover:text-primary-900 flex items-center"
                          >
                            <PencilIcon className="h-4 w-4 mr-1" />
                            Edit
                          </button>
                          <button
                            onClick={() => navigate(`/admin/tenant/${tenant.id}`)}
                            className="text-primary-600 hover:text-primary-900 flex items-center"
                          >
                            View Details
                            <ArrowRightIcon className="h-4 w-4 ml-1" />
                          </button>
                          <button
                            onClick={() => handleClearAllData(tenant)}
                            className="text-red-600 hover:text-red-900 flex items-center"
                            title="Clear all tenant data"
                          >
                            <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                            Clear Data
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="px-6 py-4 text-center text-sm text-gray-500">
                        No tenants found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'forms' && (
          <div className="card p-4 sm:p-6">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-medium text-gray-900">All Forms</h3>
              <button
                onClick={handleCreateForm}
                className="btn-primary flex items-center"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Create Form
              </button>
            </div>
            
            {!forms || forms.length === 0 ? (
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
                        Tenant
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
                    {forms && forms.length > 0 ? (
                      forms.map((form) => (
                      <tr key={form.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {form.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {form.tenant?.businessName || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={`badge ${form.isPublished ? 'badge-confirmed' : 'badge-pending'}`}>
                            {form.isPublished ? 'Published' : 'Draft'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {form._count?.orders || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {form.fields?.length || form._count?.fields || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleEditForm(form)}
                              className="text-primary-600 hover:text-primary-900 flex items-center"
                            >
                              <PencilIcon className="h-4 w-4 mr-1" />
                              Edit
                            </button>
                            <button
                              onClick={() => toggleFormVisibility(form.id, form.isHidden, form.name)}
                              className={`flex items-center ${
                                form.isHidden 
                                  ? 'text-green-600 hover:text-green-900' 
                                  : 'text-orange-600 hover:text-orange-900'
                              }`}
                            >
                              {form.isHidden ? <EyeIcon className="h-4 w-4 mr-1" /> : <EyeSlashIcon className="h-4 w-4 mr-1" />}
                              {form.isHidden ? 'Show' : 'Hide'}
                            </button>
                            <button
                              onClick={() => deleteForm(form.id, form.name)}
                              className="text-red-600 hover:text-red-900 flex items-center"
                            >
                              <TrashIcon className="h-4 w-4 mr-1" />
                              Delete
                            </button>
                            {form.tenant && (
                              <button
                                onClick={() => navigate(`/admin/tenant/${form.tenant.id}`)}
                                className="text-gray-600 hover:text-gray-900 flex items-center"
                              >
                                <ArrowRightIcon className="h-4 w-4 mr-1" />
                                Tenant
                              </button>
                            )}
                            {form.isPublished && !form.isHidden && (
                              <button
                                onClick={() => window.open(`/form/${form.formLink}`, '_blank')}
                                className="text-blue-600 hover:text-blue-900 flex items-center"
                              >
                                <EyeIcon className="h-4 w-4 mr-1" />
                                View
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="px-6 py-4 text-center text-sm text-gray-500">
                          No forms found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="card p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4 sm:mb-6">Recent Orders</h3>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Business
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Form
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orders && orders.length > 0 ? (
                    orders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                          {order.orderNumber || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {order.tenant?.businessName || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {order.form?.name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={getStatusBadge(order.status)}>
                            {order.status || 'UNKNOWN'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                        No orders found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateTenant && (
        <CreateTenantModal
          onClose={() => setShowCreateTenant(false)}
          onSuccess={handleTenantCreated}
        />
      )}

      {showEditTenant && selectedTenant && (
        <EditTenantModal
          tenant={selectedTenant}
          onClose={() => {
            setShowEditTenant(false)
            setSelectedTenant(null)
          }}
          onSuccess={handleTenantUpdated}
        />
      )}

      {/* Edit Form Modal */}

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

export default AdminDashboard
