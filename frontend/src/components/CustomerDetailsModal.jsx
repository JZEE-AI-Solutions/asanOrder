import { useState, useEffect } from 'react'
import { XMarkIcon, PhoneIcon, EnvelopeIcon, MapPinIcon, CalendarIcon, CurrencyDollarIcon, ShoppingBagIcon, ClockIcon, PencilIcon, CheckIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import LoadingSpinner from './LoadingSpinner'
import toast from 'react-hot-toast'

const CustomerDetailsModal = ({ customer, isOpen, onClose }) => {
  const [customerDetails, setCustomerDetails] = useState(null)
  const [customerOrders, setCustomerOrders] = useState([])
  const [customerLogs, setCustomerLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen && customer) {
      fetchCustomerDetails()
    }
  }, [isOpen, customer])

  const fetchCustomerDetails = async () => {
    try {
      setLoading(true)
      const [detailsRes, ordersRes, logsRes] = await Promise.all([
        api.get(`/customer/${customer.id}`),
        api.get(`/customer/${customer.id}/orders`),
        api.get(`/customer/${customer.id}/logs`)
      ])

      setCustomerDetails(detailsRes.data.customer)
      setCustomerOrders(ordersRes.data.orders)
      setCustomerLogs(logsRes.data.logs)
    } catch (error) {
      console.error('Failed to fetch customer details:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
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
      await api.put(`/customer/${customer.id}`, editForm)
      toast.success('Customer updated successfully!')
      setIsEditing(false)
      setEditForm({})
      fetchCustomerDetails() // Refresh customer details
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

  if (!isOpen || !customer) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 bg-pink-100 rounded-full flex items-center justify-center">
              <span className="text-pink-600 font-semibold text-lg">
                {customer.name ? customer.name.charAt(0).toUpperCase() : 'C'}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {customer.name || 'Unknown Customer'}
              </h2>
              <p className="text-sm text-gray-500">{customer.phoneNumber}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {!isEditing && (
              <button
                onClick={handleEditClick}
                className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-pink-600 bg-pink-50 rounded-md hover:bg-pink-100 transition-colors"
              >
                <PencilIcon className="h-4 w-4" />
                <span>Edit</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 py-4 border-b border-gray-200">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'orders'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Orders ({customerOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'logs'
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Activity Logs
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && customerDetails && (
                <div className="space-y-6">
                  {/* Customer Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Contact Information</h3>
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
                              className="flex-1 px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
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
                                className="flex-1 px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
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
                                className="flex-1 px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
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
                                className="w-full mt-1 px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
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

                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Order Statistics</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <ShoppingBagIcon className="h-5 w-5 text-pink-600" />
                            <span className="text-sm font-medium text-gray-600">Total Orders</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900 mt-1">{customerDetails.totalOrders}</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
                            <span className="text-sm font-medium text-gray-600">Total Spent</span>
                          </div>
                          <p className="text-2xl font-bold text-gray-900 mt-1">Rs. {customerDetails.totalSpent?.toLocaleString() || 0}</p>
                        </div>
                      </div>
                      {customerDetails.lastOrderDate && (
                        <div className="flex items-center space-x-2">
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
                  <div>
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
                    <div className="text-center py-8">
                      <ShoppingBagIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">No orders found for this customer</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {customerOrders.map((order) => (
                        <div key={order.id} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <h4 className="font-semibold text-gray-900">Order #{order.orderNumber}</h4>
                              <p className="text-sm text-gray-500">
                                {formatDate(order.createdAt)}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                order.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                                order.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {order.status}
                              </span>
                              {order.paymentAmount && (
                                <p className="text-sm font-medium text-gray-900 mt-1">
                                  Rs. {order.paymentAmount.toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                          {order.form && (
                            <p className="text-sm text-gray-600">
                              Form: {order.form.name}
                            </p>
                          )}
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
                    <div className="text-center py-8">
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CustomerDetailsModal
