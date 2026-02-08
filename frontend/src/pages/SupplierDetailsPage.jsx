import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon, DocumentTextIcon, PencilIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import ModernLayout from '../components/ModernLayout'
import toast from 'react-hot-toast'

const SupplierDetailsPage = () => {
  const { supplierId } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [supplier, setSupplier] = useState(null)
  const [balance, setBalance] = useState(null)
  const [payments, setPayments] = useState([])
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    if (supplierId) fetchSupplierDetails()
  }, [supplierId])

  useEffect(() => {
    if (supplierId) fetchSupplierPayments()
  }, [supplierId])

  const fetchSupplierDetails = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/accounting/suppliers/${supplierId}`)
      setSupplier(response.data?.supplier || null)
      setBalance(response.data?.supplier?.balance ?? null)
    } catch (error) {
      console.error('Failed to fetch supplier details:', error)
      toast.error('Failed to load supplier details')
      navigate('/business/suppliers')
    } finally {
      setLoading(false)
    }
  }

  const fetchSupplierPayments = async () => {
    try {
      const response = await api.get('/accounting/payments', {
        params: { supplierId, type: 'SUPPLIER_PAYMENT', limit: 200 }
      })
      if (response.data?.success && Array.isArray(response.data.data)) {
        setPayments(response.data.data)
      } else {
        setPayments([])
      }
    } catch (error) {
      console.error('Failed to fetch supplier payments:', error)
      setPayments([])
    }
  }

  if (loading) {
    return (
      <ModernLayout>
        <LoadingSpinner className="min-h-screen" />
      </ModernLayout>
    )
  }

  if (!supplier) return null

  const pendingBalance = balance?.pending ?? (typeof balance === 'number' ? balance : 0)
  const isAdvance = pendingBalance < 0
  const totalPurchases = (supplier.purchaseInvoices || []).reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0)
  const totalPayments = (supplier.payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0)

  return (
    <ModernLayout>
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/business/suppliers')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors min-h-[44px]"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Back to Suppliers
          </button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Supplier Dashboard</h1>
              <p className="text-gray-600 mt-2">{supplier.name}</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => navigate(`/business/suppliers/${supplierId}/ledger`)}
                className="btn-primary flex items-center min-h-[44px]"
              >
                <DocumentTextIcon className="h-5 w-5 mr-2" />
                View Ledger
              </button>
              <button
                onClick={() => navigate(`/business/suppliers/${supplierId}/edit`)}
                className="btn-primary flex items-center min-h-[44px]"
              >
                <PencilIcon className="h-5 w-5 mr-2" />
                Edit Supplier
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'purchases', label: 'Purchases' },
            { id: 'payments', label: 'Payments' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-pink-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <>
            <div className="card p-6 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Overview</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-gray-600">Contact</p>
                  <p className="text-lg font-semibold text-gray-900">{supplier.contact || supplier.phone || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="text-lg font-semibold text-gray-900">{supplier.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">{isAdvance ? 'Advance Balance' : 'Pending Balance'}</p>
                  <p className={`text-lg font-semibold ${isAdvance ? 'text-green-600' : 'text-red-600'}`}>
                    Rs. {Math.abs(pendingBalance).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="card p-6">
                <p className="text-sm text-gray-600">Total Purchases</p>
                <p className="text-2xl font-bold text-gray-900">Rs. {totalPurchases.toLocaleString()}</p>
              </div>
              <div className="card p-6">
                <p className="text-sm text-gray-600">Total Payments</p>
                <p className="text-2xl font-bold text-gray-900">Rs. {totalPayments.toLocaleString()}</p>
              </div>
              <div className="card p-6">
                <p className="text-sm text-gray-600">Invoices</p>
                <p className="text-2xl font-bold text-gray-900">{supplier._count?.purchaseInvoices || 0}</p>
              </div>
            </div>
          </>
        )}

        {activeTab === 'purchases' && (
          <div className="card p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Recent Purchases</h2>
            {supplier.purchaseInvoices && supplier.purchaseInvoices.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {supplier.purchaseInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          Rs. {Number(inv.totalAmount || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No purchases found</p>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="card p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Recent Payments</h2>
            {supplier.payments && supplier.payments.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {supplier.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{p.paymentNumber || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {p.date ? new Date(p.date).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          Rs. {Number(p.amount || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{p.paymentMethod || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No payments found</p>
            )}
          </div>
        )}
      </div>
    </ModernLayout>
  )
}

export default SupplierDetailsPage
