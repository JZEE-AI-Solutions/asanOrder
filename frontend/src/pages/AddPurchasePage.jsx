import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray, useWatch } from 'react-hook-form'
import { ArrowLeftIcon, DocumentTextIcon, PlusIcon, TrashIcon, CameraIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ModernLayout from '../components/ModernLayout'
import { useTenant } from '../hooks'
import PaymentAccountSelector from '../components/accounting/PaymentAccountSelector'
import InvoiceUploadModal from '../components/InvoiceUploadModal'

const AddPurchasePage = () => {
  const navigate = useNavigate()
  const { tenant } = useTenant()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [newCategoryInputs, setNewCategoryInputs] = useState({})
  const [supplierBalance, setSupplierBalance] = useState(null)
  const [loadingSupplierBalance, setLoadingSupplierBalance] = useState(false)
  const [advanceAmountUsed, setAdvanceAmountUsed] = useState(0) // Auto-calculated, not user input
  const [supplierSuggestions, setSupplierSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchTimeout, setSearchTimeout] = useState(null)
  const [selectedSupplierId, setSelectedSupplierId] = useState(null)
  const [showScanModal, setShowScanModal] = useState(false)
  const [returnHandlingMethod, setReturnHandlingMethod] = useState('REDUCE_AP')
  const [returnRefundAccountId, setReturnRefundAccountId] = useState('')
  // Product autocomplete state - store suggestions per field
  const [productSuggestions, setProductSuggestions] = useState({})
  const [showProductSuggestions, setShowProductSuggestions] = useState({})
  const [productSearchTimeouts, setProductSearchTimeouts] = useState({})
  const [lastSearchQueries, setLastSearchQueries] = useState({}) // Track last search to prevent duplicates
  const searchInProgress = useRef({}) // Track ongoing searches to prevent concurrent requests
  
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
    setValue,
    getValues,
    trigger
  } = useForm({
    mode: 'onChange', // Enable real-time validation and updates
    defaultValues: {
      invoiceNumber: '',
      supplierName: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      totalAmount: 0,
      paymentStatus: '',
      paymentAmount: '',
      paymentAccountId: '',
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

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items'
  })

  const { fields: returnFields, append: appendReturn, remove: removeReturn } = useFieldArray({
    control,
    name: 'returnItems'
  })

  // Watch items and return items for changes - use useWatch for real-time updates
  const watchedItems = useWatch({ control, name: 'items' })
  const watchedReturnItems = useWatch({ control, name: 'returnItems' })

  // Memoize totals calculation to prevent unnecessary recalculations
  // Use useWatch values directly for real-time updates
  const totals = useMemo(() => {
    const items = watchedItems || []
    const returnItems = watchedReturnItems || []
    
    const purchaseTotal = items.reduce((sum, item) => {
      if (!item) return sum
      const quantity = parseFloat(item.quantity) || 0
      const price = parseFloat(item.purchasePrice) || 0
      return sum + (quantity * price)
    }, 0)
    
    const returnTotal = returnItems.reduce((sum, item) => {
      if (!item) return sum
      const quantity = parseFloat(item.quantity) || 0
      const price = parseFloat(item.purchasePrice) || 0
      return sum + (quantity * price)
    }, 0)
    
    const netTotal = purchaseTotal - returnTotal
    return { purchaseTotal, returnTotal, netTotal }
  }, [watchedItems, watchedReturnItems])

  // Calculate total amount from items (purchases - returns)
  const calculateTotal = useCallback(() => {
    return totals
  }, [totals])

  // Update total when items or return items change
  useEffect(() => {
    const newTotal = Math.max(0, totals.netTotal).toFixed(2)
    const currentTotal = watch('totalAmount')
    
    // Only update if value actually changed to prevent infinite loops
    if (currentTotal !== newTotal) {
      setValue('totalAmount', newTotal, { shouldValidate: false, shouldDirty: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.netTotal])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout)
      }
    }
  }, [searchTimeout])

  // Cleanup product search timeouts on unmount
  useEffect(() => {
    return () => {
      // Cleanup all product search timeouts
      Object.values(productSearchTimeouts).forEach(timeout => {
        if (timeout) clearTimeout(timeout)
      })
    }
  }, [])

  // Calculate payment status based on advance balance and cash payment
  const calculatePaymentStatus = () => {
    const totalAmount = parseFloat(watch('totalAmount')) || 0
    const cashPayment = parseFloat(watch('paymentAmount')) || 0
    const advanceUsed = advanceAmountUsed || 0
    const totalPayment = cashPayment + advanceUsed

    if (totalPayment >= totalAmount && totalAmount > 0) {
      return 'paid'
    } else if (totalPayment > 0) {
      return 'partial'
    } else {
      return 'unpaid'
    }
  }

  // Watch form values for payment calculation
  const watchedTotalAmount = watch('totalAmount')
  const watchedPaymentAmount = watch('paymentAmount')
  const watchedPaymentStatus = watch('paymentStatus')

  // Auto-calculate advance usage and update payment status
  useEffect(() => {
    const totalAmount = parseFloat(watchedTotalAmount) || 0
    const netTotal = totals.netTotal
    
    // For return-only invoices (netTotal < 0), set payment status to unpaid and clear advance
    if (netTotal < 0) {
      setAdvanceAmountUsed(0)
      setValue('paymentStatus', 'unpaid', { shouldValidate: false, shouldDirty: false })
      setValue('paymentAmount', '', { shouldValidate: false, shouldDirty: false })
      return
    }
    
    if (totalAmount <= 0) {
      setAdvanceAmountUsed(0)
      return
    }
    
    // Auto-calculate advance usage: use all available if total <= available, otherwise use all available
    if (supplierBalance && supplierBalance.availableAdvance > 0) {
      const availableAdvance = supplierBalance.availableAdvance
      const advanceToUse = Math.min(availableAdvance, totalAmount)
      setAdvanceAmountUsed(advanceToUse)
      
      // Auto-update payment status
      const cashPayment = parseFloat(watchedPaymentAmount || 0)
      const totalPayment = advanceToUse + cashPayment
      
      let calculatedStatus = 'unpaid'
      if (advanceToUse >= totalAmount) {
        // Fully paid with advance
        calculatedStatus = 'paid'
        if (cashPayment > 0.01) {
          setValue('paymentAmount', '', { shouldValidate: false, shouldDirty: false })
        }
      } else if (totalPayment >= totalAmount) {
        calculatedStatus = 'paid'
      } else if (totalPayment > 0) {
        calculatedStatus = 'partial'
      }
      
      // Only update if status actually changed to prevent loops
      if (watchedPaymentStatus !== calculatedStatus) {
        setValue('paymentStatus', calculatedStatus, { shouldValidate: false, shouldDirty: false })
      }
    } else {
      setAdvanceAmountUsed(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierBalance, watchedTotalAmount, watchedPaymentAmount, watchedPaymentStatus])

  const addItem = () => {
    append({ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '' })
  }

  const removeItem = (index) => {
    // Check if there are valid return items
    const hasValidReturnItems = returnFields.some(field => {
      const returnItemName = watch(`returnItems.${field.id}.name`)
      const returnItemQty = watch(`returnItems.${field.id}.quantity`)
      return returnItemName && returnItemName.trim() && parseFloat(returnItemQty) > 0
    })
    // Allow removing all purchase items if there are valid return items
    if (fields.length > 1 || hasValidReturnItems) {
      remove(index)
      setTimeout(() => calculateTotal(), 100)
    } else {
      toast.error('At least one item (purchase or return) is required')
    }
  }

  const onSubmit = async (data) => {
    // Prevent submission if any modal is open (safety check)
    if (document.querySelector('.fixed.inset-0.bg-black.bg-opacity-50')) {
      console.warn('Form submission prevented: Modal is open')
      return
    }
    // Validate items - allow either purchase items OR return items
    const validItems = data.items.filter(item => 
      item.name && item.name.trim() && 
      item.quantity > 0 && 
      item.purchasePrice >= 0
    )

    // Validate return items
    const validReturnItems = (data.returnItems || []).filter(item => 
      item.name?.trim() && 
      parseFloat(item.quantity) > 0 && 
      parseFloat(item.purchasePrice) >= 0
    )

    // Allow purchase with either items OR return items (or both)
    if (validItems.length === 0 && validReturnItems.length === 0) {
      toast.error('Please add at least one valid product (purchase or return)')
      return
    }

    setIsSubmitting(true)
    try {
      const totals = calculateTotal()
      const purchaseTotal = totals.purchaseTotal
      const returnTotal = totals.returnTotal
      const netTotal = totals.netTotal
      
      // Calculate total payment (cash + advance)
      const advanceUsed = advanceAmountUsed || 0
      const cashPayment = data.paymentAmount ? parseFloat(data.paymentAmount) : 0
      const totalPayment = cashPayment + advanceUsed
      
      // For return-only invoices (netTotal < 0), payment should be 0
      // Returns are handled via returnHandlingMethod (REDUCE_AP or REFUND)
      if (netTotal < 0) {
        // This is a return-only invoice - no payment should be made
        if (totalPayment > 0) {
          toast.error('Payment cannot be made for return-only invoices. Returns are handled via the return handling method.')
          setIsSubmitting(false)
          return
        }
        // Ensure payment status is set to unpaid for return-only invoices
        // Set it here to ensure it's correct before submission
        setValue('paymentStatus', 'unpaid', { shouldValidate: false, shouldDirty: false })
        // Update data object for this submission
        data.paymentStatus = 'unpaid'
        data.paymentAmount = ''
      } else {
        // Regular purchase invoice - validate payment against positive net total
        // Validate total payment (against net total)
        if (totalPayment > netTotal) {
          toast.error(`Total payment (Rs. ${totalPayment.toFixed(2)}) exceeds net invoice total (Rs. ${netTotal.toFixed(2)})`)
          setIsSubmitting(false)
          return
        }

        // Validate payment status matches actual payment (against net total)
        if (data.paymentStatus === 'paid' && totalPayment < netTotal) {
          toast.error(`Payment status is "Fully Paid" but total payment is Rs. ${totalPayment.toFixed(2)}. Need Rs. ${(netTotal - totalPayment).toFixed(2)} more.`)
          setIsSubmitting(false)
          return
        }

        if (data.paymentStatus === 'partial' && totalPayment <= 0) {
          toast.error('Payment status is "Partially Paid" but no payment entered')
          setIsSubmitting(false)
          return
        }

        if (data.paymentStatus === 'partial' && totalPayment >= netTotal) {
          toast.error('Total payment covers full invoice. Payment status should be "Fully Paid"')
          setIsSubmitting(false)
          return
        }
      }

      // Use cashPayment as paymentAmount for backend (advance is handled separately)
      const paymentAmount = cashPayment
      
      // Only validate return total against purchase total if there are purchase items
      // If only return items exist, this is a valid scenario (pure return transaction)
      if (validItems.length > 0 && returnTotal > purchaseTotal) {
        toast.error(`Return total (Rs. ${returnTotal.toFixed(2)}) cannot exceed purchase total (Rs. ${purchaseTotal.toFixed(2)})`)
        setIsSubmitting(false)
        return
      }

      // Validate return handling method if return items exist
      if (validReturnItems.length > 0) {
        if (!returnHandlingMethod) {
          toast.error('Please select a return handling method')
          setIsSubmitting(false)
          return
        }
        
        if (returnHandlingMethod === 'REFUND' && !returnRefundAccountId) {
          toast.error('Please select a refund account for returns')
          setIsSubmitting(false)
          return
        }
      }

      const payload = {
        invoiceNumber: data.invoiceNumber?.trim() || undefined,
        supplierName: data.supplierName || null,
        invoiceDate: data.invoiceDate,
        totalAmount: netTotal, // Net amount (purchases - returns)
        paymentAmount: paymentAmount > 0 ? paymentAmount : undefined,
        // Only include payment method if there's actual cash/bank payment
        paymentAccountId: paymentAmount > 0 ? (data.paymentAccountId || null) : null,
        notes: data.notes || null,
        useAdvanceBalance: advanceAmountUsed > 0,
        advanceAmountUsed: advanceAmountUsed > 0 ? advanceAmountUsed : undefined,
        products: validItems.length > 0 ? validItems.map(item => {
          const categoryValue = item.newCategory?.trim() 
            ? item.newCategory.trim() 
            : (item.category?.trim() || null)
          
          return {
            name: item.name.trim(),
            quantity: parseInt(item.quantity),
            purchasePrice: parseFloat(item.purchasePrice),
            sku: item.sku?.trim() || null,
            category: categoryValue,
            description: item.description?.trim() || null
          }
        }) : undefined,
        returnItems: validReturnItems.length > 0 ? validReturnItems.map(item => ({
          name: item.name.trim(),
          productName: item.name.trim(),
          quantity: parseInt(item.quantity),
          purchasePrice: parseFloat(item.purchasePrice),
          sku: item.sku?.trim() || null,
          category: item.category?.trim() || null,
          description: item.description?.trim() || null,
          reason: item.reason || 'Purchase invoice return'
        })) : undefined,
        returnHandlingMethod: validReturnItems.length > 0 ? returnHandlingMethod : undefined,
        returnRefundAccountId: validReturnItems.length > 0 && returnHandlingMethod === 'REFUND' ? returnRefundAccountId : undefined
      }

      const response = await api.post('/purchase-invoice/with-products', payload)
      toast.success('Purchase invoice created successfully!')
      // Navigate to the purchase invoice details page
      // Backend returns: { invoice: { id, ... }, items: [...] }
      const invoiceId = response.data?.invoice?.id
      if (invoiceId) {
        navigate(`/business/purchases/${invoiceId}`)
      } else {
        navigate('/business/purchases')
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to create purchase invoice'
      toast.error(errorMessage)
      console.error('Create purchase invoice error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModernLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/business/purchases')}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="h-6 w-6" />
            </button>
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg mr-3">
                <DocumentTextIcon className="h-6 w-6 text-blue-600" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Add Purchase Invoice</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowScanModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <CameraIcon className="h-5 w-5" />
            <span>Scan Invoice</span>
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Invoice Details Section */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Invoice Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Number
                </label>
                <input
                  {...register('invoiceNumber')}
                  className="w-full px-3 py-2 bg-gray-100 text-gray-600 border-2 border-gray-300 rounded-lg cursor-not-allowed"
                  placeholder="Auto-generated"
                  readOnly
                />
                <p className="text-xs text-gray-500 mt-1">
                  Invoice number will be auto-generated
                </p>
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supplier Name
                </label>
                <input
                  {...register('supplierName')}
                  className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.supplierName ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Type to search suppliers..."
                  autoComplete="off"
                  onChange={async (e) => {
                    // Call register's onChange first to update form state
                    const { onChange } = register('supplierName')
                    onChange(e)
                    
                    const supplierName = e.target.value.trim()
                    
                    // Clear previous timeout
                    if (searchTimeout) {
                      clearTimeout(searchTimeout)
                    }
                    
                    // Clear balance and selection if supplier name doesn't match selected supplier
                    if (selectedSupplierId) {
                      const selectedSupplier = supplierSuggestions.find(s => s.id === selectedSupplierId)
                      if (!selectedSupplier || selectedSupplier.name !== supplierName) {
                        setSelectedSupplierId(null)
                        setSupplierBalance(null)
                        setAdvanceAmountUsed(0)
                      }
                    }
                    
                    if (supplierName.length >= 2) {
                      // Debounce search - wait 300ms after user stops typing
                      const timeout = setTimeout(async () => {
                        try {
                          const response = await api.get(`/accounting/suppliers/search/${encodeURIComponent(supplierName)}`)
                          if (response.data.success) {
                            setSupplierSuggestions(response.data.suppliers || [])
                            setShowSuggestions(true)
                          }
                        } catch (error) {
                          console.error('Error searching suppliers:', error)
                          setSupplierSuggestions([])
                        }
                      }, 300)
                      setSearchTimeout(timeout)
                    } else {
                      setSupplierSuggestions([])
                      setShowSuggestions(false)
                    }
                  }}
                  onFocus={() => {
                    const supplierName = watch('supplierName')?.trim()
                    if (supplierName && supplierName.length >= 2) {
                      setShowSuggestions(true)
                    }
                  }}
                  onBlur={(e) => {
                    // Don't hide if clicking on suggestion dropdown
                    const relatedTarget = e.relatedTarget
                    if (relatedTarget && relatedTarget.closest('.supplier-suggestions-dropdown')) {
                      return
                    }
                    // Delay hiding suggestions to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200)
                  }}
                />
                
                {/* Autocomplete Dropdown */}
                {showSuggestions && supplierSuggestions.length > 0 && (
                  <div className="supplier-suggestions-dropdown absolute z-10 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {supplierSuggestions.map((supplier) => (
                      <div
                        key={supplier.id}
                        className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        onMouseDown={(e) => {
                          e.preventDefault() // Prevent input blur
                          setValue('supplierName', supplier.name)
                          setSelectedSupplierId(supplier.id)
                          setShowSuggestions(false)
                          setSupplierSuggestions([])
                          
                          // Fetch balance only when supplier is selected
                          setLoadingSupplierBalance(true)
                          api.get(`/accounting/suppliers/by-name/${encodeURIComponent(supplier.name)}/balance`)
                            .then(response => {
                              if (response.data.success) {
                                setSupplierBalance(response.data)
                              } else {
                                setSupplierBalance(null)
                                setAdvanceAmountUsed(0)
                              }
                            })
                            .catch(error => {
                              console.error('Error fetching supplier balance:', error)
                              setSupplierBalance(null)
                              setAdvanceAmountUsed(0)
                            })
                            .finally(() => {
                              setLoadingSupplierBalance(false)
                            })
                        }}
                      >
                        <div className="font-medium text-gray-900">{supplier.name}</div>
                        {supplier.contact && (
                          <div className="text-xs text-gray-500">{supplier.contact}</div>
                        )}
                        {supplier.email && (
                          <div className="text-xs text-gray-500">{supplier.email}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {errors.supplierName && (
                  <p className="text-red-500 text-xs mt-1">{errors.supplierName.message}</p>
                )}
                {loadingSupplierBalance && (
                  <p className="text-xs text-gray-500 mt-1">Loading supplier balance...</p>
                )}
                {supplierBalance && supplierBalance.availableAdvance > 0 && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs text-green-700">
                      <strong>Available Advance:</strong> Rs. {supplierBalance.availableAdvance.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Date <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('invoiceDate', { required: 'Invoice date is required' })}
                  type="date"
                  className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.invoiceDate ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {errors.invoiceDate && (
                  <p className="text-red-500 text-xs mt-1">{errors.invoiceDate.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Net Amount (Rs.) <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('totalAmount', { 
                    required: 'Total amount is required',
                    min: { value: 0, message: 'Amount must be positive' }
                  })}
                  type="number"
                  step="0.01"
                  min="0"
                  value={Math.max(0, totals.netTotal).toFixed(2)}
                  className={`w-full px-3 py-2 bg-gray-100 text-gray-600 border-2 border-gray-300 rounded-lg cursor-not-allowed ${
                    errors.totalAmount ? 'border-red-300' : ''
                  }`}
                  placeholder="0.00"
                  readOnly
                />
                {errors.totalAmount && (
                  <p className="text-red-500 text-xs mt-1">{errors.totalAmount.message}</p>
                )}
                {(() => {
                  const totals = calculateTotal()
                  return (
                    <div className="text-xs text-gray-500 mt-1 space-y-1">
                      <p>Purchase Total: Rs. {totals.purchaseTotal.toFixed(2)}</p>
                      {totals.returnTotal > 0 && (
                        <p className="text-red-600">Return Total: -Rs. {totals.returnTotal.toFixed(2)}</p>
                      )}
                      <p className="font-semibold">Net Amount: Rs. {totals.netTotal.toFixed(2)}</p>
                    </div>
                  )
                })()}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  {...register('notes')}
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Enter additional notes"
                />
              </div>
            </div>
          </div>

          {/* Products Section */}
          <div className="card p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Products</h3>
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
                      <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Product Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          {...register(`items.${index}.name`, { 
                            validate: (value) => {
                              // Get all current form values
                              const allValues = getValues()
                              const returnItems = allValues.returnItems || []
                              
                              // Check if there are valid return items
                              const hasValidReturnItems = returnItems.some((item, idx) => {
                                const returnItemName = item?.name
                                const returnItemQty = item?.quantity
                                return returnItemName && returnItemName.trim() && parseFloat(returnItemQty) > 0
                              })
                              
                              // If there are return items, product name is optional
                              if (hasValidReturnItems) return true
                              
                              // If no return items, product name is required
                              if (!value || !value.trim()) {
                                return 'Product name is required (or add return items)'
                              }
                              return true
                            },
                            onChange: (e) => {
                              // Autocomplete logic only - register handles value update
                              const productName = e.target.value.trim()
                              const fieldKey = `items.${index}`
                              
                              // Clear previous timeout
                              if (productSearchTimeouts[fieldKey]) {
                                clearTimeout(productSearchTimeouts[fieldKey])
                                delete productSearchTimeouts[fieldKey]
                              }
                              
                              // Trigger re-validation of return items when purchase item name changes
                              setTimeout(async () => {
                                await trigger('returnItems')
                              }, 150)
                              
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
                                  // Double-check query hasn't changed (for purchase items)
                                  const currentValue = watch(`items.${index}.name`)?.trim()
                                  if (currentValue !== productName) {
                                    return // Query changed, ignore this result
                                  }
                                  
                                  // Prevent concurrent searches for the same field
                                  if (searchInProgress.current[fieldKey]) {
                                    return
                                  }
                                  searchInProgress.current[fieldKey] = true
                                  
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
                                  } finally {
                                    searchInProgress.current[fieldKey] = false
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
                              }
                            }
                          })}
                          className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                            itemErrors?.name ? 'border-red-300' : 'border-gray-300'
                          }`}
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
                          onBlur={(e) => {
                            const fieldKey = `items.${index}`
                            // Don't hide if clicking on suggestion dropdown
                            const relatedTarget = e.relatedTarget
                            if (relatedTarget && relatedTarget.closest('.product-suggestions-dropdown')) {
                              return
                            }
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
                          <div className="product-suggestions-dropdown absolute z-10 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                            {productSuggestions[`items.${index}`].map((product) => (
                              <div
                                key={product.id}
                                className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                onMouseDown={(e) => {
                                  e.preventDefault() // Prevent input blur
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

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Quantity <span className="text-red-500">*</span>
                        </label>
                        <input
                          {...register(`items.${index}.quantity`, { 
                            required: 'Quantity is required',
                            min: { value: 1, message: 'Quantity must be at least 1' }
                          })}
                          type="number"
                          min="1"
                          step="1"
                          className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                            itemErrors?.quantity ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="1"
                        />
                        {itemErrors?.quantity && (
                          <p className="text-red-500 text-xs mt-1">{itemErrors.quantity.message}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Purchase Price (Rs.) <span className="text-red-500">*</span>
                        </label>
                        <input
                          {...register(`items.${index}.purchasePrice`, { 
                            required: 'Purchase price is required',
                            min: { value: 0, message: 'Price must be positive' }
                          })}
                          type="number"
                          step="0.01"
                          min="0"
                          className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                            itemErrors?.purchasePrice ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="0.00"
                        />
                        {itemErrors?.purchasePrice && (
                          <p className="text-red-500 text-xs mt-1">{itemErrors.purchasePrice.message}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          SKU
                        </label>
                        <input
                          {...register(`items.${index}.sku`)}
                          className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Enter SKU (optional)"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
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
                              style={{ color: '#111827', backgroundColor: '#ffffff' }}
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
                              className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="" style={{ color: '#111827', backgroundColor: '#ffffff' }}>Select a category (optional)</option>
                              {categories.map(category => (
                                <option key={category} value={category} style={{ color: '#111827', backgroundColor: '#ffffff' }}>
                                  {category}
                                </option>
                              ))}
                              <option value="__new__" style={{ color: '#111827', backgroundColor: '#ffffff' }}>+ Add New Category</option>
                            </select>
                            {newCategoryInputs[index] && (
                              <input
                                {...register(`items.${index}.newCategory`)}
                                className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mt-2"
                                placeholder="Enter new category name"
                                autoFocus
                              />
                            )}
                          </>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Item Total (Rs.)
                        </label>
                        <input
                          type="text"
                          value={itemTotal.toFixed(2)}
                          className="w-full px-3 py-2 bg-gray-100 text-gray-900 border-2 border-gray-300 rounded-lg cursor-not-allowed"
                          readOnly
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <textarea
                        {...register(`items.${index}.description`)}
                        className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Return Items</h3>
              <button
                type="button"
                onClick={async () => {
                  appendReturn({ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '', reason: 'Purchase invoice return' })
                  // Trigger re-validation of purchase item names since they're now optional when return items exist
                  setTimeout(async () => {
                    await trigger('items')
                  }, 100)
                }}
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
                        onClick={async () => {
                          removeReturn(index)
                          // Trigger re-validation of purchase items when return item is removed
                          setTimeout(async () => {
                            await trigger('items')
                          }, 100)
                        }}
                        className="text-red-600 hover:text-red-800"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Product Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          {...register(`returnItems.${index}.name`, { 
                            validate: (value) => {
                              // Get all current form values
                              const allValues = getValues()
                              const purchaseItems = allValues.items || []
                              
                              // Check if there are valid purchase items
                              const hasValidPurchaseItems = purchaseItems.some((item, idx) => {
                                const purchaseItemName = item?.name
                                const purchaseItemQty = item?.quantity
                                return purchaseItemName && purchaseItemName.trim() && parseFloat(purchaseItemQty) > 0
                              })
                              
                              // If there are purchase items, return item name is optional
                              if (hasValidPurchaseItems) return true
                              
                              // If no purchase items, return item name is required
                              if (!value || !value.trim()) {
                                return 'Product name is required (or add purchase items)'
                              }
                              return true
                            },
                            onChange: (e) => {
                              // Autocomplete logic only - register handles value update
                              const productName = e.target.value.trim()
                              const fieldKey = `returnItems.${index}`
                              
                              // Clear previous timeout
                              if (productSearchTimeouts[fieldKey]) {
                                clearTimeout(productSearchTimeouts[fieldKey])
                                delete productSearchTimeouts[fieldKey]
                              }
                              
                              // Trigger re-validation of purchase items when return item name changes
                              setTimeout(async () => {
                                await trigger('items')
                              }, 150)
                              
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
                                  const currentValue = watch(`returnItems.${index}.name`)?.trim()
                                  if (currentValue !== productName) {
                                    return // Query changed, ignore this result
                                  }
                                  
                                  // Prevent concurrent searches for the same field
                                  if (searchInProgress.current[fieldKey]) {
                                    return
                                  }
                                  searchInProgress.current[fieldKey] = true
                                  
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
                                  } finally {
                                    searchInProgress.current[fieldKey] = false
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
                              }
                            }
                          })}
                          className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                            returnItemErrors?.name ? 'border-red-300' : 'border-gray-300'
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
                          onBlur={(e) => {
                            const fieldKey = `returnItems.${index}`
                            // Don't hide if clicking on suggestion dropdown
                            const relatedTarget = e.relatedTarget
                            if (relatedTarget && relatedTarget.closest('.product-suggestions-dropdown')) {
                              return
                            }
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
                          <div className="product-suggestions-dropdown absolute z-10 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                            {productSuggestions[`returnItems.${index}`].map((product) => (
                              <div
                                key={product.id}
                                className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                onMouseDown={(e) => {
                                  e.preventDefault() // Prevent input blur
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

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Quantity <span className="text-red-500">*</span>
                        </label>
                        <input
                          {...register(`returnItems.${index}.quantity`, { 
                            required: 'Quantity is required',
                            min: { value: 1, message: 'Quantity must be at least 1' }
                          })}
                          type="number"
                          min="1"
                          className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                            returnItemErrors?.quantity ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="0"
                          onChange={(e) => {
                            const { onChange } = register(`returnItems.${index}.quantity`)
                            onChange(e)
                            // Force update by setting value to trigger watch update
                            setValue(`returnItems.${index}.quantity`, e.target.value, { shouldValidate: false, shouldDirty: true })
                          }}
                        />
                        {returnItemErrors?.quantity && (
                          <p className="text-red-500 text-xs mt-1">{returnItemErrors.quantity.message}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Purchase Price (Rs.) <span className="text-red-500">*</span>
                        </label>
                        <input
                          {...register(`returnItems.${index}.purchasePrice`, { 
                            required: 'Purchase price is required',
                            min: { value: 0, message: 'Price must be positive' }
                          })}
                          type="number"
                          step="0.01"
                          min="0"
                          className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                            returnItemErrors?.purchasePrice ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="0.00"
                          onChange={(e) => {
                            const { onChange } = register(`returnItems.${index}.purchasePrice`)
                            onChange(e)
                            // Force update by setting value to trigger watch update
                            setValue(`returnItems.${index}.purchasePrice`, e.target.value, { shouldValidate: false, shouldDirty: true })
                          }}
                        />
                        {returnItemErrors?.purchasePrice && (
                          <p className="text-red-500 text-xs mt-1">{returnItemErrors.purchasePrice.message}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          SKU
                        </label>
                        <input
                          {...register(`returnItems.${index}.sku`)}
                          className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                          placeholder="Enter SKU (optional)"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Category
                        </label>
                        <select
                          {...register(`returnItems.${index}.category`)}
                          className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                        >
                          <option value="">Select category</option>
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Return Total (Rs.)
                        </label>
                        <input
                          type="text"
                          value={returnItemTotal.toFixed(2)}
                          className="w-full px-3 py-2 bg-gray-100 text-gray-900 border-2 border-gray-300 rounded-lg cursor-not-allowed"
                          readOnly
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <textarea
                        {...register(`returnItems.${index}.description`)}
                        className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
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

          {/* Payment Details Section - Simplified */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Details</h3>
            
            {/* Supplier Advance Balance - Auto-used if available */}
            {supplierBalance && supplierBalance.availableAdvance > 0 && (
              <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Available Advance Balance</p>
                    <p className="text-2xl font-bold text-green-600">
                      Rs. {supplierBalance.availableAdvance.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    {(() => {
                      const total = parseFloat(watch('totalAmount')) || 0
                      const available = supplierBalance.availableAdvance
                      const willUse = Math.min(available, total)
                      if (willUse > 0) {
                        return (
                          <div>
                            <p className="text-xs text-gray-600 mb-1">Will Use</p>
                            <p className="text-xl font-bold text-blue-600">
                              Rs. {willUse.toLocaleString()}
                            </p>
                            {available >= total && (
                              <p className="text-xs text-green-600 mt-1">✓ Fully covers purchase</p>
                            )}
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Payment Summary - Single consolidated view */}
            {(() => {
              // Use calculated totals directly instead of watch to ensure it's always up-to-date
              const netTotal = totals.netTotal
              const total = Math.max(0, netTotal)
              const isReturnOnly = netTotal < 0
              const advanceUsed = advanceAmountUsed || 0
              const cashPayment = parseFloat(watch('paymentAmount') || 0)
              const totalPayment = advanceUsed + cashPayment
              const remaining = total - totalPayment
              const isFullyPaid = totalPayment >= total && total > 0 && !isReturnOnly
              const isPartiallyPaid = totalPayment > 0 && totalPayment < total && !isReturnOnly
              const showPaymentFields = !isReturnOnly && advanceUsed < total // Don't show payment fields for return-only invoices
              
              return (
                <div className="space-y-4">
                  {/* Payment Summary Card */}
                  <div className={`p-4 rounded-lg border-2 ${
                    isFullyPaid 
                      ? 'bg-green-50 border-green-300' 
                      : isPartiallyPaid 
                        ? 'bg-yellow-50 border-yellow-300' 
                        : 'bg-gray-50 border-gray-300'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900">Payment Summary</h4>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        isReturnOnly
                          ? 'bg-purple-100 text-purple-700'
                          : isFullyPaid 
                            ? 'bg-green-100 text-green-700' 
                            : isPartiallyPaid 
                              ? 'bg-yellow-100 text-yellow-700' 
                              : 'bg-gray-100 text-gray-700'
                      }`}>
                        {isReturnOnly ? 'Return Only' : isFullyPaid ? '✓ Fully Paid' : isPartiallyPaid ? '⚠ Partially Paid' : 'Unpaid'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600 text-xs mb-1">
                          {isReturnOnly ? 'Return Total' : 'Invoice Total'}
                        </p>
                        <p className={`text-lg font-bold ${isReturnOnly ? 'text-purple-600' : 'text-gray-900'}`}>
                          {isReturnOnly ? `Rs. ${Math.abs(netTotal).toLocaleString()}` : `Rs. ${total.toLocaleString()}`}
                        </p>
                      </div>
                      {advanceUsed > 0 && (
                        <div>
                          <p className="text-gray-600 text-xs mb-1">From Advance</p>
                          <p className="text-lg font-bold text-green-600">- Rs. {advanceUsed.toLocaleString()}</p>
                        </div>
                      )}
                      {cashPayment > 0 && (
                        <div>
                          <p className="text-gray-600 text-xs mb-1">Cash/Bank Payment</p>
                          <p className="text-lg font-bold text-blue-600">- Rs. {cashPayment.toLocaleString()}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-gray-600 text-xs mb-1">
                          {isReturnOnly ? 'Type' : remaining > 0 ? 'Remaining' : 'Status'}
                        </p>
                        <p className={`text-lg font-bold ${
                          isReturnOnly 
                            ? 'text-purple-600'
                            : remaining > 0 
                              ? 'text-red-600' 
                              : 'text-green-600'
                        }`}>
                          {isReturnOnly 
                            ? 'Return' 
                            : remaining > 0 
                              ? `Rs. ${remaining.toLocaleString()}` 
                              : '✓ Paid'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Payment Input Fields - Only show for purchase invoices (not return-only) */}
                  {!isReturnOnly && total > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Payment Status - Always show if there's an invoice total */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Payment Status <span className="text-red-500">*</span>
                        </label>
                        <select
                          {...register('paymentStatus', { 
                            required: total > 0 ? 'Please select payment status' : false 
                          })}
                          className={`w-full px-3 py-2 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                            errors.paymentStatus ? 'border-red-300' : 'border-gray-300'
                          } bg-white`}
                          onChange={(e) => {
                            register('paymentStatus').onChange(e)
                            if (e.target.value === 'unpaid') {
                              setValue('paymentAmount', '')
                              setValue('paymentAccountId', '')
                            } else if (e.target.value === 'paid') {
                              const total = parseFloat(watch('totalAmount')) || 0
                              setValue('paymentAmount', Math.max(0, total - advanceUsed).toFixed(2))
                            } else if (e.target.value === 'partial') {
                              setValue('paymentAmount', '')
                            }
                          }}
                        >
                          <option value="">Select payment status</option>
                          <option value="unpaid">Unpaid</option>
                          <option value="partial">Partially Paid</option>
                          <option value="paid">Fully Paid</option>
                        </select>
                          {errors.paymentStatus && (
                            <p className="text-red-500 text-xs mt-1">{errors.paymentStatus.message}</p>
                          )}
                      </div>

                      {/* Cash Payment Amount - Show if payment status is not 'unpaid' */}
                      {watch('paymentStatus') && watch('paymentStatus') !== 'unpaid' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Cash/Bank Payment (Rs.)
                            {watch('paymentStatus') === 'paid' || watch('paymentStatus') === 'partial' ? <span className="text-red-500">*</span> : ''}
                          </label>
                          <input
                            {...register('paymentAmount', {
                              required: watch('paymentStatus') !== 'unpaid' && watch('paymentStatus') !== '' ? 'Cash payment is required' : false,
                              min: { value: 0, message: 'Cannot be negative' },
                              validate: (value) => {
                                const cash = parseFloat(value) || 0
                                const maxCash = Math.max(0, total - advanceUsed)
                                const paymentStatus = watch('paymentStatus')
                                
                                if (cash > maxCash) {
                                  return `Maximum: Rs. ${maxCash.toFixed(2)}`
                                }
                                if (paymentStatus === 'paid' && (cash + advanceUsed) < total) {
                                  return `Need Rs. ${(total - cash - advanceUsed).toFixed(2)} more for full payment`
                                }
                                return true
                              }
                            })}
                            type="number"
                            step="0.01"
                            min="0"
                            max={Math.max(0, total - advanceUsed)}
                            className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                              errors.paymentAmount ? 'border-red-300' : 'border-gray-300'
                            }`}
                            placeholder={`Max: Rs. ${Math.max(0, total - advanceUsed).toFixed(2)}`}
                          />
                          {errors.paymentAmount && (
                            <p className="text-red-500 text-xs mt-1">{errors.paymentAmount.message}</p>
                          )}
                        </div>
                      )}

                      {/* Payment Account - Show if cash payment > 0 */}
                      {watch('paymentStatus') && watch('paymentStatus') !== 'unpaid' && (parseFloat(watch('paymentAmount')) || 0) > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Payment Account <span className="text-red-500">*</span>
                          </label>
                          <PaymentAccountSelector
                            value={watch('paymentAccountId')}
                            onChange={(value) => setValue('paymentAccountId', value)}
                            showQuickAdd={true}
                            required={cashPayment > 0}
                            className={errors.paymentAccountId ? 'border-red-300' : ''}
                          />
                          {errors.paymentAccountId && (
                            <p className="text-red-500 text-xs mt-1">{errors.paymentAccountId.message}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/business/purchases')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Creating...</span>
                </>
              ) : (
                'Create Purchase Invoice'
              )}
            </button>
          </div>
        </form>

        {/* Scan Invoice Modal */}
        {showScanModal && (
          <InvoiceUploadModal
            onClose={() => setShowScanModal(false)}
            onProductsExtracted={(extractedProducts, extractedReturns, invoiceData) => {
              // Populate purchase items
              if (extractedProducts && extractedProducts.length > 0) {
                setValue('items', extractedProducts.map(p => ({
                  name: p.name || '',
                  quantity: p.quantity || 1,
                  purchasePrice: p.purchasePrice || 0,
                  sku: p.sku || '',
                  category: p.category || '',
                  description: p.description || ''
                })))
              }

              // Populate return items
              if (extractedReturns && extractedReturns.length > 0) {
                setValue('returnItems', extractedReturns.map(r => ({
                  name: r.name || r.productName || '',
                  quantity: r.quantity || 1,
                  purchasePrice: r.purchasePrice || 0,
                  sku: r.sku || '',
                  category: r.category || '',
                  description: r.description || '',
                  reason: r.reason || 'Purchase invoice return'
                })))
                
                // Set default return handling method if returns exist
                if (!returnHandlingMethod) {
                  setReturnHandlingMethod('REDUCE_AP')
                }
              }

              // Pre-fill invoice details if available
              if (invoiceData) {
                if (invoiceData.invoiceNumber) {
                  setValue('invoiceNumber', invoiceData.invoiceNumber)
                }
                if (invoiceData.invoiceDate) {
                  setValue('invoiceDate', invoiceData.invoiceDate.split('T')[0])
                }
              }

              setShowScanModal(false)
              toast.success('Invoice data loaded! Please review and edit before submitting.')
            }}
          />
        )}
      </div>
    </ModernLayout>
  )
}

export default AddPurchasePage

