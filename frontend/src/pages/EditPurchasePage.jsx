import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { ArrowLeftIcon, PlusIcon, TrashIcon, CurrencyDollarIcon, PencilIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'
import { useTenant } from '../hooks'
import PaymentAccountSelector from '../components/accounting/PaymentAccountSelector'

const EditPurchasePage = () => {
  const navigate = useNavigate()
  const { invoiceId } = useParams()
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [newCategoryInputs, setNewCategoryInputs] = useState({})
  const [invoice, setInvoice] = useState(null)
  const [payments, setPayments] = useState([])
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [paymentFormData, setPaymentFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    paymentMethod: 'Cash'
  })
  const [processingPayment, setProcessingPayment] = useState(false)
  const [returnHandlingMethod, setReturnHandlingMethod] = useState('REDUCE_AP')
  const [returnRefundAccountId, setReturnRefundAccountId] = useState('')
  // Product autocomplete state - store suggestions per field
  const [productSuggestions, setProductSuggestions] = useState({})
  const [showProductSuggestions, setShowProductSuggestions] = useState({})
  const [productSearchTimeouts, setProductSearchTimeouts] = useState({})
  const [lastSearchQueries, setLastSearchQueries] = useState({}) // Track last search to prevent duplicates
  
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
    setValue,
    reset
  } = useForm({
    defaultValues: {
      invoiceNumber: '',
      supplierName: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      totalAmount: 0,
      notes: '',
      items: [{ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '' }],
      returnItems: []
    }
  })

  // Fetch existing categories from products
  useEffect(() => {
    const fetchCategories = async () => {
      if (!tenant?.id) return
      
      try {
        setLoadingCategories(true)
        const response = await api.get(`/products/tenant/${tenant.id}`)
        const products = response.data.products || []
        const uniqueCategories = [...new Set(products.map(p => p.category).filter(Boolean))]
        setCategories(uniqueCategories.sort())
      } catch (error) {
        console.error('Failed to fetch categories:', error)
      } finally {
        setLoadingCategories(false)
      }
    }

    fetchCategories()
  }, [tenant])

  // Fetch invoice data
  useEffect(() => {
    const fetchInvoice = async () => {
      if (!invoiceId) return
      
      try {
        setLoading(true)
        const response = await api.get(`/purchase-invoice/${invoiceId}`)
        const invoice = response.data.purchaseInvoice
        
        if (!invoice) {
          toast.error('Invoice not found')
          navigate('/business/purchases')
          return
        }

        // Store invoice data
        setInvoice(invoice)
        
        // Store payments - prefer payments linked to invoice, fall back to supplier payments (legacy)
        if (invoice.payments && Array.isArray(invoice.payments) && invoice.payments.length > 0) {
          setPayments(invoice.payments)
        } else if (invoice.supplier?.payments) {
          setPayments(invoice.supplier.payments)
        } else {
          setPayments([])
        }

        // Extract return items from invoice
        const returnItems = invoice.returns && invoice.returns.length > 0
          ? invoice.returns.flatMap(ret => ret.returnItems.map(ri => ({
              id: ri.id,
              name: ri.productName || '',
              productName: ri.productName || '',
              quantity: ri.quantity || 1,
              purchasePrice: ri.purchasePrice || 0,
              sku: ri.sku || '',
              category: '',
              description: ri.description || '',
              reason: ri.reason || 'Purchase invoice return'
            })))
          : []

        // Set return handling method and refund account from response
        if (response.data.returnHandlingMethod) {
          setReturnHandlingMethod(response.data.returnHandlingMethod)
        }
        if (response.data.returnRefundAccountId) {
          setReturnRefundAccountId(response.data.returnRefundAccountId)
        }

        // Pre-fill form with invoice data
        reset({
          invoiceNumber: invoice.invoiceNumber || '',
          supplierName: invoice.supplierName || '',
          invoiceDate: invoice.invoiceDate ? new Date(invoice.invoiceDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          totalAmount: invoice.totalAmount || 0,
          notes: invoice.notes || '',
          items: invoice.purchaseItems && invoice.purchaseItems.length > 0
            ? invoice.purchaseItems.map(item => ({
                id: item.id,
                name: item.name || '',
                quantity: item.quantity || 1,
                purchasePrice: item.purchasePrice || 0,
                sku: item.sku || '',
                category: item.category || '',
                description: item.description || ''
              }))
            : [{ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '' }],
          returnItems: returnItems
        })
      } catch (error) {
        console.error('Failed to fetch invoice:', error)
        toast.error('Failed to load invoice')
        navigate('/business/purchases')
      } finally {
        setLoading(false)
      }
    }

    fetchInvoice()
  }, [invoiceId, navigate, reset])

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items'
  })

  const { fields: returnFields, append: appendReturn, remove: removeReturn } = useFieldArray({
    control,
    name: 'returnItems'
  })

  const watchedItems = watch('items')
  const watchedReturnItems = watch('returnItems')

  // Calculate total amount from items (purchases - returns)
  const calculateTotal = () => {
    const purchaseTotal = watchedItems.reduce((sum, item) => {
      const quantity = parseFloat(item?.quantity) || 0
      const price = parseFloat(item?.purchasePrice) || 0
      return sum + (quantity * price)
    }, 0)
    
    const returnTotal = (watchedReturnItems || []).reduce((sum, item) => {
      const quantity = parseFloat(item?.quantity) || 0
      const price = parseFloat(item?.purchasePrice) || 0
      return sum + (quantity * price)
    }, 0)
    
    const netTotal = purchaseTotal - returnTotal
    setValue('totalAmount', Math.max(0, netTotal).toFixed(2))
    return { purchaseTotal, returnTotal, netTotal }
  }

  // Update total when items or return items change
  useEffect(() => {
    calculateTotal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedItems, watchedReturnItems])

  const addItem = () => {
    append({ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '' })
  }

  const removeItem = (index) => {
    if (fields.length > 1) {
      remove(index)
      setTimeout(() => calculateTotal(), 100)
    } else {
      toast.error('At least one item is required')
    }
  }

  const calculateRemainingBalance = () => {
    if (!invoice) return 0
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0)
    return invoice.totalAmount - totalPaid
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
      const response = await api.get(`/purchase-invoice/${invoiceId}`)
      const updatedInvoice = response.data.purchaseInvoice
      setInvoice(updatedInvoice)
      // Prefer payments linked to invoice, fall back to supplier payments (legacy)
      if (updatedInvoice.payments && Array.isArray(updatedInvoice.payments) && updatedInvoice.payments.length > 0) {
        setPayments(updatedInvoice.payments)
      } else if (updatedInvoice.supplier?.payments) {
        setPayments(updatedInvoice.supplier.payments)
      } else {
        setPayments([])
      }
    } catch (error) {
      console.error('Error recording payment:', error)
      const errorMessage = error.response?.data?.error?.message || 'Failed to record payment'
      toast.error(errorMessage)
    } finally {
      setProcessingPayment(false)
    }
  }

  const onSubmit = async (data) => {
    // Validate items
    const validItems = data.items.filter(item => 
      item.name && item.name.trim() && 
      item.quantity > 0 && 
      item.purchasePrice >= 0
    )

    if (validItems.length === 0) {
      toast.error('Please add at least one valid product')
      return
    }

    // Validate return items
    const validReturnItems = (data.returnItems || []).filter(item => 
      item.name?.trim() && 
      parseFloat(item.quantity) > 0 && 
      parseFloat(item.purchasePrice) >= 0
    )

    // Calculate totals
    const totals = calculateTotal()
    const purchaseTotal = totals.purchaseTotal
    const returnTotal = totals.returnTotal
    const netTotal = totals.netTotal

    // Validate net amount
    if (returnTotal > purchaseTotal) {
      toast.error(`Return total (Rs. ${returnTotal.toFixed(2)}) cannot exceed purchase total (Rs. ${purchaseTotal.toFixed(2)})`)
      return
    }

    // Validate return handling method if return items exist
    if (validReturnItems.length > 0) {
      if (!returnHandlingMethod) {
        toast.error('Please select a return handling method')
        return
      }
      
      if (returnHandlingMethod === 'REFUND' && !returnRefundAccountId) {
        toast.error('Please select a refund account for returns')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const payload = {
        invoiceNumber: data.invoiceNumber?.trim() || undefined,
        supplierName: data.supplierName || null,
        invoiceDate: data.invoiceDate,
        totalAmount: netTotal, // Net amount (purchases - returns)
        notes: data.notes || null,
        products: validItems.map(item => {
          // Use newCategory if it exists, otherwise use category
          const categoryValue = item.newCategory?.trim() 
            ? item.newCategory.trim() 
            : (item.category?.trim() || null)
          
          return {
            id: item.id, // Include id for existing items
            name: item.name.trim(),
            quantity: parseInt(item.quantity),
            purchasePrice: parseFloat(item.purchasePrice),
            sku: item.sku?.trim() || null,
            category: categoryValue,
            description: item.description?.trim() || null
          }
        }),
        returnItems: validReturnItems.length > 0 ? validReturnItems.map(item => ({
          id: item.id, // Include id for existing return items
          name: item.name.trim(),
          productName: item.name.trim(),
          quantity: parseInt(item.quantity),
          purchasePrice: parseFloat(item.purchasePrice),
          sku: item.sku?.trim() || null,
          category: item.category?.trim() || null,
          description: item.description?.trim() || null,
          reason: item.reason || 'Purchase invoice return'
        })) : [],
        returnHandlingMethod: validReturnItems.length > 0 ? returnHandlingMethod : undefined,
        returnRefundAccountId: validReturnItems.length > 0 && returnHandlingMethod === 'REFUND' ? returnRefundAccountId : undefined
      }

      await api.put(`/purchase-invoice/${invoiceId}/with-products`, payload)
      toast.success('Purchase invoice updated successfully!')
      navigate('/business/purchases')
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to update purchase invoice'
      toast.error(errorMessage)
      console.error('Update purchase invoice error:', error)
    } finally {
      setIsSubmitting(false)
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

  return (
    <ModernLayout>
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/business/purchases')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Back to Purchases
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Edit Purchase Invoice</h1>
          <p className="text-gray-600 mt-2">Update invoice details and products</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Invoice Details Section */}
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Invoice Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="form-group">
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Invoice Number *
                </label>
                <input
                  {...register('invoiceNumber', { required: 'Invoice number is required' })}
                  className="input-field bg-white text-gray-900 border-2"
                  placeholder="Enter invoice number"
                />
                {errors.invoiceNumber && (
                  <p className="text-red-500 text-xs mt-1">{errors.invoiceNumber.message}</p>
                )}
              </div>

              <div className="form-group">
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Supplier Name
                </label>
                <input
                  {...register('supplierName')}
                  className="input-field bg-white text-gray-900 border-2"
                  placeholder="Enter supplier name"
                />
              </div>

              <div className="form-group">
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Invoice Date *
                </label>
                <input
                  {...register('invoiceDate', { required: 'Invoice date is required' })}
                  type="date"
                  className="input-field bg-white text-gray-900 border-2"
                />
                {errors.invoiceDate && (
                  <p className="text-red-500 text-xs mt-1">{errors.invoiceDate.message}</p>
                )}
              </div>

              <div className="form-group">
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Net Amount (Rs.) *
                </label>
                <input
                  {...register('totalAmount', { 
                    required: 'Total amount is required',
                    min: { value: 0, message: 'Amount must be positive' }
                  })}
                  type="number"
                  step="0.01"
                  min="0"
                  className="input-field bg-white text-gray-900 border-2"
                  placeholder="0.00"
                  readOnly
                />
                {errors.totalAmount && (
                  <p className="text-red-500 text-xs mt-1">{errors.totalAmount.message}</p>
                )}
                {(() => {
                  const totals = calculateTotal()
                  return (
                    <div className="text-xs text-gray-600 mt-1 space-y-1">
                      <p>Purchase Total: Rs. {totals.purchaseTotal.toFixed(2)}</p>
                      {totals.returnTotal > 0 && (
                        <p className="text-red-600">Return Total: -Rs. {totals.returnTotal.toFixed(2)}</p>
                      )}
                      <p className="font-semibold">Net Amount: Rs. {totals.netTotal.toFixed(2)}</p>
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="form-group mt-6">
              <label className="block text-sm font-bold text-gray-900 mb-2">
                Notes
              </label>
              <textarea
                {...register('notes')}
                className="input-field bg-white text-gray-900 border-2"
                rows={3}
                placeholder="Enter additional notes"
              />
            </div>
          </div>

          {/* Products Section */}
          <div className="card p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Products</h2>
              <button
                type="button"
                onClick={addItem}
                className="btn-primary flex items-center text-sm"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Add Product
              </button>
            </div>

            <div className="space-y-4">
              {fields.map((field, index) => {
                const itemErrors = errors.items?.[index]
                const item = watchedItems[index]
                const itemTotal = (parseFloat(item?.quantity) || 0) * (parseFloat(item?.purchasePrice) || 0)

                return (
                  <div key={field.id} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-center mb-3">
                      <h5 className="font-semibold text-gray-900">Product {index + 1}</h5>
                      {fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="form-group relative">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Product Name *
                        </label>
                        <input
                          {...register(`items.${index}.name`, { 
                            required: 'Product name is required',
                            onChange: (e) => {
                              const productName = e.target.value.trim()
                              const fieldKey = `items.${index}`
                              
                              // Clear previous timeout
                              if (productSearchTimeouts[fieldKey]) {
                                clearTimeout(productSearchTimeouts[fieldKey])
                                delete productSearchTimeouts[fieldKey]
                              }
                              
                              // Update total calculation
                              setTimeout(() => calculateTotal(), 100)
                              
                              if (productName.length >= 2) {
                                // Check if we already have results for this query
                                const lastQuery = lastSearchQueries[fieldKey]
                                if (lastQuery === productName && productSuggestions[fieldKey]?.length > 0) {
                                  // Already searched for this, just show suggestions
                                  setShowProductSuggestions(prev => ({
                                    ...prev,
                                    [fieldKey]: true
                                  }))
                                  return
                                }
                                
                                // Debounce search - wait 500ms after user stops typing
                                const timeout = setTimeout(async () => {
                                  // Double-check query hasn't changed
                                  const currentValue = watch(`items.${index}.name`)?.trim()
                                  if (currentValue !== productName) {
                                    return // Query changed, ignore this result
                                  }
                                  
                                  try {
                                    const response = await api.get(`/products/search/${encodeURIComponent(productName)}`)
                                    if (response.data.success) {
                                      setLastSearchQueries(prev => ({
                                        ...prev,
                                        [fieldKey]: productName
                                      }))
                                      setProductSuggestions(prev => ({
                                        ...prev,
                                        [fieldKey]: response.data.products || []
                                      }))
                                      setShowProductSuggestions(prev => ({
                                        ...prev,
                                        [fieldKey]: true
                                      }))
                                    }
                                  } catch (error) {
                                    // Silently fail - don't spam console
                                    if (error.code !== 'ERR_CANCELED' && error.code !== 'ERR_INSUFFICIENT_RESOURCES') {
                                      console.error('Error searching products:', error)
                                    }
                                    setProductSuggestions(prev => ({
                                      ...prev,
                                      [fieldKey]: []
                                    }))
                                  }
                                }, 500)
                                setProductSearchTimeouts(prev => ({
                                  ...prev,
                                  [fieldKey]: timeout
                                }))
                              } else {
                                setProductSuggestions(prev => {
                                  const newState = { ...prev }
                                  delete newState[fieldKey]
                                  return newState
                                })
                                setShowProductSuggestions(prev => {
                                  const newState = { ...prev }
                                  delete newState[fieldKey]
                                  return newState
                                })
                                setLastSearchQueries(prev => {
                                  const newState = { ...prev }
                                  delete newState[fieldKey]
                                  return newState
                                })
                              }
                            }
                          })}
                          className="input-field bg-white text-gray-900 border-2"
                          placeholder="Type to search products..."
                          autoComplete="off"
                          onFocus={() => {
                            const productName = watch(`items.${index}.name`)?.trim()
                            const fieldKey = `items.${index}`
                            if (productName && productName.length >= 2 && productSuggestions[fieldKey]?.length > 0) {
                              setShowProductSuggestions(prev => ({
                                ...prev,
                                [fieldKey]: true
                              }))
                            }
                          }}
                          onBlur={() => {
                            const fieldKey = `items.${index}`
                            // Delay hiding suggestions to allow click on suggestion
                            setTimeout(() => {
                              setShowProductSuggestions(prev => ({
                                ...prev,
                                [fieldKey]: false
                              }))
                            }, 200)
                          }}
                        />
                        {/* Product Autocomplete Dropdown */}
                        {showProductSuggestions[`items.${index}`] && productSuggestions[`items.${index}`]?.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                            {productSuggestions[`items.${index}`].map((product) => (
                              <div
                                key={product.id}
                                className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                onClick={() => {
                                  setValue(`items.${index}.name`, product.name)
                                  if (product.lastPurchasePrice) {
                                    setValue(`items.${index}.purchasePrice`, product.lastPurchasePrice)
                                  }
                                  if (product.category) {
                                    setValue(`items.${index}.category`, product.category)
                                  }
                                  if (product.sku) {
                                    setValue(`items.${index}.sku`, product.sku)
                                  }
                                  if (product.description) {
                                    setValue(`items.${index}.description`, product.description)
                                  }
                                  setShowProductSuggestions(prev => ({
                                    ...prev,
                                    [`items.${index}`]: false
                                  }))
                                  setTimeout(() => calculateTotal(), 100)
                                }}
                              >
                                <div className="font-medium text-gray-900">{product.name}</div>
                                {product.category && (
                                  <div className="text-xs text-gray-500">Category: {product.category}</div>
                                )}
                                {product.lastPurchasePrice && (
                                  <div className="text-xs text-gray-500">Last Price: Rs. {product.lastPurchasePrice.toFixed(2)}</div>
                                )}
                                {product.currentQuantity !== undefined && (
                                  <div className="text-xs text-gray-500">Stock: {product.currentQuantity}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {itemErrors?.name && (
                          <p className="text-red-500 text-xs mt-1">{itemErrors.name.message}</p>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Quantity *
                        </label>
                        <input
                          {...register(`items.${index}.quantity`, { 
                            required: 'Quantity is required',
                            min: { value: 1, message: 'Quantity must be at least 1' },
                            onChange: () => setTimeout(() => calculateTotal(), 100)
                          })}
                          type="number"
                          min="1"
                          step="1"
                          className="input-field bg-white text-gray-900 border-2"
                          placeholder="1"
                          onFocus={(e) => {
                            if (e.target.value === '0' || e.target.value === '') {
                              e.target.select()
                            }
                          }}
                        />
                        {itemErrors?.quantity && (
                          <p className="text-red-500 text-xs mt-1">{itemErrors.quantity.message}</p>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Purchase Price (Rs.) *
                        </label>
                        <input
                          {...register(`items.${index}.purchasePrice`, { 
                            required: 'Purchase price is required',
                            min: { value: 0, message: 'Price must be positive' },
                            onChange: () => setTimeout(() => calculateTotal(), 100)
                          })}
                          type="number"
                          step="0.01"
                          min="0"
                          className="input-field bg-white text-gray-900 border-2"
                          placeholder="0.00"
                          onFocus={(e) => {
                            if (e.target.value === '0' || e.target.value === '') {
                              e.target.select()
                            }
                          }}
                        />
                        {itemErrors?.purchasePrice && (
                          <p className="text-red-500 text-xs mt-1">{itemErrors.purchasePrice.message}</p>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          SKU
                        </label>
                        <input
                          {...register(`items.${index}.sku`)}
                          className="input-field bg-white text-gray-900 border-2"
                          placeholder="Enter SKU (optional)"
                        />
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Category
                        </label>
                        {loadingCategories ? (
                          <div className="w-full px-3 py-2 bg-gray-50 text-gray-500 border-2 border-gray-300 rounded-lg flex items-center">
                            <LoadingSpinner size="sm" />
                            <span className="ml-2 text-xs">Loading...</span>
                          </div>
                        ) : (
                          <>
                            <select
                              {...register(`items.${index}.category`)}
                              onChange={(e) => {
                                const value = e.target.value
                                register(`items.${index}.category`).onChange(e)
                                if (value === '__new__') {
                                  setNewCategoryInputs(prev => ({ ...prev, [index]: true }))
                                  setValue(`items.${index}.category`, '')
                                } else {
                                  setNewCategoryInputs(prev => {
                                    const updated = { ...prev }
                                    delete updated[index]
                                    return updated
                                  })
                                  setValue(`items.${index}.newCategory`, '')
                                }
                              }}
                              className="input-field bg-white text-gray-900 border-2"
                            >
                              <option value="" className="text-gray-900 bg-white">Select a category (optional)</option>
                              {categories.map(category => (
                                <option key={category} value={category} className="text-gray-900 bg-white">
                                  {category}
                                </option>
                              ))}
                              <option value="__new__" className="text-gray-900 bg-white">+ Add New Category</option>
                            </select>
                            {newCategoryInputs[index] && (
                              <input
                                {...register(`items.${index}.newCategory`)}
                                className="input-field bg-white text-gray-900 border-2 mt-2"
                                placeholder="Enter new category name"
                                autoFocus
                              />
                            )}
                          </>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Item Total (Rs.)
                        </label>
                        <input
                          type="text"
                          value={itemTotal.toFixed(2)}
                          className="input-field bg-gray-100 text-gray-900 border-2"
                          readOnly
                        />
                      </div>
                    </div>

                    <div className="form-group mt-4">
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Description
                      </label>
                      <textarea
                        {...register(`items.${index}.description`)}
                        className="input-field bg-white text-gray-900 border-2"
                        rows={2}
                        placeholder="Enter product description (optional)"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Return Items Section */}
          <div className="card p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Return Items</h2>
              <button
                type="button"
                onClick={() => appendReturn({ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '', reason: 'Purchase invoice return' })}
                className="btn-secondary flex items-center text-sm"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Add Return Item
              </button>
            </div>

            {/* Return Handling Method */}
            {returnFields.length > 0 && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
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
            )}

            <div className="space-y-4">
              {returnFields.map((field, index) => {
                const returnItemErrors = errors.returnItems?.[index]
                const returnItem = watchedReturnItems?.[index]
                const returnItemTotal = (parseFloat(returnItem?.quantity) || 0) * (parseFloat(returnItem?.purchasePrice) || 0)

                return (
                  <div key={field.id} className="border rounded-lg p-4 bg-red-50 border-red-200">
                    <div className="flex justify-between items-center mb-3">
                      <h5 className="font-semibold text-red-900">Return Item {index + 1}</h5>
                      <button
                        type="button"
                        onClick={() => removeReturn(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="form-group relative">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Product Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          {...register(`returnItems.${index}.name`, { 
                            required: 'Product name is required',
                            onChange: (e) => {
                              const productName = e.target.value.trim()
                              const fieldKey = `returnItems.${index}`
                              
                              // Clear previous timeout
                              if (productSearchTimeouts[fieldKey]) {
                                clearTimeout(productSearchTimeouts[fieldKey])
                                delete productSearchTimeouts[fieldKey]
                              }
                              
                              // Update total calculation
                              setTimeout(() => calculateTotal(), 100)
                              
                              if (productName.length >= 2) {
                                // Check if we already have results for this query
                                const lastQuery = lastSearchQueries[fieldKey]
                                if (lastQuery === productName && productSuggestions[fieldKey]?.length > 0) {
                                  // Already searched for this, just show suggestions
                                  setShowProductSuggestions(prev => ({
                                    ...prev,
                                    [fieldKey]: true
                                  }))
                                  return
                                }
                                
                                // Debounce search - wait 500ms after user stops typing
                                const timeout = setTimeout(async () => {
                                  // Double-check query hasn't changed
                                  const currentValue = watch(`items.${index}.name`)?.trim()
                                  if (currentValue !== productName) {
                                    return // Query changed, ignore this result
                                  }
                                  
                                  try {
                                    const response = await api.get(`/products/search/${encodeURIComponent(productName)}`)
                                    if (response.data.success) {
                                      setLastSearchQueries(prev => ({
                                        ...prev,
                                        [fieldKey]: productName
                                      }))
                                      setProductSuggestions(prev => ({
                                        ...prev,
                                        [fieldKey]: response.data.products || []
                                      }))
                                      setShowProductSuggestions(prev => ({
                                        ...prev,
                                        [fieldKey]: true
                                      }))
                                    }
                                  } catch (error) {
                                    // Silently fail - don't spam console
                                    if (error.code !== 'ERR_CANCELED' && error.code !== 'ERR_INSUFFICIENT_RESOURCES') {
                                      console.error('Error searching products:', error)
                                    }
                                    setProductSuggestions(prev => ({
                                      ...prev,
                                      [fieldKey]: []
                                    }))
                                  }
                                }, 500)
                                setProductSearchTimeouts(prev => ({
                                  ...prev,
                                  [fieldKey]: timeout
                                }))
                              } else {
                                setProductSuggestions(prev => {
                                  const newState = { ...prev }
                                  delete newState[fieldKey]
                                  return newState
                                })
                                setShowProductSuggestions(prev => {
                                  const newState = { ...prev }
                                  delete newState[fieldKey]
                                  return newState
                                })
                                setLastSearchQueries(prev => {
                                  const newState = { ...prev }
                                  delete newState[fieldKey]
                                  return newState
                                })
                              }
                            }
                          })}
                          className={`input-field bg-white text-gray-900 border-2 ${
                            returnItemErrors?.name ? 'border-red-300' : ''
                          }`}
                          placeholder="Type to search products..."
                          autoComplete="off"
                          onFocus={() => {
                            const productName = watch(`returnItems.${index}.name`)?.trim()
                            const fieldKey = `returnItems.${index}`
                            if (productName && productName.length >= 2 && productSuggestions[fieldKey]?.length > 0) {
                              setShowProductSuggestions(prev => ({
                                ...prev,
                                [fieldKey]: true
                              }))
                            }
                          }}
                          onBlur={() => {
                            const fieldKey = `returnItems.${index}`
                            // Delay hiding suggestions to allow click on suggestion
                            setTimeout(() => {
                              setShowProductSuggestions(prev => ({
                                ...prev,
                                [fieldKey]: false
                              }))
                            }, 200)
                          }}
                        />
                        {/* Product Autocomplete Dropdown */}
                        {showProductSuggestions[`returnItems.${index}`] && productSuggestions[`returnItems.${index}`]?.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                            {productSuggestions[`returnItems.${index}`].map((product) => (
                              <div
                                key={product.id}
                                className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                onClick={() => {
                                  setValue(`returnItems.${index}.name`, product.name)
                                  if (product.lastPurchasePrice) {
                                    setValue(`returnItems.${index}.purchasePrice`, product.lastPurchasePrice)
                                  }
                                  if (product.category) {
                                    setValue(`returnItems.${index}.category`, product.category)
                                  }
                                  if (product.sku) {
                                    setValue(`returnItems.${index}.sku`, product.sku)
                                  }
                                  if (product.description) {
                                    setValue(`returnItems.${index}.description`, product.description)
                                  }
                                  setShowProductSuggestions(prev => ({
                                    ...prev,
                                    [`returnItems.${index}`]: false
                                  }))
                                  setTimeout(() => calculateTotal(), 100)
                                }}
                              >
                                <div className="font-medium text-gray-900">{product.name}</div>
                                {product.category && (
                                  <div className="text-xs text-gray-500">Category: {product.category}</div>
                                )}
                                {product.lastPurchasePrice && (
                                  <div className="text-xs text-gray-500">Last Price: Rs. {product.lastPurchasePrice.toFixed(2)}</div>
                                )}
                                {product.currentQuantity !== undefined && (
                                  <div className="text-xs text-gray-500">Stock: {product.currentQuantity}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {returnItemErrors?.name && (
                          <p className="text-red-500 text-xs mt-1">{returnItemErrors.name.message}</p>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Quantity <span className="text-red-500">*</span>
                        </label>
                        <input
                          {...register(`returnItems.${index}.quantity`, { 
                            required: 'Quantity is required',
                            min: { value: 1, message: 'Quantity must be at least 1' },
                            onChange: () => setTimeout(() => calculateTotal(), 100)
                          })}
                          type="number"
                          min="1"
                          className={`input-field bg-white text-gray-900 border-2 ${
                            returnItemErrors?.quantity ? 'border-red-300' : ''
                          }`}
                          placeholder="0"
                        />
                        {returnItemErrors?.quantity && (
                          <p className="text-red-500 text-xs mt-1">{returnItemErrors.quantity.message}</p>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Purchase Price (Rs.) <span className="text-red-500">*</span>
                        </label>
                        <input
                          {...register(`returnItems.${index}.purchasePrice`, { 
                            required: 'Purchase price is required',
                            min: { value: 0, message: 'Price must be positive' },
                            onChange: () => setTimeout(() => calculateTotal(), 100)
                          })}
                          type="number"
                          step="0.01"
                          min="0"
                          className={`input-field bg-white text-gray-900 border-2 ${
                            returnItemErrors?.purchasePrice ? 'border-red-300' : ''
                          }`}
                          placeholder="0.00"
                        />
                        {returnItemErrors?.purchasePrice && (
                          <p className="text-red-500 text-xs mt-1">{returnItemErrors.purchasePrice.message}</p>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          SKU
                        </label>
                        <input
                          {...register(`returnItems.${index}.sku`)}
                          className="input-field bg-white text-gray-900 border-2"
                          placeholder="Enter SKU (optional)"
                        />
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Category
                        </label>
                        <select
                          {...register(`returnItems.${index}.category`)}
                          className="input-field bg-white text-gray-900 border-2"
                        >
                          <option value="">Select category</option>
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Return Total (Rs.)
                        </label>
                        <input
                          type="text"
                          value={returnItemTotal.toFixed(2)}
                          className="input-field bg-gray-100 text-gray-900 border-2"
                          readOnly
                        />
                      </div>
                    </div>

                    <div className="form-group mt-4">
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Description
                      </label>
                      <textarea
                        {...register(`returnItems.${index}.description`)}
                        className="input-field bg-white text-gray-900 border-2"
                        rows={2}
                        placeholder="Enter return description (optional)"
                      />
                    </div>
                  </div>
                )
              })}
              {returnFields.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No return items added. Click "Add Return Item" to add returns.</p>
                </div>
              )}
            </div>
          </div>

          {/* Payments Section */}
          {invoice && invoice.supplier && (
            <div className="card p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-gray-900">Payments</h2>
                <button
                  type="button"
                  onClick={handleMakePayment}
                  className="btn-primary flex items-center min-h-[44px]"
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
                    Rs. {payments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
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
              {payments.length === 0 ? (
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {payments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {new Date(payment.date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {payment.paymentNumber}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                            Rs. {payment.amount.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {payment.paymentMethod}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            <button
                              onClick={() => {
                                window.location.href = `/business/purchases/${invoiceId}`
                              }}
                              className="text-blue-600 hover:text-blue-900"
                              title="Edit Payment (View Invoice)"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
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

          {/* Footer Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={() => navigate('/business/purchases')}
              className="btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex items-center"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Updating...
                </>
              ) : (
                'Update Purchase Invoice'
              )}
            </button>
          </div>
        </form>
      </div>
    </ModernLayout>
  )
}

export default EditPurchasePage

