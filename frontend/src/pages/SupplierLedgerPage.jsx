import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import { useTenant } from '../hooks/useTenant'
import { toast } from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'
import LoadingSpinner from '../components/LoadingSpinner'
import { Card, CardContent } from '../components/ui/Card'

function SupplierLedgerPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(true)
  const [supplier, setSupplier] = useState(null)
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [summary, setSummary] = useState(null)
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: ''
  })

  useEffect(() => {
    if (id && tenant?.id) {
      fetchSupplierLedger()
    }
  }, [id, tenant?.id, filters])

  const fetchSupplierLedger = async () => {
    try {
      setLoading(true)
      
      const params = new URLSearchParams()
      if (filters.fromDate) {
        params.append('fromDate', filters.fromDate)
      }
      if (filters.toDate) {
        params.append('toDate', filters.toDate)
      }

      const response = await api.get(`/accounting/suppliers/${id}/ledger?${params}`)
      
      if (response.data?.success) {
        setSupplier(response.data.supplier)
        setLedgerEntries(response.data.ledgerEntries || [])
        setSummary(response.data.summary)
      } else {
        toast.error('Failed to load supplier ledger')
        navigate('/business/suppliers')
      }
    } catch (error) {
      console.error('Error fetching supplier ledger:', error)
      toast.error('Failed to load supplier ledger')
      navigate('/business/suppliers')
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
            onClick={() => navigate('/business/suppliers')}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-brand-600">Supplier Ledger</h1>
            <p className="text-gray-500 mt-1">
              Transaction history for {supplier?.name || 'Supplier'}
            </p>
          </div>
        </div>

        {/* Summary Card */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Opening Balance</p>
                <p className={`text-lg font-semibold ${summary.openingBalance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {summary.openingBalance >= 0 ? 'We Owe: ' : 'They Owe: '}
                  Rs. {Math.abs(summary.openingBalance).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Purchases</p>
                <p className="text-lg font-semibold text-gray-900">
                  Rs. {summary.totalPurchases.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Returns</p>
                <p className="text-lg font-semibold text-green-600">
                  Rs. {summary.totalReturns.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Payments</p>
                <p className="text-lg font-semibold text-blue-600">
                  Rs. {summary.totalPayments.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Closing Balance</p>
                <p className={`text-lg font-semibold ${summary.closingBalance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {summary.closingBalance >= 0 ? 'We Owe: ' : 'They Owe: '}
                  Rs. {Math.abs(summary.closingBalance).toLocaleString()}
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
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => setFilters({ fromDate: '', toDate: '' })}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            {ledgerEntries.length === 0 ? (
              <div className="p-8 text-center">
                <DocumentTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No transactions found for this supplier</p>
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
                    {ledgerEntries.map((entry, index) => (
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
                            entry.type === 'PURCHASE_INVOICE' ? 'bg-blue-100 text-blue-700' :
                            entry.type === 'RETURN' ? 'bg-green-100 text-green-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>
                            {entry.type === 'OPENING_BALANCE' ? 'Opening' :
                             entry.type === 'PURCHASE_INVOICE' ? 'Purchase' :
                             entry.type === 'RETURN' ? 'Return' :
                             'Payment'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {entry.description}
                          {entry.invoiceId && (
                            <button
                              onClick={() => navigate(`/business/purchases/${entry.invoiceId}`)}
                              className="ml-2 text-blue-600 hover:text-blue-900 text-xs underline"
                            >
                              View Invoice
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
                          {entry.balance >= 0 ? 'We Owe: ' : 'They Owe: '}
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

export default SupplierLedgerPage


