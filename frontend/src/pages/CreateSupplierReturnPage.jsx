import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftIcon, CheckIcon, XMarkIcon, ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ModernLayout from '../components/ModernLayout'
import { Card, CardContent } from '../components/ui/Card'
import PaymentAccountSelector from '../components/accounting/PaymentAccountSelector'

const CreateSupplierReturnPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const purchaseInvoiceId = searchParams.get('purchaseInvoiceId')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [invoice, setInvoice] = useState(null)
  const [selectedProducts, setSelectedProducts] = useState([])
  const [reason, setReason] = useState('')
  const [calculatedRefund, setCalculatedRefund] = useState(0)
  const [existingReturns, setExistingReturns] = useState([])
  const [returnHandlingMethod, setReturnHandlingMethod] = useState('REDUCE_AP')
  const [returnRefundAccountId, setReturnRefundAccountId] = useState('')

  useEffect(() => {
    if (purchaseInvoiceId) {
      fetchInvoiceData()
    } else {
      toast.error('Purchase invoice ID is required')
      navigate('/business/purchases')
    }
  }, [purchaseInvoiceId])

  useEffect(() => {
    if (invoice) {
      calculateRefund()
      fetchExistingReturns()
    }
  }, [selectedProducts, invoice])

  const fetchInvoiceData = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/purchase-invoice/${purchaseInvoiceId}`)
      const invoiceData = response.data.purchaseInvoice
      
      if (!invoiceData) {
        toast.error('Invoice not found')
        navigate('/business/purchases')
        return
      }

      setInvoice(invoiceData)
    } catch (error) {
      console.error('Failed to fetch invoice data:', error)
      toast.error('Failed to load invoice')
      navigate('/business/purchases')
    } finally {
      setLoading(false)
    }
  }

  const fetchExistingReturns = async () => {
    if (!invoice) return
    
    try {
      const returnsRes = await api.get('/return', {
        params: { 
          returnType: 'SUPPLIER',
          purchaseInvoiceId: invoice.id
        }
      }).catch(() => ({ data: [] }))
      
      const activeReturns = (returnsRes.data || []).filter(
        r => r.status !== 'REJECTED' && r.purchaseInvoiceId === invoice.id
      )
      setExistingReturns(activeReturns)
    } catch (error) {
      console.error('Failed to fetch existing returns:', error)
    }
  }

  const calculateRefund = () => {
    if (!invoice || selectedProducts.length === 0) {
      setCalculatedRefund(0)
      return
    }

    const total = selectedProducts.reduce((sum, product) => {
      const quantity = product.returnQuantity || 1
      const price = product.purchasePrice || 0
      return sum + (price * quantity)
    }, 0)

    setCalculatedRefund(total)
  }

  const handleProductToggle = (product) => {
    const productId = product.id
    const isSelected = selectedProducts.some(p => p.id === productId)

    if (isSelected) {
      setSelectedProducts(selectedProducts.filter(p => p.id !== productId))
    } else {
      // Add product with initial return quantity of 1
      setSelectedProducts([...selectedProducts, {
        ...product,
        returnQuantity: 1
      }])
    }
  }

  const handleQuantityChange = (productId, quantity) => {
    if (quantity < 1) return
    
    setSelectedProducts(selectedProducts.map(p => {
      if (p.id === productId) {
        // Ensure quantity doesn't exceed available quantity
        const maxQuantity = p.quantity || 1
        return {
          ...p,
          returnQuantity: Math.min(parseInt(quantity), maxQuantity)
        }
      }
      return p
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (selectedProducts.length === 0) {
      toast.error('Please select at least one product to return')
      return
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason for the return')
      return
    }

    // Validate return handling method
    if (!returnHandlingMethod) {
      toast.error('Please select a return handling method')
      return
    }

    if (returnHandlingMethod === 'REFUND' && !returnRefundAccountId) {
      toast.error('Please select a refund account for returns')
      return
    }

    // Validate quantities
    for (const product of selectedProducts) {
      if (!product.returnQuantity || product.returnQuantity < 1) {
        toast.error(`Please enter a valid quantity for ${product.name}`)
        return
      }
      if (product.returnQuantity > (product.quantity || 0)) {
        toast.error(`Return quantity for ${product.name} cannot exceed purchased quantity`)
        return
      }
    }

    setSubmitting(true)
    try {
      // Format return items for purchase invoice edit endpoint
      const returnItems = selectedProducts.map(product => ({
        productName: product.name,
        name: product.name,
        description: product.description || null,
        purchasePrice: product.purchasePrice,
        quantity: product.returnQuantity,
        reason: reason.trim(),
        sku: product.sku || null,
        category: product.category || null,
        productVariantId: product.productVariantId || null,
        color: product.color ?? product.productVariant?.color ?? null,
        size: product.size ?? product.productVariant?.size ?? null
      }))

      // Calculate purchase total from existing invoice items
      const purchaseItems = invoice.purchaseItems || []
      const purchaseTotal = purchaseItems.reduce((sum, item) => {
        return sum + (parseFloat(item.purchasePrice || 0) * parseInt(item.quantity || 0))
      }, 0)

      // Calculate return total
      const returnTotal = calculatedRefund

      // Calculate new net amount (purchase total - return total)
      const newNetAmount = purchaseTotal - returnTotal

      // Validate that return total doesn't exceed purchase total
      if (newNetAmount < 0) {
        toast.error(`Return total (Rs. ${returnTotal.toFixed(2)}) cannot exceed purchase total (Rs. ${purchaseTotal.toFixed(2)})`)
        setSubmitting(false)
        return
      }

      // Use purchase invoice edit endpoint to add returns
      // This ensures all accounting, stock, and supplier impacts are handled
      // We need to send existing products to satisfy backend validation
      const existingProducts = purchaseItems.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        purchasePrice: item.purchasePrice,
        sku: item.sku || null,
        category: item.category || null,
        description: item.description || null
      }))

      const payload = {
        totalAmount: newNetAmount, // Update total amount (net of returns)
        products: existingProducts, // Send existing products to satisfy validation
        returnItems: returnItems,
        returnHandlingMethod: returnHandlingMethod,
        returnRefundAccountId: returnHandlingMethod === 'REFUND' ? returnRefundAccountId : undefined
      }

      const response = await api.put(`/purchase-invoice/${purchaseInvoiceId}/with-products`, payload)

      if (response.data?.success) {
        toast.success(`Supplier return created successfully!`)
        navigate(`/business/purchases/${purchaseInvoiceId}`)
      } else {
        toast.error('Failed to create supplier return')
      }
    } catch (error) {
      console.error('Error creating supplier return:', error)
      console.error('Error response:', error.response?.data)
      const errorDetails = error.response?.data?.details || error.response?.data?.error || error.response?.data?.message
      const errorMessage = Array.isArray(errorDetails) 
        ? errorDetails.map(e => e.msg || e).join(', ')
        : (errorDetails || 'Failed to create supplier return')
      toast.error(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <ModernLayout>
        <LoadingSpinner className="min-h-screen" />
      </ModernLayout>
    )
  }

  if (!invoice) {
    return null
  }

  const purchaseItems = invoice.purchaseItems || []
  const totalReturned = existingReturns.reduce((sum, ret) => {
    return sum + (ret.returnItems?.reduce((itemSum, item) => itemSum + item.quantity, 0) || 0)
  }, 0)

  return (
    <ModernLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(`/business/purchases/${purchaseInvoiceId}`)}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-brand-600">Create Supplier Return</h1>
            <p className="text-gray-500 mt-1">Return products to supplier</p>
          </div>
        </div>

        {/* Invoice Info */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500">Invoice Number</p>
                <p className="font-semibold text-gray-900">{invoice.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Supplier</p>
                <p className="font-semibold text-gray-900">{invoice.supplierName || invoice.supplier?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Invoice Date</p>
                <p className="font-semibold text-gray-900">
                  {new Date(invoice.invoiceDate).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Amount</p>
                <p className="font-semibold text-gray-900">Rs. {invoice.totalAmount?.toFixed(2) || '0.00'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Existing Returns Warning */}
        {existingReturns.length > 0 && (
          <Card className="mb-6 border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <div className="flex items-start">
                <XMarkIcon className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-900 mb-1">
                    Existing Returns Found
                  </h3>
                  <p className="text-sm text-yellow-800 mb-2">
                    This invoice already has {existingReturns.length} return(s):
                  </p>
                  <ul className="text-sm text-yellow-800 space-y-1">
                    {existingReturns.map(ret => (
                      <li key={ret.id}>
                        • {ret.returnNumber} - {ret.status} - Rs. {ret.totalAmount?.toFixed(2) || '0.00'}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* Product Selection */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Products to Return</h2>
                
                {purchaseItems.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No products found in this invoice</p>
                ) : (
                  <div className="space-y-3">
                    {purchaseItems.map((product) => {
                      const isSelected = selectedProducts.some(p => p.id === product.id)
                      const selectedProduct = selectedProducts.find(p => p.id === product.id)
                      const alreadyReturned = existingReturns.reduce((sum, ret) => {
                        const item = ret.returnItems?.find(ri =>
                          product.productVariantId
                            ? ri.productVariantId === product.productVariantId
                            : ri.productName === product.name
                        )
                        return sum + (item?.quantity || 0)
                      }, 0)
                      const availableQuantity = (product.quantity || 0) - alreadyReturned

                      return (
                        <div
                          key={product.id}
                          className={`border rounded-lg p-4 ${
                            isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3 flex-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleProductToggle(product)}
                                disabled={availableQuantity <= 0}
                                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                              <div className="flex-1">
                                <h3 className="font-medium text-gray-900">{product.name}</h3>
                                {(product.productVariant?.color || product.productVariant?.size) && (
                                  <p className="text-sm text-gray-600 mt-0.5">
                                    Variant: {[product.productVariant?.color, product.productVariant?.size].filter(Boolean).join(' / ')}
                                  </p>
                                )}
                                {product.description && (
                                  <p className="text-sm text-gray-600 mt-1">{product.description}</p>
                                )}
                                <div className="flex items-center space-x-4 mt-2 text-sm">
                                  <span className="text-gray-600">
                                    Price: <span className="font-semibold">Rs. {product.purchasePrice?.toFixed(2) || '0.00'}</span>
                                  </span>
                                  <span className="text-gray-600">
                                    Purchased: <span className="font-semibold">{product.quantity || 0}</span>
                                  </span>
                                  {alreadyReturned > 0 && (
                                    <span className="text-orange-600">
                                      Already Returned: <span className="font-semibold">{alreadyReturned}</span>
                                    </span>
                                  )}
                                  <span className="text-gray-600">
                                    Available: <span className="font-semibold">{availableQuantity}</span>
                                  </span>
                                  {product.sku && (
                                    <span className="text-gray-500">SKU: {product.sku}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="ml-4">
                                <label className="block text-xs text-gray-600 mb-1">Return Qty</label>
                                <input
                                  type="number"
                                  min="1"
                                  max={availableQuantity}
                                  value={selectedProduct?.returnQuantity || 1}
                                  onChange={(e) => handleQuantityChange(product.id, e.target.value)}
                                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">Max: {availableQuantity}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Return Details */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Return Details</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reason <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      Return date will be set to the invoice date ({new Date(invoice.invoiceDate).toLocaleDateString()})
                    </p>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Enter reason for return..."
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>

                  {/* Return Handling Method */}
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Return Handling Method <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="returnHandlingMethod"
                          value="REDUCE_AP"
                          checked={returnHandlingMethod === 'REDUCE_AP'}
                          onChange={(e) => {
                            setReturnHandlingMethod(e.target.value)
                            setReturnRefundAccountId('')
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-700">Reduce Accounts Payable (deducts from what we owe supplier)</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="returnHandlingMethod"
                          value="REFUND"
                          checked={returnHandlingMethod === 'REFUND'}
                          onChange={(e) => setReturnHandlingMethod(e.target.value)}
                          className="mr-2"
                        />
                        <span className="text-sm text-gray-700">Refund to Account (supplier refunds money)</span>
                      </label>
                    </div>
                    {returnHandlingMethod === 'REFUND' && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Refund Account <span className="text-red-500">*</span>
                        </label>
                        <PaymentAccountSelector
                          value={returnRefundAccountId}
                          onChange={(accountId) => setReturnRefundAccountId(accountId)}
                          showQuickAdd={true}
                          required={true}
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Total Return Amount</span>
                      <span className="text-2xl font-bold text-brand-600">
                        Rs. {calculatedRefund.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => navigate(`/business/purchases/${purchaseInvoiceId}`)}
                className="btn-secondary px-6 py-2.5 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || selectedProducts.length === 0}
                className="btn-primary px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center"
              >
                {submitting ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Creating Return...
                  </>
                ) : (
                  <>
                    <ArrowLeftOnRectangleIcon className="h-5 w-5 mr-2" />
                    Create Supplier Return
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </ModernLayout>
  )
}

export default CreateSupplierReturnPage

