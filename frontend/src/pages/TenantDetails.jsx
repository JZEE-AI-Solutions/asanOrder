import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import CreateFormModal from '../components/CreateFormModal'
import EditFormModal from '../components/EditFormModal'
import ConfirmationModal from '../components/ConfirmationModal'
import {
  ArrowLeftIcon,
  PlusIcon,
  EyeIcon,
  LinkIcon,
  DocumentTextIcon,
  PencilIcon,
  TrashIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline'

const TenantDetails = () => {
  const { tenantId } = useParams()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [tenant, setTenant] = useState(null)
  const [forms, setForms] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [selectedForm, setSelectedForm] = useState(null)
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
    fetchTenantData()
  }, [tenantId])

  const fetchTenantData = async () => {
    try {
      const [tenantRes, formsRes, ordersRes] = await Promise.all([
        api.get(`/tenant/${tenantId}`),
        api.get(`/form?tenantId=${tenantId}`),
        api.get(`/order?tenantId=${tenantId}&limit=20`)
      ])

      setTenant(tenantRes.data.tenant)
      setForms(formsRes.data.forms)
      setOrders(ordersRes.data.orders || [])
    } catch (error) {
      toast.error('Failed to fetch tenant data')
      navigate('/admin')
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
    fetchTenantData()
  }

  const handleEditForm = (form) => {
    setSelectedForm(form)
    setShowEditForm(true)
  }

  const handleFormUpdated = () => {
    setShowEditForm(false)
    setSelectedForm(null)
    fetchTenantData()
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
      fetchTenantData()
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
      fetchTenantData()
    } catch (error) {
      toast.error(`Failed to ${action} form`)
    }
  }

  const publishForm = async (formId) => {
    try {
      const response = await api.post(`/form/${formId}/publish`)
      toast.success('Form published successfully!')
      const formUrl = `${window.location.origin}/form/${response.data.form.formLink}`
      toast.success(`Form URL: ${formUrl}`)
      fetchTenantData()
    } catch (error) {
      toast.error('Failed to publish form')
    }
  }

  const copyFormLink = (form) => {
    const url = `${window.location.origin}/form/${form.formLink}`
    navigator.clipboard.writeText(url)
    toast.success('Form link copied to clipboard!')
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

  if (!tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Tenant Not Found</h2>
          <button
            onClick={() => navigate('/admin')}
            className="btn-primary"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      {/* Header */}
      <header className="bg-white shadow-2xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <button
                onClick={() => navigate('/admin')}
                className="mr-4 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 text-gradient">{tenant.businessName}</h1>
                <p className="text-gray-600">{tenant.contactPerson} • {tenant.whatsappNumber}</p>
              </div>
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
        {/* Tenant Info Card */}
        <div className="card mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm font-semibold text-gray-600">Business Type</p>
              <p className="text-lg font-bold text-gray-900">{tenant.businessType.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600">Owner Email</p>
              <p className="text-lg font-bold text-gray-900">{tenant.owner.email}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600">Total Forms</p>
              <p className="text-lg font-bold text-pink-600">{forms.length}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600">Total Orders</p>
              <p className="text-lg font-bold text-green-600">{orders.length}</p>
            </div>
          </div>
        </div>

        {/* Forms Section */}
        <div className="card mb-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center mr-3">
                <DocumentTextIcon className="h-5 w-5 text-pink-600" />
              </div>
              Order Forms
            </h3>
            <button
              onClick={() => setShowCreateForm(true)}
              className="btn-primary flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Form
            </button>
          </div>

          {forms.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DocumentTextIcon className="h-8 w-8 text-gray-400" />
              </div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">No Forms Created Yet</h4>
              <p className="text-gray-500 mb-6">Create your first form to start accepting orders</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="btn-primary"
              >
                Create Your First Form
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {forms.map((form) => (
                <div key={form.id} className="card-compact hover:shadow-xl hover:border-pink-300 transition-all duration-300 group">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-semibold text-gray-900 group-hover:text-pink-600 transition-colors">{form.name}</h4>
                    <span className={`badge ${form.isPublished ? 'badge-confirmed' : 'badge-pending'}`}>
                      {form.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  
                  {form.description && (
                    <p className="text-sm text-gray-600 mb-3">{form.description}</p>
                  )}
                  
                  <p className="text-sm text-gray-500 mb-4">
                    <span className="font-semibold">{form._count?.orders || 0}</span> orders • <span className="font-semibold">{form.fields?.length || 0}</span> fields
                  </p>
                  
                  <div className="flex space-x-2">
                    {!form.isPublished ? (
                      <button
                        onClick={() => publishForm(form.id)}
                        className="flex-1 btn-primary text-xs py-2"
                      >
                        Publish
                      </button>
                    ) : (
                      <button
                        onClick={() => copyFormLink(form)}
                        className="flex-1 btn-outline text-xs py-2 flex items-center justify-center"
                      >
                        <LinkIcon className="h-3 w-3 mr-1" />
                        Copy Link
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleEditForm(form)}
                      className="btn-secondary text-xs py-2 px-3 flex items-center"
                      title="Edit Form"
                    >
                      <PencilIcon className="h-3 w-3" />
                    </button>
                    
                    <button
                      onClick={() => toggleFormVisibility(form.id, form.isHidden, form.name)}
                      className={`text-xs py-2 px-3 flex items-center ${
                        form.isHidden ? 'btn-primary' : 'text-orange-600 hover:text-orange-800 border border-orange-300 hover:bg-orange-50'
                      }`}
                      title={form.isHidden ? 'Show Form' : 'Hide Form'}
                    >
                      {form.isHidden ? <EyeIcon className="h-3 w-3" /> : <EyeSlashIcon className="h-3 w-3" />}
                    </button>
                    
                    <button
                      onClick={() => deleteForm(form.id, form.name)}
                      className="text-red-600 hover:text-red-800 border border-red-300 hover:bg-red-50 text-xs py-2 px-3 flex items-center"
                      title="Delete Form"
                    >
                      <TrashIcon className="h-3 w-3" />
                    </button>
                    
                    {form.isPublished && !form.isHidden && (
                      <button
                        onClick={() => window.open(`/form/${form.formLink}`, '_blank')}
                        className="btn-secondary text-xs py-2 px-3"
                        title="Preview Form"
                      >
                        <EyeIcon className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Orders */}
        {orders.length > 0 && (
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-6">Recent Orders</h3>
            <div className="space-y-3">
              {orders.slice(0, 10).map((order) => {
                const formData = JSON.parse(order.formData)
                return (
                  <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div>
                      <p className="font-medium">Order #{order.orderNumber}</p>
                      <p className="text-sm text-gray-600">
                        {formData['Customer Name'] || 'Unknown'} • {order.form?.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={getStatusBadge(order.status)}>
                      {order.status}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Create Form Modal */}
      {showCreateForm && (
        <CreateFormModal
          tenants={[tenant]}
          defaultTenantId={tenant.id}
          onClose={() => setShowCreateForm(false)}
          onSuccess={handleFormCreated}
        />
      )}


      {/* Edit Form Modal */}
      {showEditForm && selectedForm && (
        <EditFormModal
          form={selectedForm}
          onClose={() => {
            setShowEditForm(false)
            setSelectedForm(null)
          }}
          onSuccess={handleFormUpdated}
        />
      )}

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

export default TenantDetails
