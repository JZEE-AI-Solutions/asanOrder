import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, CreditCardIcon, ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useTenant } from '../../hooks/useTenant'
import { toast } from 'react-hot-toast'
import ModernLayout from '../../components/ModernLayout'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '../../components/ui/Card'
import PaymentForm from '../../components/accounting/PaymentForm'

function PaymentsPage() {
  const navigate = useNavigate()
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 })
  const [showForm, setShowForm] = useState(false)
  const [filters, setFilters] = useState({
    type: '',
    fromDate: '',
    toDate: ''
  })

  useEffect(() => {
    if (tenant?.id) {
      fetchPayments()
    }
  }, [tenant?.id, pagination.page, filters])

  const fetchPayments = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      })

      const response = await api.get(`/accounting/payments?${params}`)
      
      if (response.data?.success) {
        setPayments(response.data.data || [])
        setPagination(prev => ({
          ...prev,
          ...response.data.pagination
        }))
      }
    } catch (error) {
      console.error('Error fetching payments:', error)
      toast.error('Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePayment = () => {
    setShowForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    fetchPayments()
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  if (loading && payments.length === 0) {
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
          <div className="flex items-center flex-1 justify-between">
            <div>
              <h1 className="text-3xl font-bold text-brand-600">Payments</h1>
              <p className="text-gray-500 mt-1">Record and track customer and supplier payments.</p>
            </div>
            <button
              onClick={handleCreatePayment}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors min-h-[44px] flex items-center"
            >
              <CreditCardIcon className="h-5 w-5 mr-2" />
              Record Payment
            </button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={filters.type}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                >
                  <option value="">All Types</option>
                  <option value="CUSTOMER_PAYMENT">Customer Payment</option>
                  <option value="SUPPLIER_PAYMENT">Supplier Payment</option>
                  <option value="REFUND">Refund</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => handleFilterChange('fromDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => handleFilterChange('toDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payments List */}
        <Card>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Direction
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer/Supplier
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Received (Rs.)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Paid (Rs.)
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Method
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                    No payments found
                  </td>
                </tr>
              ) : (
                payments.map((payment) => {
                  const isReceived = payment.type === 'CUSTOMER_PAYMENT'
                  const isPaid = payment.type === 'SUPPLIER_PAYMENT' || payment.type === 'REFUND'
                  return (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {new Date(payment.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {payment.paymentNumber}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {isReceived ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                            Received
                          </span>
                        ) : isPaid ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            <ArrowUpTrayIcon className="h-3.5 w-3.5" />
                            Paid
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">
                            {payment.type.replace('_', ' ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {payment.customer?.name || payment.supplier?.name || 'N/A'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-green-700">
                        {isReceived ? `Rs. ${Number(payment.amount).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold text-red-700">
                        {isPaid ? `Rs. ${Number(payment.amount).toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {payment.account?.name || payment.paymentMethod || 'N/A'}
                      </td>
                    </tr>
                  )
                })
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
              {pagination.total} payments
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

        {/* Payment Form Modal */}
        {showForm && (
          <PaymentForm
            onClose={handleFormClose}
          />
        )}
      </div>
    </ModernLayout>
  )
}

export default PaymentsPage

