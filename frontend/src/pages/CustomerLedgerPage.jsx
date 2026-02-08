import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import { toast } from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'
import LoadingSpinner from '../components/LoadingSpinner'
import { Card, CardContent } from '../components/ui/Card'

function CustomerLedgerPage() {
  const navigate = useNavigate()
  const { customerId } = useParams()
  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState(null)
  const [ledger, setLedger] = useState([])
  const [summary, setSummary] = useState(null)
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: ''
  })

  useEffect(() => {
    if (customerId) {
      fetchCustomerLedger()
    }
  }, [customerId, filters])

  const fetchCustomerLedger = async () => {
    try {
      setLoading(true)
      
      const params = new URLSearchParams()
      if (filters.fromDate) {
        params.append('fromDate', filters.fromDate)
      }
      if (filters.toDate) {
        params.append('toDate', filters.toDate)
      }

      const response = await api.get(`/customer/${customerId}/ledger?${params}`)
      
      if (response.data?.success) {
        setCustomer(response.data.customer)
        setLedger(response.data.ledger || [])
        setSummary(response.data.summary)
      } else {
        toast.error('Failed to load customer ledger')
        navigate('/business/customers')
      }
    } catch (error) {
      console.error('Error fetching customer ledger:', error)
      toast.error('Failed to load customer ledger')
      navigate('/business/customers')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
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
            onClick={() => navigate(`/business/customers/${customerId}`)}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-brand-600">Customer Ledger</h1>
            <p className="text-gray-500 mt-1">
              Transaction history for {customer?.name || customer?.phoneNumber || 'Customer'}
            </p>
          </div>
        </div>

        {/* Summary Card */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Opening AR</p>
                <p className="text-lg font-semibold text-red-600">
                  Rs. {summary.openingARBalance.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Opening Advance</p>
                <p className="text-lg font-semibold text-green-600">
                  Rs. {summary.openingAdvanceBalance.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Orders</p>
                <p className="text-lg font-semibold text-gray-900">
                  {summary.totalOrders}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Payments</p>
                <p className="text-lg font-semibold text-blue-600">
                  {summary.totalPayments}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Current Balance</p>
                <p className={`text-lg font-semibold ${summary.currentBalance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {summary.currentBalance >= 0 ? 'Owes: ' : 'Advance: '}
                  Rs. {Math.abs(summary.currentBalance).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => setFilters({ fromDate: '', toDate: '' })}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ledger Table */}
        <Card>
          <CardContent className="p-0">
            {ledger.length === 0 ? (
              <div className="p-8 text-center">
                <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No transactions found for this customer</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Reference
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Debit
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Credit
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ledger.map((entry, index) => (
                      <tr 
                        key={`${entry.type}-${entry.reference || entry.date}-${index}`} 
                        className="hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {new Date(entry.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            entry.type === 'OPENING_BALANCE' ? 'bg-gray-100 text-gray-700' :
                            entry.type === 'ORDER' ? 'bg-blue-100 text-blue-700' :
                            entry.type === 'PAYMENT' ? (entry.isDirectPayment ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700') :
                            entry.type === 'RETURN' ? 'bg-green-100 text-green-700' :
                            entry.type === 'REFUND' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {entry.type === 'OPENING_BALANCE' ? 'Opening' :
                             entry.type === 'ORDER' ? 'Order' :
                             entry.type === 'PAYMENT' ? (entry.isDirectPayment ? 'Direct Payment' : 'Payment') :
                             entry.type === 'RETURN' ? 'Return' :
                             entry.type === 'REFUND' ? 'Refund' :
                             entry.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {entry.description}
                          {entry.orderId && (
                            <button
                              onClick={() => navigate(`/business/orders/${entry.orderId}`)}
                              className="ml-2 text-blue-600 hover:text-blue-900 text-xs underline"
                            >
                              View Order
                            </button>
                          )}
                          {entry.paymentId && (
                            <button
                              onClick={() => navigate(`/business/payments`)}
                              className="ml-2 text-purple-600 hover:text-purple-900 text-xs underline"
                            >
                              View Payment
                            </button>
                          )}
                          {entry.returnId && (
                            <button
                              onClick={() => navigate(`/business/returns/${entry.returnId}`)}
                              className="ml-2 text-green-600 hover:text-green-900 text-xs underline"
                            >
                              View Return
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {entry.reference || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {entry.debit > 0 ? `Rs. ${entry.debit.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {entry.credit > 0 ? `Rs. ${entry.credit.toLocaleString()}` : '-'}
                        </td>
                        <td className={`px-4 py-3 whitespace-nowrap text-sm font-semibold text-right ${
                          entry.balance >= 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {entry.balance >= 0 ? 'Owes: ' : 'Advance: '}
                          Rs. {Math.abs(entry.balance).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ModernLayout>
  )
}

export default CustomerLedgerPage


