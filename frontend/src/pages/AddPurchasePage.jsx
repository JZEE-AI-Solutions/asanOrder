import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { ArrowLeftIcon, DocumentTextIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ModernLayout from '../components/ModernLayout'
import { useTenant } from '../hooks'
import PaymentAccountSelector from '../components/accounting/PaymentAccountSelector'

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
  
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
    setValue
  } = useForm({
    defaultValues: {
      invoiceNumber: '',
      supplierName: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      totalAmount: 0,
      paymentStatus: '',
      paymentAmount: '',
      paymentAccountId: '',
      notes: '',
      items: [{ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '' }]
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

  const watchedItems = watch('items')

  // Calculate total amount from items
  const calculateTotal = () => {
    const total = watchedItems.reduce((sum, item) => {
      const quantity = parseFloat(item?.quantity) || 0
      const price = parseFloat(item?.purchasePrice) || 0
      return sum + (quantity * price)
    }, 0)
    setValue('totalAmount', total.toFixed(2))
    return total
  }

  // Update total when items change
  useEffect(() => {
    calculateTotal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedItems])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout)
      }
    }
  }, [searchTimeout])

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

  // Auto-calculate advance usage and update payment status
  useEffect(() => {
    const totalAmount = parseFloat(watch('totalAmount')) || 0
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
      const cashPayment = parseFloat(watch('paymentAmount') || 0)
      const totalPayment = advanceToUse + cashPayment
      
      let calculatedStatus = 'unpaid'
      if (advanceToUse >= totalAmount) {
        // Fully paid with advance
        calculatedStatus = 'paid'
        if (cashPayment > 0.01) {
          setValue('paymentAmount', '')
        }
      } else if (totalPayment >= totalAmount) {
        calculatedStatus = 'paid'
      } else if (totalPayment > 0) {
        calculatedStatus = 'partial'
      }
      
      const currentStatus = watch('paymentStatus')
      if (currentStatus !== calculatedStatus) {
        setValue('paymentStatus', calculatedStatus)
      }
    } else {
      setAdvanceAmountUsed(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierBalance, watch('totalAmount'), watch('paymentAmount')])

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

  const onSubmit = async (data) => {
    // Prevent submission if any modal is open (safety check)
    if (document.querySelector('.fixed.inset-0.bg-black.bg-opacity-50')) {
      console.warn('Form submission prevented: Modal is open')
      return
    }
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

    setIsSubmitting(true)
    try {
      const totalAmount = parseFloat(data.totalAmount) || calculateTotal()
      
      // Calculate total payment (cash + advance)
      const advanceUsed = advanceAmountUsed || 0
      const cashPayment = data.paymentAmount ? parseFloat(data.paymentAmount) : 0
      const totalPayment = cashPayment + advanceUsed
      
      // Validate total payment
      if (totalPayment > totalAmount) {
        toast.error(`Total payment (Rs. ${totalPayment.toFixed(2)}) exceeds invoice total (Rs. ${totalAmount.toFixed(2)})`)
        setIsSubmitting(false)
        return
      }

      // Validate payment status matches actual payment
      if (data.paymentStatus === 'paid' && totalPayment < totalAmount) {
        toast.error(`Payment status is "Fully Paid" but total payment is Rs. ${totalPayment.toFixed(2)}. Need Rs. ${(totalAmount - totalPayment).toFixed(2)} more.`)
        setIsSubmitting(false)
        return
      }

      if (data.paymentStatus === 'partial' && totalPayment <= 0) {
        toast.error('Payment status is "Partially Paid" but no payment entered')
        setIsSubmitting(false)
        return
      }

      if (data.paymentStatus === 'partial' && totalPayment >= totalAmount) {
        toast.error('Total payment covers full invoice. Payment status should be "Fully Paid"')
        setIsSubmitting(false)
        return
      }

      // Use cashPayment as paymentAmount for backend (advance is handled separately)
      const paymentAmount = cashPayment

      const payload = {
        invoiceNumber: data.invoiceNumber?.trim() || undefined,
        supplierName: data.supplierName || null,
        invoiceDate: data.invoiceDate,
        totalAmount: totalAmount,
        paymentAmount: paymentAmount > 0 ? paymentAmount : undefined,
        // Only include payment method if there's actual cash/bank payment
        paymentAccountId: paymentAmount > 0 ? (data.paymentAccountId || null) : null,
        notes: data.notes || null,
        useAdvanceBalance: advanceAmountUsed > 0,
        advanceAmountUsed: advanceAmountUsed > 0 ? advanceAmountUsed : undefined,
        products: validItems.map(item => {
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
        })
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
        <div className="flex items-center gap-4 mb-8">
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
                    register('supplierName').onChange(e)
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
                        setUseAdvanceBalance(false)
                        setAdvanceAmountUsed('')
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
                  onBlur={() => {
                    // Delay hiding suggestions to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200)
                  }}
                />
                
                {/* Autocomplete Dropdown */}
                {showSuggestions && supplierSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {supplierSuggestions.map((supplier) => (
                      <div
                        key={supplier.id}
                        className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        onClick={async () => {
                          setValue('supplierName', supplier.name)
                          setSelectedSupplierId(supplier.id)
                          setShowSuggestions(false)
                          setSupplierSuggestions([])
                          
                          // Fetch balance only when supplier is selected
                          setLoadingSupplierBalance(true)
                          try {
                            const response = await api.get(`/accounting/suppliers/by-name/${encodeURIComponent(supplier.name)}/balance`)
                            if (response.data.success) {
                              setSupplierBalance(response.data)
                            } else {
                              setSupplierBalance(null)
                              setAdvanceAmountUsed(0)
                            }
                          } catch (error) {
                            console.error('Error fetching supplier balance:', error)
                            setSupplierBalance(null)
                            setAdvanceAmountUsed(0)
                          } finally {
                            setLoadingSupplierBalance(false)
                          }
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
                  Total Amount (Rs.) <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('totalAmount', { 
                    required: 'Total amount is required',
                    min: { value: 0, message: 'Amount must be positive' }
                  })}
                  type="number"
                  step="0.01"
                  min="0"
                  className={`w-full px-3 py-2 bg-gray-100 text-gray-600 border-2 border-gray-300 rounded-lg cursor-not-allowed ${
                    errors.totalAmount ? 'border-red-300' : ''
                  }`}
                  placeholder="0.00"
                  readOnly
                />
                {errors.totalAmount && (
                  <p className="text-red-500 text-xs mt-1">{errors.totalAmount.message}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">Auto-calculated from items</p>
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Product Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          {...register(`items.${index}.name`, { 
                            required: 'Product name is required',
                            onChange: () => setTimeout(() => calculateTotal(), 100)
                          })}
                          className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                            itemErrors?.name ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="Enter product name"
                        />
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
                            min: { value: 1, message: 'Quantity must be at least 1' },
                            onChange: () => setTimeout(() => calculateTotal(), 100)
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
                            min: { value: 0, message: 'Price must be positive' },
                            onChange: () => setTimeout(() => calculateTotal(), 100)
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
              const total = parseFloat(watch('totalAmount')) || 0
              const advanceUsed = advanceAmountUsed || 0
              const cashPayment = parseFloat(watch('paymentAmount') || 0)
              const totalPayment = advanceUsed + cashPayment
              const remaining = total - totalPayment
              const isFullyPaid = totalPayment >= total && total > 0
              const isPartiallyPaid = totalPayment > 0 && totalPayment < total
              const showPaymentFields = advanceUsed < total // Only show payment fields if advance doesn't fully cover
              
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
                        isFullyPaid 
                          ? 'bg-green-100 text-green-700' 
                          : isPartiallyPaid 
                            ? 'bg-yellow-100 text-yellow-700' 
                            : 'bg-gray-100 text-gray-700'
                      }`}>
                        {isFullyPaid ? '✓ Fully Paid' : isPartiallyPaid ? '⚠ Partially Paid' : 'Unpaid'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600 text-xs mb-1">Invoice Total</p>
                        <p className="text-lg font-bold text-gray-900">Rs. {total.toLocaleString()}</p>
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
                          {remaining > 0 ? 'Remaining' : 'Status'}
                        </p>
                        <p className={`text-lg font-bold ${
                          remaining > 0 ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {remaining > 0 ? `Rs. ${remaining.toLocaleString()}` : '✓ Paid'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Payment Input Fields - Only show if not fully covered by advance */}
                  {!isFullyPaid || cashPayment > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Payment Status - Only show if advance doesn't fully cover */}
                      {showPaymentFields && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Payment Status <span className="text-red-500">*</span>
                          </label>
                          <select
                            {...register('paymentStatus', { 
                              required: showPaymentFields ? 'Please select payment status' : false 
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
                      )}

                      {/* Cash Payment Amount - Show if payment status is not 'unpaid' and advance doesn't fully cover */}
                      {showPaymentFields && watch('paymentStatus') !== 'unpaid' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Cash/Bank Payment (Rs.)
                            {watch('paymentStatus') === 'paid' || watch('paymentStatus') === 'partial' ? <span className="text-red-500">*</span> : ''}
                          </label>
                          <input
                            {...register('paymentAmount', {
                              required: showPaymentFields && watch('paymentStatus') !== 'unpaid' && watch('paymentStatus') !== '' ? 'Cash payment is required' : false,
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

                      {/* Payment Account - Only show if cash payment > 0 and advance doesn't fully cover */}
                      {showPaymentFields && cashPayment > 0 && (
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
                  ) : (
                    // Fully paid with advance - show simple confirmation
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-700">
                        ✓ Invoice fully paid using advance balance. No additional payment required.
                      </p>
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
      </div>
    </ModernLayout>
  )
}

export default AddPurchasePage

