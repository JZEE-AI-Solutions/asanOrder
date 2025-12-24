import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useTenant } from '../../hooks/useTenant'
import { toast } from 'react-hot-toast'
import ModernLayout from '../../components/ModernLayout'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '../../components/ui/Card'

function ReturnsPage() {
  const navigate = useNavigate()
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(true)
  const [returns, setReturns] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 })
  const [filters, setFilters] = useState({
    returnType: '',
    status: ''
  })

  useEffect(() => {
    if (tenant?.id) {
      fetchReturns()
    }
  }, [tenant?.id, pagination.page, filters])

  const fetchReturns = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      })

      const response = await api.get(`/accounting/order-returns?${params}`)
      
      if (response.data?.success) {
        setReturns(response.data.data || [])
        setPagination(prev => ({
          ...prev,
          ...response.data.pagination
        }))
      }
    } catch (error) {
      console.error('Error fetching returns:', error)
      toast.error('Failed to load returns')
    } finally {
      setLoading(false)
    }
  }

  const handleApproveReturn = async (returnId) => {
    try {
      await api.put(`/accounting/order-returns/${returnId}/approve`)
      toast.success('Return approved')
      fetchReturns()
    } catch (error) {
      console.error('Error approving return:', error)
      toast.error(error.response?.data?.error?.message || 'Failed to approve return')
    }
  }

  const handleViewOrder = (orderId) => {
    navigate(`/business/orders/${orderId}`)
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
    setPagination(prev => ({ ...prev, page: 1 }))
  }

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
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/business/accounting')}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-brand-600">Order Returns</h1>
            <p className="text-gray-500 mt-1">Manage and approve order returns and refunds.</p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Return Type
                </label>
                <select
                  value={filters.returnType}
                  onChange={(e) => handleFilterChange('returnType', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                >
                  <option value="">All Types</option>
                  <option value="CUSTOMER_FULL">Customer Full</option>
                  <option value="CUSTOMER_PARTIAL">Customer Partial</option>
                  <option value="SUPPLIER">Supplier</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                >
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REFUNDED">Refunded</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Returns List */}
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Return #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {returns.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    No returns found
                  </td>
                </tr>
              ) : (
                returns.map((returnRecord) => (
                  <tr key={returnRecord.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {returnRecord.returnNumber}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {returnRecord.order?.orderNumber || 'N/A'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {returnRecord.returnType?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                      Rs. {returnRecord.totalAmount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        returnRecord.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                        returnRecord.status === 'REFUNDED' ? 'bg-purple-100 text-purple-800' :
                        returnRecord.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {returnRecord.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        {returnRecord.orderId && (
                          <button
                            onClick={() => handleViewOrder(returnRecord.orderId)}
                            className="text-blue-600 hover:text-blue-800 min-h-[44px] min-w-[44px]"
                          >
                            View Order
                          </button>
                        )}
                        {returnRecord.status === 'PENDING' && (
                          <button
                            onClick={() => handleApproveReturn(returnRecord.id)}
                            className="text-green-600 hover:text-green-800 min-h-[44px] min-w-[44px]"
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-sm text-gray-700">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} returns
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 min-h-[44px]"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 min-h-[44px]"
              >
                Next
              </button>
            </div>
          </div>
        )}
          </CardContent>
        </Card>
      </div>
    </ModernLayout>
  )
}

export default ReturnsPage

