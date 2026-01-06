import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ArrowLeftOnRectangleIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  EyeIcon,
  TrashIcon,
  PlusIcon
} from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'
import LoadingSpinner from '../components/LoadingSpinner'
import { Card, CardContent } from '../components/ui/Card'

function SupplierReturnsPage() {
  const navigate = useNavigate()
  const [returns, setReturns] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReturn, setSelectedReturn] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [statusFilter, setStatusFilter] = useState('ALL')

  useEffect(() => {
    fetchReturns()
  }, [statusFilter])

  const fetchReturns = async () => {
    try {
      setLoading(true)
      // Filter for supplier returns only
      const response = await api.get('/return?returnType=SUPPLIER')
      setReturns(response.data || [])
    } catch (error) {
      console.error('Error fetching supplier returns:', error)
      toast.error('Failed to fetch supplier returns')
    } finally {
      setLoading(false)
    }
  }

  const updateReturnStatus = async (returnId, newStatus) => {
    try {
      await api.put(`/return/${returnId}/status`, { status: newStatus })
      toast.success('Return status updated successfully')
      fetchReturns()
    } catch (error) {
      console.error('Error updating return status:', error)
      toast.error('Failed to update return status')
    }
  }

  const deleteReturn = async (returnId) => {
    if (!window.confirm('Are you sure you want to delete this supplier return?')) {
      return
    }

    try {
      await api.delete(`/return/${returnId}`)
      toast.success('Return deleted successfully')
      fetchReturns()
    } catch (error) {
      console.error('Error deleting return:', error)
      toast.error('Failed to delete return')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800'
      case 'APPROVED':
        return 'bg-green-100 text-green-800'
      case 'REJECTED':
        return 'bg-red-100 text-red-800'
      case 'PROCESSED':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'PENDING':
        return <ExclamationTriangleIcon className="h-4 w-4" />
      case 'APPROVED':
        return <CheckCircleIcon className="h-4 w-4" />
      case 'REJECTED':
        return <XCircleIcon className="h-4 w-4" />
      case 'PROCESSED':
        return <ArrowLeftOnRectangleIcon className="h-4 w-4" />
      default:
        return null
    }
  }

  const filteredReturns = returns.filter(returnItem => 
    statusFilter === 'ALL' || returnItem.status === statusFilter
  )

  if (loading && returns.length === 0) {
    return (
      <ModernLayout>
        <LoadingSpinner className="min-h-screen" />
      </ModernLayout>
    )
  }

  return (
    <ModernLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-brand-600">Supplier Returns</h1>
            <p className="text-gray-500 mt-1">Manage product returns to suppliers and refunds.</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/business/returns/standalone/new')}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="h-5 w-5" />
              <span>Create Return</span>
            </button>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white text-gray-900"
            >
              <option value="ALL">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="PROCESSED">Processed</option>
            </select>
          </div>
        </div>

        {/* Returns List */}
        <Card>
          <CardContent>
            {filteredReturns.length === 0 ? (
              <div className="text-center py-12">
                <ArrowLeftOnRectangleIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No supplier returns found</h3>
                <p className="text-gray-600">
                  {statusFilter === 'ALL' 
                    ? 'No supplier returns have been created yet.'
                    : `No ${statusFilter.toLowerCase()} supplier returns found.`
                  }
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Return Details
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Invoice
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Items
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredReturns.map((returnItem) => (
                      <tr key={returnItem.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {returnItem.returnNumber}
                            </div>
                            {returnItem.reason && (
                              <div className="text-sm text-gray-500">
                                {returnItem.reason}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {returnItem.purchaseInvoice ? (
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {returnItem.purchaseInvoice.invoiceNumber}
                              </div>
                              {returnItem.purchaseInvoice.supplierName && (
                                <div className="text-sm text-gray-500">
                                  {returnItem.purchaseInvoice.supplierName}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">N/A</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {returnItem.returnItems?.length || 0} items
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            Rs. {returnItem.totalAmount?.toFixed(2) || '0.00'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(returnItem.status)}`}>
                            {getStatusIcon(returnItem.status)}
                            <span className="ml-1">{returnItem.status}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(returnItem.returnDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => {
                                setSelectedReturn(returnItem)
                                setShowDetails(true)
                              }}
                              className="text-blue-600 hover:text-blue-900"
                              title="View Details"
                            >
                              <EyeIcon className="h-4 w-4" />
                            </button>
                            {returnItem.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => updateReturnStatus(returnItem.id, 'APPROVED')}
                                  className="text-green-600 hover:text-green-900"
                                  title="Approve"
                                >
                                  <CheckCircleIcon className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => updateReturnStatus(returnItem.id, 'REJECTED')}
                                  className="text-red-600 hover:text-red-900"
                                  title="Reject"
                                >
                                  <XCircleIcon className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            {returnItem.status === 'APPROVED' && (
                              <button
                                onClick={() => updateReturnStatus(returnItem.id, 'PROCESSED')}
                                className="text-blue-600 hover:text-blue-900"
                                title="Mark as Processed"
                              >
                                <ArrowLeftOnRectangleIcon className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteReturn(returnItem.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Delete"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Return Details Modal */}
        {showDetails && selectedReturn && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-4 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Supplier Return Details - {selectedReturn.returnNumber}
                </h3>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircleIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Return Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Return Number</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedReturn.returnNumber}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedReturn.status)}`}>
                      {getStatusIcon(selectedReturn.status)}
                      <span className="ml-1">{selectedReturn.status}</span>
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Return Date</label>
                    <p className="mt-1 text-sm text-gray-900">
                      {new Date(selectedReturn.returnDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Total Amount</label>
                    <p className="mt-1 text-sm font-medium text-gray-900">
                      Rs. {selectedReturn.totalAmount?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                  {selectedReturn.purchaseInvoice && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Original Invoice</label>
                        <p className="mt-1 text-sm text-gray-900">
                          {selectedReturn.purchaseInvoice.invoiceNumber}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Invoice Date</label>
                        <p className="mt-1 text-sm text-gray-900">
                          {new Date(selectedReturn.purchaseInvoice.invoiceDate).toLocaleDateString()}
                        </p>
                      </div>
                      {selectedReturn.purchaseInvoice.supplierName && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Supplier</label>
                          <p className="mt-1 text-sm text-gray-900">
                            {selectedReturn.purchaseInvoice.supplierName}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  {selectedReturn.reason && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Reason</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedReturn.reason}</p>
                    </div>
                  )}
                  {selectedReturn.notes && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Notes</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedReturn.notes}</p>
                    </div>
                  )}
                </div>

                {/* Return Items */}
                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Returned Items</h4>
                  <div className="space-y-3">
                    {selectedReturn.returnItems?.map((item, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h5 className="font-medium text-gray-900">{item.productName}</h5>
                            {item.description && (
                              <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                            )}
                            <div className="flex space-x-4 mt-2 text-sm">
                              <span>Price: <strong>Rs. {item.purchasePrice?.toFixed(2) || '0.00'}</strong></span>
                              <span>Quantity: <strong>{item.quantity}</strong></span>
                              {item.sku && (
                                <span>SKU: <strong>{item.sku}</strong></span>
                              )}
                              {item.reason && (
                                <span>Reason: <strong>{item.reason}</strong></span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-gray-900">
                              Rs. {((item.purchasePrice || 0) * (item.quantity || 0)).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowDetails(false)}
                  className="btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModernLayout>
  )
}

export default SupplierReturnsPage

