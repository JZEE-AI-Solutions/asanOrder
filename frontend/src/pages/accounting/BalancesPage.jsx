import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useTenant } from '../../hooks/useTenant'
import { toast } from 'react-hot-toast'
import ModernLayout from '../../components/ModernLayout'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '../../components/ui/Card'

function BalancesPage() {
  const navigate = useNavigate()
  const { tenant } = useTenant()
  const [activeTab, setActiveTab] = useState('customers')
  const [loading, setLoading] = useState(true)
  const [customerBalances, setCustomerBalances] = useState([])
  const [supplierBalances, setSupplierBalances] = useState([])

  useEffect(() => {
    if (tenant?.id) {
      fetchBalances()
    }
  }, [tenant?.id, activeTab])

  const fetchBalances = async () => {
    try {
      setLoading(true)

      if (activeTab === 'customers') {
        const response = await api.get('/accounting/balances/customers')
        if (response.data?.success) {
          setCustomerBalances(response.data.data || [])
        }
      } else {
        const response = await api.get('/accounting/balances/suppliers')
        if (response.data?.success) {
          setSupplierBalances(response.data.data || [])
        }
      }
    } catch (error) {
      console.error('Error fetching balances:', error)
      toast.error('Failed to load balances')
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
            onClick={() => navigate('/business/accounting')}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-brand-600">Balances</h1>
            <p className="text-gray-500 mt-1">View customer and supplier account balances.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('customers')}
              className={`py-4 px-1 border-b-2 font-medium text-sm min-h-[44px] ${activeTab === 'customers'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Customer Balances (AR)
            </button>
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`py-4 px-1 border-b-2 font-medium text-sm min-h-[44px] ${activeTab === 'suppliers'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Supplier Balances (AP)
            </button>
          </nav>
        </div>

        {/* Customer Balances */}
        {activeTab === 'customers' && (
          <Card>
            <CardContent>
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">
                  Accounts Receivable
                </h2>
              </div>
              <div className="p-6">
            {customerBalances.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No customer balances</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Pending
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Advance Balance
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Orders
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {customerBalances.map((balance) => (
                      <tr key={balance.customerId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {balance.customerName || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-red-600">
                          Rs. {balance.totalPending.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-green-600">
                          Rs. {balance.advanceBalance.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {balance.orders?.length || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Supplier Balances */}
        {activeTab === 'suppliers' && (
          <Card>
            <CardContent>
              <div className="p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-900">
                  Accounts Payable
                </h2>
              </div>
              <div className="p-6">
            {supplierBalances.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No supplier balances</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Supplier
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Opening Balance
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Invoices
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Paid
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Pending
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {supplierBalances.map((balance) => (
                      <tr key={balance.supplierId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {balance.supplierName}
                        </td>
                        <td className={`px-4 py-3 text-sm font-semibold ${balance.openingBalance > 0
                            ? 'text-red-600'
                            : balance.openingBalance < 0
                              ? 'text-green-600'
                              : 'text-gray-900'
                          }`}>
                          {balance.openingBalance > 0 && 'We Owe: '}
                          {balance.openingBalance < 0 && 'They Owe: '}
                          Rs. {Math.abs(balance.openingBalance || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          Rs. {balance.totalInvoices.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          Rs. {balance.totalPaid.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-red-600">
                          Rs. {balance.pending.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ModernLayout>
  )
}

export default BalancesPage

