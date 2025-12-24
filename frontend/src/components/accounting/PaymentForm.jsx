import { useState, useEffect } from 'react'
import api from '../../services/api'
import { useTenant } from '../../hooks/useTenant'
import { toast } from 'react-hot-toast'

function PaymentForm({ payment, onClose }) {
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(false)
  const [customers, setCustomers] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [orders, setOrders] = useState([])
  const [purchaseInvoices, setPurchaseInvoices] = useState([])
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'CUSTOMER_PAYMENT',
    amount: '',
    paymentMethod: 'Cash',
    customerId: '',
    supplierId: '',
    orderId: '',
    purchaseInvoiceId: ''
  })

  useEffect(() => {
    if (tenant?.id) {
      fetchCustomers()
      fetchSuppliers()
    }
  }, [tenant?.id])

  useEffect(() => {
    if (formData.type === 'CUSTOMER_PAYMENT' && formData.customerId) {
      fetchCustomerOrders()
    }
    if (formData.type === 'SUPPLIER_PAYMENT' && formData.supplierId) {
      fetchSupplierPurchaseInvoices()
    }
  }, [formData.type, formData.customerId, formData.supplierId])

  const fetchCustomers = async () => {
    try {
      const response = await api.get('/customer')
      if (response.data) {
        setCustomers(response.data.customers || [])
      }
    } catch (error) {
      console.error('Error fetching customers:', error)
    }
  }

  const fetchSuppliers = async () => {
    try {
      const response = await api.get('/accounting/suppliers')
      if (response.data?.success) {
        setSuppliers(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching suppliers:', error)
      toast.error('Failed to load suppliers')
    }
  }

  const fetchCustomerOrders = async () => {
    try {
      const response = await api.get(`/order?customerId=${formData.customerId}&status=CONFIRMED`)
      if (response.data?.orders) {
        setOrders(response.data.orders)
      }
    } catch (error) {
      console.error('Error fetching orders:', error)
    }
  }

  const fetchSupplierPurchaseInvoices = async () => {
    try {
      const response = await api.get(`/purchase-invoice?supplierId=${formData.supplierId}`)
      if (response.data?.success && response.data.purchaseInvoices) {
        // Calculate pending balance for each invoice
        const invoicesWithPending = response.data.purchaseInvoices.map(inv => {
          // Get payments linked to this invoice
          const linkedPayments = inv.payments || []
          const linkedPaymentsTotal = linkedPayments.reduce((sum, p) => sum + p.amount, 0)
          
          // Fallback to supplier payments if no linked payments
          const supplierPayments = inv.supplier?.payments || []
          const supplierPaymentsTotal = supplierPayments.reduce((sum, p) => sum + p.amount, 0)
          
          // Use linked payments if available, otherwise use supplier payments
          const paymentsTotal = linkedPaymentsTotal > 0 ? linkedPaymentsTotal : supplierPaymentsTotal
          
          // Backward compatibility: also check paymentAmount
          const totalPaid = paymentsTotal > 0 ? paymentsTotal : (inv.paymentAmount || 0)
          const pending = inv.totalAmount - totalPaid
          
          return {
            ...inv,
            pending: Math.max(0, pending)
          }
        }).filter(inv => inv.pending > 0) // Only show invoices with pending balance
        
        setPurchaseInvoices(invoicesWithPending)
      }
    } catch (error) {
      console.error('Error fetching purchase invoices:', error)
      toast.error('Failed to load purchase invoices')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.date || !formData.type || !formData.amount || !formData.paymentMethod) {
      toast.error('Please fill in all required fields')
      return
    }

    if (formData.type === 'CUSTOMER_PAYMENT' && !formData.customerId) {
      toast.error('Please select a customer')
      return
    }

    if (formData.type === 'SUPPLIER_PAYMENT' && !formData.supplierId) {
      toast.error('Please select a supplier')
      return
    }

    try {
      setLoading(true)
      
      const submitData = {
        date: formData.date,
        type: formData.type,
        amount: parseFloat(formData.amount),
        paymentMethod: formData.paymentMethod,
        customerId: formData.customerId || null,
        supplierId: formData.supplierId || null,
        orderId: formData.orderId || null,
        purchaseInvoiceId: formData.purchaseInvoiceId || null
      }

      await api.post('/accounting/payments', submitData)
      toast.success('Payment recorded successfully')
      onClose()
    } catch (error) {
      console.error('Error recording payment:', error)
      toast.error(error.response?.data?.error?.message || 'Failed to record payment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              Record Payment
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  type: e.target.value,
                  customerId: '',
                  supplierId: '',
                  orderId: '',
                  purchaseInvoiceId: ''
                }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              >
                <option value="CUSTOMER_PAYMENT">Customer Payment</option>
                <option value="SUPPLIER_PAYMENT">Supplier Payment</option>
                <option value="REFUND">Refund</option>
              </select>
            </div>

            {formData.type === 'CUSTOMER_PAYMENT' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.customerId}
                    onChange={(e) => setFormData(prev => ({ ...prev, customerId: e.target.value, orderId: '' }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                  >
                    <option value="">Select Customer</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name || customer.phoneNumber}
                      </option>
                    ))}
                  </select>
                </div>

                {formData.customerId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Order (Optional)
                    </label>
                    <select
                      value={formData.orderId}
                      onChange={(e) => setFormData(prev => ({ ...prev, orderId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    >
                      <option value="">Select Order</option>
                      {orders.map(order => (
                        <option key={order.id} value={order.id}>
                          {order.orderNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}

            {formData.type === 'SUPPLIER_PAYMENT' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supplier <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.supplierId}
                    onChange={(e) => setFormData(prev => ({ ...prev, supplierId: e.target.value, purchaseInvoiceId: '' }))}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                  >
                    <option value="">Select Supplier</option>
                    {suppliers.map(supplier => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>

                {formData.supplierId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Purchase Invoice (Optional)
                    </label>
                    <select
                      value={formData.purchaseInvoiceId}
                      onChange={(e) => setFormData(prev => ({ ...prev, purchaseInvoiceId: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    >
                      <option value="">Select Purchase Invoice (Optional)</option>
                      {purchaseInvoices.map(invoice => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber} - Pending: Rs. {invoice.pending.toFixed(2)}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      Select a purchase invoice to link this payment to it
                    </p>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder="0.00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              >
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Credit Card">Credit Card</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
              >
                {loading ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default PaymentForm

