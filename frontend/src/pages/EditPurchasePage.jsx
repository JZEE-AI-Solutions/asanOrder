import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'
import { useTenant } from '../hooks'

const EditPurchasePage = () => {
  const navigate = useNavigate()
  const { invoiceId } = useParams()
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [categories, setCategories] = useState([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [newCategoryInputs, setNewCategoryInputs] = useState({})
  
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
            : [{ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '' }]
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
      const payload = {
        invoiceNumber: data.invoiceNumber?.trim() || undefined,
        supplierName: data.supplierName || null,
        invoiceDate: data.invoiceDate,
        totalAmount: parseFloat(data.totalAmount) || calculateTotal(),
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
        })
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
                  Total Amount (Rs.) *
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
                <p className="text-xs text-gray-600 mt-1">Auto-calculated from items</p>
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
                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Product Name *
                        </label>
                        <input
                          {...register(`items.${index}.name`, { 
                            required: 'Product name is required',
                            onChange: () => setTimeout(() => calculateTotal(), 100)
                          })}
                          className="input-field bg-white text-gray-900 border-2"
                          placeholder="Enter product name"
                        />
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

