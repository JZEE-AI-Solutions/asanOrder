import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon, CurrencyDollarIcon, PencilIcon, ArrowLeftOnRectangleIcon, Squares2X2Icon, RectangleStackIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'
import { useTenant } from '../hooks'
import PaymentAccountSelector from '../components/accounting/PaymentAccountSelector'

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
    paymentAccountId: ''
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
    paymentAccountId: '',
    note: ''
  })
  const [processingEditPayment, setProcessingEditPayment] = useState(false)
  const [paymentsViewMode, setPaymentsViewMode] = useState('card') // 'card' | 'grid' – card is mobile-friendly

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
      if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
        setPayments(invoice.payments)
      } else if (invoice.supplier?.payments && Array.isArray(invoice.supplier.payments) && invoice.supplier.payments.length > 0) {
        setPayments(invoice.supplier.payments)
      } else {
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
    
    // Backward compatibility: if no payments linked to invoice and paymentAmount exists, use it
    // This handles old invoices created before we started linking payments
    if (paymentsTotal === 0 && invoice.paymentAmount > 0) {
      return invoice.paymentAmount
    }
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
        // Only show transactions that are actually linked to this purchase invoice
        // Exclude transactions linked to orders (orderId should be null or not set)
        const invoiceTransactions = (response.data.data || []).filter(txn => {
          // Only match by purchaseInvoiceId - don't use description matching as it's too broad
          // Description matching can incorrectly include order transactions with matching numbers
          const matchesById = txn.purchaseInvoiceId === invoiceId
          
          // Exclude transactions that are linked to orders (these are customer order transactions, not purchase invoice transactions)
          const isOrderTransaction = txn.orderId !== null && txn.orderId !== undefined
          
          return matchesById && !isOrderTransaction
        })
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
      paymentAccountId: ''
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
        paymentAccountId: paymentFormData.paymentAccountId,
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
        paymentAccountId: editPaymentFormData.paymentAccountId
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
            <div className="flex items-center space-x-3">
              <button
                onClick={() => navigate(`/business/returns/supplier/new?purchaseInvoiceId=${invoiceId}`)}
                className="btn-primary flex items-center px-6 py-2.5 bg-purple-600 hover:bg-purple-700 min-h-[44px]"
              >
                <ArrowLeftOnRectangleIcon className="h-5 w-5 mr-2" />
                Create Return
              </button>
              <button
                onClick={() => navigate(`/business/returns/standalone/new?purchaseInvoiceId=${invoiceId}`)}
                className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <ArrowLeftOnRectangleIcon className="h-5 w-5" />
                <span>Return Products</span>
              </button>
              <button
                onClick={() => navigate(`/business/purchases/${invoiceId}/edit`)}
                className="btn-primary flex items-center min-h-[44px]"
              >
                <PencilIcon className="h-5 w-5 mr-2" />
                Edit Invoice
              </button>
            </div>
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Variant</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoice.purchaseItems.map((item) => {
                    const variantColor = item.productVariant?.color ?? item.color ?? ''
                    const variantSize = item.productVariant?.size ?? item.size ?? ''
                    const variantLabel = [variantColor, variantSize].filter(Boolean).join(' · ')
                    return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{item.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{variantLabel || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">Rs. {item.purchasePrice.toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                        Rs. {(item.quantity * item.purchasePrice).toLocaleString()}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No products found</p>
          )}
        </div>

        {/* Returns Section */}
        {invoice.returns && invoice.returns.length > 0 && (
          <div className="card p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Returned Products</h2>
            <div className="space-y-4">
              {invoice.returns.map((returnRecord) => (
                <div key={returnRecord.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-900">{returnRecord.returnNumber}</span>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        returnRecord.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                        returnRecord.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {returnRecord.status}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Return Date</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {new Date(returnRecord.returnDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  
                  {returnRecord.reason && (
                    <p className="text-sm text-gray-600 mb-3">
                      <span className="font-medium">Reason:</span> {returnRecord.reason}
                    </p>
                  )}
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Variant</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                          {returnRecord.returnItems.some(item => item.reason) && (
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {returnRecord.returnItems.map((item, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm text-gray-900">{item.productName}</td>
                            <td className="px-3 py-2 text-sm text-gray-700">
                              {[item.color, item.size].filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-900">{item.quantity}</td>
                            <td className="px-3 py-2 text-sm text-gray-900">Rs. {item.purchasePrice.toLocaleString()}</td>
                            <td className="px-3 py-2 text-sm font-semibold text-gray-900">
                              Rs. {(item.quantity * item.purchasePrice).toLocaleString()}
                            </td>
                            {returnRecord.returnItems.some(i => i.reason) && (
                              <td className="px-3 py-2 text-sm text-gray-600">{item.reason || '-'}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={returnRecord.returnItems.some(item => item.reason) ? 5 : 4} className="px-3 py-2 text-right text-sm font-medium text-gray-700">
                            Return Total:
                          </td>
                          <td className="px-3 py-2 text-sm font-bold text-gray-900">
                            Rs. {returnRecord.totalAmount.toLocaleString()}
                          </td>
                          {returnRecord.returnItems.some(item => item.reason) && <td></td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  
                  {returnRecord.notes && (
                    <p className="text-sm text-gray-600 mt-3 pt-3 border-t border-gray-200">
                      <span className="font-medium">Notes:</span> {returnRecord.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payments Section – card view (default) or grid/table */}
        {invoice.supplier && (
          <div className="card p-4 sm:p-6 rounded-xl">
            <div className="flex flex-col gap-3 mb-4 sm:mb-6">
              <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Payments</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500 hidden sm:inline">View:</span>
                  <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
                    <button
                      type="button"
                      onClick={() => setPaymentsViewMode('card')}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md min-h-[40px] touch-manipulation transition-colors ${paymentsViewMode === 'card' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                      title="Card view"
                    >
                      <RectangleStackIcon className="h-4 w-4" />
                      Card
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentsViewMode('grid')}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md min-h-[40px] touch-manipulation transition-colors ${paymentsViewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                      title="Table view"
                    >
                      <Squares2X2Icon className="h-4 w-4" />
                      Grid
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleMakePayment}
                    className="btn-primary flex items-center justify-center min-h-[44px] px-4 py-3 rounded-xl touch-manipulation flex-1 sm:flex-initial"
                    disabled={calculateRemainingBalance() <= 0}
                  >
                    <CurrencyDollarIcon className="h-5 w-5 mr-2" />
                    Make Payment
                  </button>
                </div>
              </div>
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

            {/* Payments List – Card or Grid */}
            {(payments.length === 0 && !invoice.paymentAmount) ? (
              <p className="text-gray-500 text-center py-4">No payments recorded yet</p>
            ) : paymentsViewMode === 'card' ? (
              <div className="space-y-3">
                {payments.map((payment) => {
                  const isInitialPayment = invoice.paymentAmount > 0 &&
                    payment.amount === invoice.paymentAmount &&
                    new Date(payment.date).toDateString() === new Date(invoice.invoiceDate).toDateString() &&
                    payment.supplierId === invoice.supplierId
                  return (
                    <div
                      key={payment.id}
                      className={`rounded-xl p-4 border shadow-sm ${isInitialPayment ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1.5 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{payment.paymentNumber}</p>
                          <p className="text-sm text-gray-600">
                            {new Date(payment.date).toLocaleDateString()}
                          </p>
                          <p className="text-base font-bold text-gray-900">
                            Rs. {payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-sm text-gray-500">{payment.account?.name || payment.paymentMethod || 'N/A'}</p>
                          {isInitialPayment ? (
                            <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">At Creation</span>
                          ) : (
                            <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Additional</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPaymentForEdit(payment)
                            setEditPaymentFormData({
                              date: new Date(payment.date).toISOString().split('T')[0],
                              amount: payment.amount.toString(),
                              paymentAccountId: payment.accountId || ''
                            })
                            setShowEditPaymentForm(true)
                          }}
                          className="flex-shrink-0 p-2.5 rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-800 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                          title="Edit Payment"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {/* Legacy initial payment when not in Payment records */}
                {invoice.paymentAmount > 0 && !payments.some(payment =>
                  payment.amount === invoice.paymentAmount &&
                  new Date(payment.date).toDateString() === new Date(invoice.invoiceDate).toDateString() &&
                  payment.supplierId === invoice.supplierId
                ) && (
                  <div className="rounded-xl p-4 border border-blue-200 bg-blue-50 shadow-sm">
                    <div className="space-y-1.5">
                      <p className="text-sm font-semibold text-gray-900">Initial Payment</p>
                      <p className="text-sm text-gray-600">{new Date(invoice.invoiceDate).toLocaleDateString()}</p>
                      <p className="text-base font-bold text-gray-900">
                        Rs. {invoice.paymentAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-sm text-gray-500">{invoice.paymentMethod || 'N/A'}</p>
                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">At Creation</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                            {payment.account?.name || payment.paymentMethod || 'N/A'}
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
                                  paymentAccountId: payment.accountId || ''
                                })
                                setShowEditPaymentForm(true)
                              }}
                              className="text-blue-600 hover:text-blue-900 p-2 -m-2"
                              title="Edit Payment"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
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
                        <td />
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
                      Payment Account <span className="text-red-500">*</span>
                    </label>
                    <PaymentAccountSelector
                      value={paymentFormData.paymentAccountId || ''}
                      onChange={(value) => setPaymentFormData(prev => ({ ...prev, paymentAccountId: value }))}
                      showQuickAdd={true}
                      required={true}
                    />
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
                      Payment Account <span className="text-red-500">*</span>
                    </label>
                    <PaymentAccountSelector
                      value={editPaymentFormData.paymentAccountId || ''}
                      onChange={(value) => setEditPaymentFormData(prev => ({ ...prev, paymentAccountId: value }))}
                      showQuickAdd={true}
                      required={true}
                    />
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

