import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ModernLayout from '../components/ModernLayout'
import { Card, CardContent } from '../components/ui/Card'
import PaymentAccountSelector from '../components/accounting/PaymentAccountSelector'
import InvoiceSelector from '../components/InvoiceSelector'

function CreateStandaloneSupplierReturnPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preSelectedInvoiceId = searchParams.get('purchaseInvoiceId')

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [selectedProducts, setSelectedProducts] = useState([])
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0])
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [calculatedTotal, setCalculatedTotal] = useState(0)
  const [returnHandlingMethod, setReturnHandlingMethod] = useState('REDUCE_AP')
  const [returnRefundAccountId, setReturnRefundAccountId] = useState('')

  useEffect(() => {
    if (preSelectedInvoiceId) {
      fetchInvoice(preSelectedInvoiceId)
    }
  }, [preSelectedInvoiceId])

  useEffect(() => {
    if (selectedInvoice) {
      calculateTotal()
    }
  }, [selectedProducts, selectedInvoice])

  const fetchInvoice = async (invoiceId) => {
    try {
      setLoading(true)
      const response = await api.get(`/purchase-invoice/${invoiceId}`)
      const invoiceData = response.data.purchaseInvoice
      
      if (!invoiceData) {
        toast.error('Invoice not found')
        navigate('/business/returns')
        return
      }

      setSelectedInvoice(invoiceData)
    } catch (error) {
      console.error('Error fetching invoice:', error)
      toast.error('Failed to fetch invoice')
      navigate('/business/returns')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectInvoice = async (invoice) => {
    // Refetch full invoice by ID to get productVariantId, productVariant, and availability
    try {
      setLoading(true)
      const response = await api.get(`/purchase-invoice/${invoice.id}`)
      const fullInvoice = response.data.purchaseInvoice
      if (!fullInvoice) {
        toast.error('Failed to load invoice details')
        return
      }
      setSelectedInvoice(fullInvoice)
      setSelectedProducts([])

      const productAvailability = fullInvoice.productAvailability || {}
      const variantAvailability = fullInvoice.variantAvailability || {}

      if (fullInvoice.purchaseItems && fullInvoice.purchaseItems.length > 0) {
        const products = fullInvoice.purchaseItems.map(item => {
          const available = item.productVariantId
            ? (variantAvailability[item.productVariantId] ?? item.quantity ?? 0)
            : (productAvailability[item.name] ?? item.quantity ?? 0)
          const avail = Math.max(0, available)
          return {
            id: item.id,
            name: item.name,
            purchasePrice: item.purchasePrice,
            quantity: item.quantity,
            sku: item.sku || null,
            productVariantId: item.productVariantId || null,
            color: item.productVariant?.color ?? item.color ?? null,
            size: item.productVariant?.size ?? item.size ?? null,
            availableQuantity: avail,
            maxQuantity: avail,
            quantity: 0,
            reason: ''
          }
        })
        setSelectedProducts(products)
      }
    } catch (err) {
      console.error('Error loading invoice details:', err)
      toast.error('Failed to load invoice details')
    } finally {
      setLoading(false)
    }
  }

  const handleProductQuantityChange = (productId, quantity) => {
    setSelectedProducts(prev => prev.map(p => {
      if (p.id === productId) {
        const qty = parseInt(quantity) || 0
        const maxQty = p.maxQuantity || 0
        return {
          ...p,
          quantity: Math.min(Math.max(0, qty), maxQty)
        }
      }
      return p
    }))
  }

  const handleProductReasonChange = (productId, reason) => {
    setSelectedProducts(prev => prev.map(p => 
      p.id === productId ? { ...p, reason } : p
    ))
  }

  const calculateTotal = () => {
    const total = selectedProducts
      .filter(p => p.quantity > 0)
      .reduce((sum, p) => sum + (p.purchasePrice * p.quantity), 0)
    setCalculatedTotal(total)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!selectedInvoice) {
      toast.error('Please select an invoice')
      return
    }

    const returnItems = selectedProducts
      .filter(p => p.quantity > 0)
      .map(p => ({
        productName: p.name,
        purchasePrice: p.purchasePrice,
        quantity: p.quantity,
        reason: p.reason || 'Supplier return',
        sku: p.sku || null,
        productVariantId: p.productVariantId || null,
        color: p.color || null,
        size: p.size || null
      }))

    if (returnItems.length === 0) {
      toast.error('Please select at least one product to return')
      return
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason for the return')
      return
    }

    if (returnHandlingMethod === 'REFUND' && !returnRefundAccountId) {
      toast.error('Please select a refund account')
      return
    }

    try {
      setSubmitting(true)

      const payload = {
        purchaseInvoiceId: selectedInvoice.id,
        returnDate,
        reason,
        notes: notes || null,
        totalAmount: calculatedTotal,
        returnItems,
        returnHandlingMethod,
        returnRefundAccountId: returnHandlingMethod === 'REFUND' ? returnRefundAccountId : null
      }

      const response = await api.post('/return', payload)

      if (response.data) {
        toast.success('Supplier return created successfully')
        navigate('/business/returns')
      }
    } catch (error) {
      console.error('Error creating supplier return:', error)
      const errorMessage = error.response?.data?.error || error.response?.data?.details || 'Failed to create supplier return'
      toast.error(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <ModernLayout>
        <LoadingSpinner />
      </ModernLayout>
    )
  }

  const selectedReturnItems = selectedProducts.filter(p => p.quantity > 0)

  return (
    <ModernLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/business/returns')}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900">Create Supplier Return</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Invoice</h2>
                <InvoiceSelector
                  onSelectInvoice={handleSelectInvoice}
                  selectedInvoiceId={selectedInvoice?.id}
                  supplierId={selectedInvoice?.supplierId}
                />
              </div>

              {selectedInvoice && (
                <>
                  <div className="border-t pt-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Return Details</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Return Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={returnDate}
                          onChange={(e) => setReturnDate(e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Reason <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          required
                          placeholder="e.g., Defective items, Wrong items"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Notes (Optional)
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder="Additional notes about the return..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Products to Return</h2>
                    
                    {selectedProducts.length === 0 ? (
                      <p className="text-gray-500">No products available for return</p>
                    ) : (
                      <div className="space-y-4">
                        {selectedProducts.map((product) => (
                          <div key={product.id} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h3 className="font-medium text-gray-900">{product.name}</h3>
                                {(product.color || product.size) && (
                                  <p className="text-sm text-gray-600 mt-0.5">
                                    Variant: {[product.color, product.size].filter(Boolean).join(' / ')}
                                  </p>
                                )}
                                <p className="text-sm text-gray-500">
                                  Price: Rs. {product.purchasePrice.toFixed(2)} •
                                  Available: {product.availableQuantity}
                                </p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Quantity
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  max={product.maxQuantity}
                                  value={product.quantity}
                                  onChange={(e) => handleProductQuantityChange(product.id, e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                {product.quantity > 0 && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Subtotal: Rs. {(product.purchasePrice * product.quantity).toFixed(2)}
                                  </p>
                                )}
                              </div>
                              
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Reason (Optional)
                                </label>
                                <input
                                  type="text"
                                  value={product.reason}
                                  onChange={(e) => handleProductReasonChange(product.id, e.target.value)}
                                  placeholder="Reason for this product"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedReturnItems.length > 0 && (
                    <>
                      <div className="border-t pt-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Return Handling</h2>
                        
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Handling Method <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={returnHandlingMethod}
                              onChange={(e) => {
                                setReturnHandlingMethod(e.target.value)
                                if (e.target.value === 'REDUCE_AP') {
                                  setReturnRefundAccountId('')
                                }
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="REDUCE_AP">Reduce Accounts Payable</option>
                              <option value="REFUND">Refund (Cash/Bank)</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                              {returnHandlingMethod === 'REDUCE_AP' 
                                ? 'Reduces the amount owed to the supplier'
                                : 'Refunds the amount from a cash or bank account'}
                            </p>
                          </div>

                          {returnHandlingMethod === 'REFUND' && (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Refund Account <span className="text-red-500">*</span>
                              </label>
                              <PaymentAccountSelector
                                value={returnRefundAccountId}
                                onChange={setReturnRefundAccountId}
                                placeholder="Select refund account"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="border-t pt-6">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <span className="text-lg font-semibold text-gray-900">Total Return Amount:</span>
                          <span className="text-2xl font-bold text-blue-600">Rs. {calculatedTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="flex items-center justify-end space-x-4 pt-6 border-t">
                <button
                  type="button"
                  onClick={() => navigate('/business/returns')}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedInvoice || selectedReturnItems.length === 0}
                  className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {submitting ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <CheckIcon className="h-5 w-5" />
                      <span>Create Return</span>
                    </>
                  )}
                </button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </ModernLayout>
  )
}

export default CreateStandaloneSupplierReturnPage

