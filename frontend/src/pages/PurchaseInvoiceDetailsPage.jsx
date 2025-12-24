import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon, CurrencyDollarIcon, PencilIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'
import { useTenant } from '../hooks'

const PurchaseInvoiceDetailsPage = () => {
  const navigate = useNavigate()
  const { invoiceId } = useParams()
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(true)
  const [invoice, setInvoice] = useState(null)
  const [payments, setPayments] = useState([])
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentFormData, setPaymentFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    paymentMethod: 'Cash'
  })
  const [processingPayment, setProcessingPayment] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [transactionFilters, setTransactionFilters] = useState({
    fromDate: '',
    toDate: ''
  })
  const [showEditPaymentForm, setShowEditPaymentForm] = useState(false)
  const [selectedPaymentForEdit, setSelectedPaymentForEdit] = useState(null)
  const [editPaymentFormData, setEditPaymentFormData] = useState({
    date: '',
    amount: '',
    paymentMethod: 'Cash',
    note: ''
  })
  const [processingEditPayment, setProcessingEditPayment] = useState(false)

  useEffect(() => {
    if (invoiceId) {
      fetchInvoice()
    }
  }, [invoiceId])

  useEffect(() => {
    if (invoice) {
      fetchTransactions()
    }
  }, [invoice, transactionFilters])

  const fetchInvoice = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/purchase-invoice/${invoiceId}`)
      const invoice = response.data.purchaseInvoice
      
      if (!invoice) {
        toast.error('Invoice not found')
        navigate('/business/purchases')
        return
      }

      setInvoice(invoice)
      
      // Store payments linked to this purchase invoice (preferred) or from supplier (backward compatibility)
      console.log('🔍 Payment Debug Info:')
      console.log('  invoice.payments:', invoice.payments)
      console.log('  invoice.payments length:', invoice.payments?.length || 0)
      console.log('  invoice.supplier?.payments:', invoice.supplier?.payments)
      console.log('  invoice.supplier?.payments length:', invoice.supplier?.payments?.length || 0)
      console.log('  invoice.paymentAmount:', invoice.paymentAmount)
      
      // Prefer payments linked directly to invoice
      if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
        console.log('✅ Using invoice.payments (linked to invoice):', invoice.payments.map(p => `${p.paymentNumber}: Rs. ${p.amount}`).join(', '))
        setPayments(invoice.payments)
      } else if (invoice.supplier?.payments && Array.isArray(invoice.supplier.payments) && invoice.supplier.payments.length > 0) {
        console.log('⚠️ Using supplier.payments (fallback - legacy):', invoice.supplier.payments.map(p => `${p.paymentNumber}: Rs. ${p.amount}`).join(', '))
        setPayments(invoice.supplier.payments)
      } else {
        console.log('ℹ️ No payments found in response')
        setPayments([])
      }
    } catch (error) {
      console.error('Failed to fetch invoice:', error)
      toast.error('Failed to load invoice')
      navigate('/business/purchases')
    } finally {
      setLoading(false)
    }
  }

  const calculateTotalPaid = () => {
    if (!invoice) return 0
    
    // Sum all Payment records linked to this purchase invoice
    const paymentsTotal = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0)
    
    console.log('💰 calculateTotalPaid:')
    console.log('  payments array:', payments)
    console.log('  payments count:', payments.length)
    console.log('  paymentsTotal (sum of payments array):', paymentsTotal)
    console.log('  invoice.paymentAmount:', invoice.paymentAmount)
    
    // Backward compatibility: if no payments linked to invoice and paymentAmount exists, use it
    // This handles old invoices created before we started linking payments
    if (paymentsTotal === 0 && invoice.paymentAmount > 0) {
      console.log('  → Using invoice.paymentAmount (backward compatibility):', invoice.paymentAmount)
      return invoice.paymentAmount
    }
    
    console.log('  → Using paymentsTotal:', paymentsTotal)
    return paymentsTotal
  }

  const calculateRemainingBalance = () => {
    if (!invoice) return 0
    const totalPaid = calculateTotalPaid()
    return invoice.totalAmount - totalPaid
  }

  const fetchTransactions = async () => {
    if (!invoice || !invoiceId) return
    
    try {
      setLoadingTransactions(true)
      const params = new URLSearchParams({
        page: 1,
        limit: 100,
        sort: 'date',
        order: 'desc'
      })
      
      if (transactionFilters.fromDate) {
        params.append('fromDate', transactionFilters.fromDate)
      }
      if (transactionFilters.toDate) {
        params.append('toDate', transactionFilters.toDate)
      }

      const response = await api.get(`/accounting/transactions?${params}`)
      
      if (response.data?.success) {
        // Filter transactions related to this purchase invoice
        const invoiceTransactions = (response.data.data || []).filter(txn => 
          txn.purchaseInvoiceId === invoiceId || 
          (txn.description && txn.description.includes(invoice.invoiceNumber))
        )
        setTransactions(invoiceTransactions)
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
    } finally {
      setLoadingTransactions(false)
    }
  }

  const handleMakePayment = () => {
    const remaining = calculateRemainingBalance()
    setPaymentFormData({
      date: new Date().toISOString().split('T')[0],
      amount: remaining > 0 ? remaining.toString() : '',
      paymentMethod: 'Cash'
    })
    setShowPaymentForm(true)
  }

  const handlePaymentSubmit = async (e) => {
    e.preventDefault()
    
    if (!invoice?.supplier?.id) {
      toast.error('Supplier information not available')
      return
    }

    if (!paymentFormData.amount || parseFloat(paymentFormData.amount) <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }

    setProcessingPayment(true)
    try {
      await api.post('/accounting/payments', {
        date: paymentFormData.date,
        type: 'SUPPLIER_PAYMENT',
        amount: parseFloat(paymentFormData.amount),
        paymentMethod: paymentFormData.paymentMethod,
        supplierId: invoice.supplier.id,
        purchaseInvoiceId: invoiceId // Link payment to this purchase invoice
      })
      
      toast.success('Payment recorded successfully')
      setShowPaymentForm(false)
      
      // Refresh invoice data to get updated payments
      await fetchInvoice()
      // Refresh transactions to show new payment transaction
      await fetchTransactions()
    } catch (error) {
      console.error('Error recording payment:', error)
      const errorMessage = error.response?.data?.error?.message || 'Failed to record payment'
      toast.error(errorMessage)
    } finally {
      setProcessingPayment(false)
    }
  }

  const handleEditPaymentSubmit = async (e) => {
    e.preventDefault()
    
    if (!selectedPaymentForEdit) {
      toast.error('Payment information not available')
      return
    }

    const newAmount = parseFloat(editPaymentFormData.amount)
    if (!newAmount || newAmount <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }

    setProcessingEditPayment(true)
    try {
      await api.put(`/accounting/payments/${selectedPaymentForEdit.id}`, {
        date: editPaymentFormData.date,
        amount: newAmount,
        paymentMethod: editPaymentFormData.paymentMethod
      })
      
      toast.success('Payment updated successfully')
      setShowEditPaymentForm(false)
      setSelectedPaymentForEdit(null)
      
      // Refresh invoice data to get updated payments
      await fetchInvoice()
      // Refresh transactions to show new payment adjustment transaction
      await fetchTransactions()
    } catch (error) {
      console.error('Error updating payment:', error)
      const errorMessage = error.response?.data?.error?.message || 'Failed to update payment'
      toast.error(errorMessage)
    } finally {
      setProcessingEditPayment(false)
    }
  }

  if (loading) {
    return (
      <ModernLayout>
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      </ModernLayout>
    )
  }

  if (!invoice) {
    return null
  }

  return (
    <ModernLayout>
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/business/purchases')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors min-h-[44px]"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Back to Purchases
          </button>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Purchase Invoice Details</h1>
              <p className="text-gray-600 mt-2">Invoice #{invoice.invoiceNumber}</p>
            </div>
            <button
              onClick={() => navigate(`/business/purchases/${invoiceId}/edit`)}
              className="btn-primary flex items-center min-h-[44px]"
            >
              <PencilIcon className="h-5 w-5 mr-2" />
              Edit Invoice
            </button>
          </div>
        </div>

        {/* Invoice Details */}
        <div className="card p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Invoice Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-600">Invoice Number</p>
              <p className="text-lg font-semibold text-gray-900">{invoice.invoiceNumber}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Supplier</p>
              <p className="text-lg font-semibold text-gray-900">{invoice.supplierName || invoice.supplier?.name || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Invoice Date</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Date(invoice.invoiceDate).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Amount</p>
              <p className="text-lg font-semibold text-gray-900">Rs. {invoice.totalAmount.toLocaleString()}</p>
            </div>
            {invoice.notes && (
              <div className="md:col-span-2">
                <p className="text-sm text-gray-600">Notes</p>
                <p className="text-lg text-gray-900">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Products List */}
        <div className="card p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Products</h2>
          {invoice.purchaseItems && invoice.purchaseItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoice.purchaseItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{item.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">Rs. {item.purchasePrice.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                        Rs. {(item.quantity * item.purchasePrice).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No products found</p>
          )}
        </div>

        {/* Payments Section */}
        {invoice.supplier && (
          <div className="card p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Payments</h2>
              <button
                type="button"
                onClick={handleMakePayment}
                className="btn-primary flex items-center min-h-[44px]"
                disabled={calculateRemainingBalance() <= 0}
              >
                <CurrencyDollarIcon className="h-5 w-5 mr-2" />
                Make Payment
              </button>
            </div>

            {/* Payment Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">Total Amount</p>
                <p className="text-lg font-bold text-gray-900">Rs. {invoice.totalAmount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Paid</p>
                <p className="text-lg font-bold text-green-600">
                  Rs. {calculateTotalPaid().toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Remaining Balance</p>
                <p className={`text-lg font-bold ${calculateRemainingBalance() > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  Rs. {calculateRemainingBalance().toLocaleString()}
                </p>
              </div>
            </div>

            {/* Payments List */}
            {(payments.length === 0 && !invoice.paymentAmount) ? (
              <p className="text-gray-500 text-center py-4">No payments recorded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {payments.map((payment) => {
                      // Check if this payment matches the initial payment
                      const isInitialPayment = invoice.paymentAmount > 0 &&
                        payment.amount === invoice.paymentAmount &&
                        new Date(payment.date).toDateString() === new Date(invoice.invoiceDate).toDateString() &&
                        payment.supplierId === invoice.supplierId
                      
                      return (
                        <tr key={payment.id} className={isInitialPayment ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-gray-50"}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {new Date(payment.date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {payment.paymentNumber}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                            Rs. {payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {payment.paymentMethod}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {isInitialPayment ? (
                              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">At Creation</span>
                            ) : (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Additional</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            <button
                              onClick={() => {
                                setSelectedPaymentForEdit(payment)
                                setEditPaymentFormData({
                                  date: new Date(payment.date).toISOString().split('T')[0],
                                  amount: payment.amount.toString(),
                                  paymentMethod: payment.paymentMethod || 'Cash'
                                })
                                setShowEditPaymentForm(true)
                              }}
                              className="text-blue-600 hover:text-blue-900"
                              title="Edit Payment"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {/* Show initial payment separately only if it's not in Payment records (backward compatibility) */}
                    {invoice.paymentAmount > 0 && !payments.some(payment => 
                      payment.amount === invoice.paymentAmount &&
                      new Date(payment.date).toDateString() === new Date(invoice.invoiceDate).toDateString() &&
                      payment.supplierId === invoice.supplierId
                    ) && (
                      <tr className="bg-blue-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {new Date(invoice.invoiceDate).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">Initial Payment</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                          Rs. {invoice.paymentAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{invoice.paymentMethod || 'N/A'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">At Creation</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Payment Form Modal */}
        {showPaymentForm && invoice?.supplier && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Make Payment</h2>
                  <button
                    onClick={() => setShowPaymentForm(false)}
                    className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handlePaymentSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Supplier
                    </label>
                    <input
                      type="text"
                      value={invoice.supplierName || invoice.supplier.name || ''}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 min-h-[44px]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={paymentFormData.date}
                      onChange={(e) => setPaymentFormData(prev => ({ ...prev, date: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={calculateRemainingBalance()}
                      value={paymentFormData.amount}
                      onChange={(e) => setPaymentFormData(prev => ({ ...prev, amount: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Remaining balance: Rs. {calculateRemainingBalance().toLocaleString()}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Method <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={paymentFormData.paymentMethod}
                      onChange={(e) => setPaymentFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Credit Card">Credit Card</option>
                    </select>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowPaymentForm(false)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={processingPayment}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                    >
                      {processingPayment ? 'Processing...' : 'Record Payment'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Edit Payment Modal */}
        {showEditPaymentForm && selectedPaymentForEdit && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Edit Payment</h2>
                  <button
                    onClick={() => {
                      setShowEditPaymentForm(false)
                      setSelectedPaymentForEdit(null)
                    }}
                    className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleEditPaymentSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Number
                    </label>
                    <input
                      type="text"
                      value={selectedPaymentForEdit.paymentNumber}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 min-h-[44px]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={editPaymentFormData.date}
                      onChange={(e) => setEditPaymentFormData(prev => ({ ...prev, date: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={editPaymentFormData.amount}
                      onChange={(e) => setEditPaymentFormData(prev => ({ ...prev, amount: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Original amount: Rs. {selectedPaymentForEdit.amount.toLocaleString()}
                      {parseFloat(editPaymentFormData.amount) !== selectedPaymentForEdit.amount && (
                        <span className={`ml-2 ${parseFloat(editPaymentFormData.amount) < selectedPaymentForEdit.amount ? 'text-green-600' : 'text-red-600'}`}>
                          ({parseFloat(editPaymentFormData.amount) < selectedPaymentForEdit.amount ? 'Decrease' : 'Increase'}: Rs. {Math.abs(parseFloat(editPaymentFormData.amount) - selectedPaymentForEdit.amount).toLocaleString()})
                        </span>
                      )}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Method <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={editPaymentFormData.paymentMethod}
                      onChange={(e) => setEditPaymentFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>


                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditPaymentForm(false)
                        setSelectedPaymentForEdit(null)
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={processingEditPayment}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                    >
                      {processingEditPayment ? 'Updating...' : 'Update Payment'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Journal Entries Section */}
        <div className="card p-6 mt-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Journal Entries</h2>
          
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                From Date
              </label>
              <input
                type="date"
                value={transactionFilters.fromDate}
                onChange={(e) => setTransactionFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                To Date
              </label>
              <input
                type="date"
                value={transactionFilters.toDate}
                onChange={(e) => setTransactionFilters(prev => ({ ...prev, toDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              />
            </div>
          </div>

          {/* Transactions Table */}
          {loadingTransactions ? (
            <div className="text-center py-8">
              <LoadingSpinner />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No journal entries found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map((transaction) => 
                    transaction.transactionLines?.map((line, lineIndex) => (
                      <tr key={`${transaction.id}-${lineIndex}`} className="hover:bg-gray-50">
                        {lineIndex === 0 && (
                          <>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900" rowSpan={transaction.transactionLines.length}>
                              {new Date(transaction.date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900" rowSpan={transaction.transactionLines.length}>
                              {transaction.transactionNumber}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900" rowSpan={transaction.transactionLines.length}>
                              {transaction.description}
                            </td>
                          </>
                        )}
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {line.account?.name || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {line.debitAmount > 0 ? `Rs. ${line.debitAmount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {line.creditAmount > 0 ? `Rs. ${line.creditAmount.toLocaleString()}` : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ModernLayout>
  )
}

export default PurchaseInvoiceDetailsPage

