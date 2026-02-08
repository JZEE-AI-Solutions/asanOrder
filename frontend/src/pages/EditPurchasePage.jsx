import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { ArrowLeftIcon, PlusIcon, TrashIcon, CurrencyDollarIcon, PencilIcon, Squares2X2Icon, RectangleStackIcon, XMarkIcon } from '@heroicons/react/24/outline'
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
  const [selectedProducts, setSelectedProducts] = useState({}) // index -> product object
  const [productVariants, setProductVariants] = useState({}) // index -> variants[]
  const [showCreateProductModal, setShowCreateProductModal] = useState(false)
  /** When opening Create Product from a purchase row: that row index; after create we auto-select the new product */
  const [createProductContextIndex, setCreateProductContextIndex] = useState(null)
  const [createProductPrefillName, setCreateProductPrefillName] = useState('')
  const [createProductSku, setCreateProductSku] = useState('')
  const [createProductCategory, setCreateProductCategory] = useState('')
  const [createProductShowNewCategory, setCreateProductShowNewCategory] = useState(false)
  /** Product row index showing the "Create new variant (in catalog)" expandable form */
  const [addVariantForIndex, setAddVariantForIndex] = useState(null)
  const [isCreatingVariant, setIsCreatingVariant] = useState(false)
  const [newVariantInputsByIndex, setNewVariantInputsByIndex] = useState({})
  const [selectedVariants, setSelectedVariants] = useState({}) // index -> variant object
  const [variantInputs, setVariantInputs] = useState({}) // index -> {color, size}
  const [paymentsViewMode, setPaymentsViewMode] = useState('card') // 'card' | 'grid' – card is mobile-friendly

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
    setValue,
    getValues,
    reset
  } = useForm({
    defaultValues: {
      invoiceNumber: '',
      supplierName: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      totalAmount: 0,
      notes: '',
      items: [{ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '', productId: null, productVariantId: null, color: '', size: '' }],
      returnItems: []
    }
  })

  // Fetch categories in background (non-blocking); used for category dropdowns when adding/editing items
  useEffect(() => {
    if (!tenant?.id) return
    let cancelled = false
    setLoadingCategories(true)
    api.get(`/products/tenant/${tenant.id}`)
      .then((response) => {
        if (cancelled) return
        const products = response.data.products || []
        const uniqueCategories = [...new Set(products.map(p => p.category).filter(Boolean))]
        setCategories(uniqueCategories.sort())
      })
      .catch((error) => {
        if (!cancelled) console.error('Failed to fetch categories:', error)
      })
      .finally(() => {
        if (!cancelled) setLoadingCategories(false)
      })
    return () => { cancelled = true }
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
          items: (() => {
            if (!invoice.purchaseItems || invoice.purchaseItems.length === 0) {
              return [{ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '', productId: null, productVariantId: null, color: '', size: '' }]
            }
            const items = invoice.purchaseItems.map((item) => {
              const variant = item.productVariant
              return {
                id: item.id,
                name: item.name || '',
                quantity: item.quantity || 1,
                purchasePrice: item.purchasePrice || 0,
                sku: item.sku || '',
                category: item.category || '',
                description: item.description || '',
                productId: item.productId || null,
                productVariantId: item.productVariantId || null,
                color: variant?.color ?? item.color ?? '',
                size: variant?.size ?? item.size ?? ''
              }
            })
            const priceByProductId = {}
            items.forEach((item) => {
              const pid = item.productId || item.name
              if (pid && priceByProductId[pid] === undefined) priceByProductId[pid] = item.purchasePrice ?? 0
            })
            items.forEach((item) => {
              const pid = item.productId || item.name
              if (pid && priceByProductId[pid] !== undefined) item.purchasePrice = priceByProductId[pid]
            })
            return items
          })(),
          returnItems: returnItems
        })
        // Sync color/size from API into form
        invoice.purchaseItems.forEach((pi, idx) => {
          const variant = pi.productVariant
          const color = variant?.color ?? pi.color ?? ''
          const size = variant?.size ?? pi.size ?? ''
          if (color) setValue(`items.${idx}.color`, color, { shouldValidate: false })
          if (size !== undefined && size !== null) setValue(`items.${idx}.size`, size, { shouldValidate: false })
        })

        // Show form immediately; load product/variant data in background (no blocking)
        setLoading(false)
        if (invoice.purchaseItems && invoice.purchaseItems.length > 0) {
          invoice.purchaseItems.forEach((item, idx) => {
            if (!item.productId) return
            ;(async () => {
              try {
                const productRes = await api.get(`/product/${item.productId}`)
                const product = productRes.data?.product
                if (product) {
                  setSelectedProducts(prev => ({ ...prev, [idx]: product }))
                  if (product.hasVariants) {
                    const variantRes = await api.get(`/product/${item.productId}/variants`)
                    setProductVariants(prev => ({ ...prev, [idx]: variantRes.data?.variants || [] }))
                  }
                }
              } catch (e) {
                console.error('Error loading product for item', idx, e)
              }
            })()
          })
        }
      } catch (error) {
        console.error('Failed to fetch invoice:', error)
        toast.error('Failed to load invoice')
        navigate('/business/purchases')
        return
      } finally {
        setLoading(false)
      }
    }

    fetchInvoice()
  }, [invoiceId, navigate, reset, setValue])

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
    append({ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '', productId: null, productVariantId: null, color: '', size: '' })
  }

  /** Group consecutive items by product (productId or name). Same as Add Purchase. */
  const getProductGroups = () => {
    const items = watchedItems || []
    const groups = []
    let current = null
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const key = item?.productId ?? `name:${(item?.name || '').trim()}`
      if (!current || current.key !== key) {
        current = { key, indices: [i] }
        groups.push(current)
      } else {
        current.indices.push(i)
      }
    }
    return groups
  }

  /** Add a new variant line (same product). New line index = current length (before append). */
  const addVariantLine = (sourceIndex) => {
    const template = watch('items')[sourceIndex]
    const product = selectedProducts[sourceIndex]
    const newIndex = fields.length
    append({
      name: template?.name || '',
      quantity: 1,
      purchasePrice: template?.purchasePrice ?? 0,
      sku: '',
      category: template?.category || '',
      description: '',
      productId: template?.productId ?? null,
      productVariantId: null,
      color: '',
      size: ''
    })
    if (product) {
      setSelectedProducts(prev => ({ ...prev, [newIndex]: product }))
      setProductVariants(prev => ({ ...prev, [newIndex]: productVariants[sourceIndex] || [] }))
    }
    setTimeout(() => calculateTotal(), 100)
  }

  /** Remove entire product group. Same as Add Purchase. */
  const removeProductGroup = (indices) => {
    if (indices.length === 0) return
    const isOnlyGroup = indices.length === fields.length
    if (isOnlyGroup) {
      const sorted = [...indices].sort((a, b) => b - a)
      sorted.forEach(idx => remove(idx))
      setSelectedProducts({})
      setProductVariants({})
      setSelectedVariants({})
      setVariantInputs({})
      setAddVariantForIndex(null)
      setNewVariantInputsByIndex({})
      append({ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '', productId: null, productVariantId: null, color: '', size: '' })
    } else {
      const sorted = [...indices].sort((a, b) => b - a)
      sorted.forEach(idx => removeItem(idx))
    }
    setTimeout(() => calculateTotal(), 100)
  }

  const removeItem = (index) => {
    if (fields.length <= 1) {
      toast.error('At least one item is required')
      return
    }
    remove(index)
    const upd = (prev) => {
      const next = {}
      Object.entries(prev).forEach(([k, v]) => {
        const ki = parseInt(k, 10)
        if (ki < index) next[ki] = v
        if (ki > index) next[ki - 1] = v
      })
      return next
    }
    setSelectedProducts(upd)
    setProductVariants(upd)
    setSelectedVariants(upd)
    setVariantInputs(upd)
    setNewVariantInputsByIndex(upd)
    if (addVariantForIndex === index) setAddVariantForIndex(null)
    else if (addVariantForIndex > index) setAddVariantForIndex(addVariantForIndex - 1)
    setTimeout(() => calculateTotal(), 100)
  }

  // Fetch variants for a product
  const fetchProductVariants = async (index, productId) => {
    if (!productId) {
      setProductVariants(prev => ({ ...prev, [index]: [] }))
      return
    }

    try {
      const response = await api.get(`/product/${productId}/variants`)
      if (response.data.variants) {
        setProductVariants(prev => ({ ...prev, [index]: response.data.variants || [] }))
      }
    } catch (error) {
      console.error('Error fetching variants:', error)
      setProductVariants(prev => ({ ...prev, [index]: [] }))
    }
  }

  // Helper function to generate short SKU from product name
  const generateProductSku = (productName) => {
    if (!productName) return ''
    // Take first 2-3 letters of each word, max 8 characters total
    const words = productName
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '') // Remove special characters
      .split(/\s+/)
      .filter(w => w.length > 0)
    
    if (words.length === 0) return ''
    
    // Take first 2-3 letters of each word
    let sku = words.map(word => word.substring(0, 3)).join('')
    
    // Limit to 8 characters max
    if (sku.length > 8) {
      sku = sku.substring(0, 8)
    }
    
    return sku
  }

  // Helper function to generate short variant SKU
  const generateVariantSku = (productSku, color, size) => {
    if (!color) return productSku || ''
    
    // Get short color code (first 2-3 uppercase letters, max 4 chars)
    const colorCode = color
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .substring(0, 4)
    
    if (!colorCode) return productSku || ''
    
    // Get short size code if exists (first 1-2 characters, max 2 chars)
    let sizeCode = ''
    if (size && size.trim()) {
      sizeCode = size
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 2)
    }
    
    // Format: {COLOR} or {COLOR}-{SIZE} (max 10 chars total)
    if (sizeCode) {
      const variantSku = `${colorCode}-${sizeCode}`
      return variantSku.length > 10 ? variantSku.substring(0, 10) : variantSku
    } else {
      return colorCode.length > 8 ? colorCode.substring(0, 8) : colorCode
    }
  }

  // Handle product selection
  const handleProductSelect = (index, product) => {
    setSelectedProducts(prev => ({ ...prev, [index]: product }))
    setValue(`items.${index}.name`, product.name)
    setValue(`items.${index}.productId`, product.id)
    setValue(`items.${index}.category`, product.category || '')
    // Auto-generate SKU if product doesn't have one, otherwise use existing
    const productSku = product.sku || generateProductSku(product.name)
    setValue(`items.${index}.sku`, productSku)
    
    // If product has variants, fetch them
    if (product.hasVariants) {
      fetchProductVariants(index, product.id)
    } else {
      setProductVariants(prev => ({ ...prev, [index]: [] }))
      setValue(`items.${index}.productVariantId`, null)
      setValue(`items.${index}.color`, '')
      setValue(`items.${index}.size`, '')
    }
  }

  // Handle variant selection or creation
  const handleVariantSelect = async (index, variant) => {
    if (variant && variant.id) {
      setValue(`items.${index}.productVariantId`, variant.id)
      setValue(`items.${index}.color`, variant.color)
      setValue(`items.${index}.size`, variant.size || '')
      // Use variant SKU if exists, otherwise auto-generate
      const productSku = watch(`items.${index}.sku`) || selectedProducts[index]?.sku || ''
      const variantSku = variant.sku || generateVariantSku(productSku, variant.color, variant.size)
      setValue(`items.${index}.sku`, variantSku)
    }
  }

  // Create new variant (from row color/size or from "Create new variant" inline form via newVariantInputsByIndex)
  const handleCreateVariant = async (index) => {
    const product = selectedProducts[index]
    const fromInlineForm = addVariantForIndex === index
    const color = fromInlineForm
      ? (newVariantInputsByIndex[index]?.color || '').trim()
      : watch(`items.${index}.color`)?.trim()
    const size = fromInlineForm
      ? (newVariantInputsByIndex[index]?.size || '').trim()
      : watch(`items.${index}.size`)?.trim()

    if (!product || !product.id) {
      toast.error('Please select a product first')
      return
    }

    if (!color) {
      toast.error('Color is required')
      return
    }

    if (product.isStitched && !size) {
      toast.error('Size is required for stitched products')
      return
    }

    setIsCreatingVariant(true)
    try {
      const response = await api.post(`/product/${product.id}/variants`, {
        color,
        size: size || null,
        currentQuantity: 0,
        isActive: true
      })

      if (response.data.variant) {
        toast.success('Variant created successfully')
        await fetchProductVariants(index, product.id)
        handleVariantSelect(index, response.data.variant)
        if (fromInlineForm) {
          setAddVariantForIndex(null)
          setNewVariantInputsByIndex(prev => {
            const next = { ...prev }
            delete next[index]
            return next
          })
        }
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Failed to create variant'
      toast.error(errorMsg)
    } finally {
      setIsCreatingVariant(false)
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
    // Validate items; keep formIndex so we can look up productVariants by form position
    const itemsWithFormIndex = (data.items || []).map((item, formIndex) => ({ ...item, formIndex }))
    const validItems = itemsWithFormIndex.filter(item =>
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
      // Resolve productId per line: use same product group so variant lines never send productId null
      const productIdByGroup = {}
      validItems.forEach((it, i) => {
        const key = (it.productId && String(it.productId)) || `name:${(it.name || '').trim()}`
        if (!productIdByGroup[key] && it.productId) productIdByGroup[key] = it.productId
      })
      validItems.forEach((it) => {
        const key = (it.productId && String(it.productId)) || `name:${(it.name || '').trim()}`
        if (!productIdByGroup[key]) productIdByGroup[key] = validItems.find(o => (o.name || '').trim() === (it.name || '').trim() && o.productId)?.productId || null
      })
      const payload = {
        invoiceNumber: data.invoiceNumber?.trim() || undefined,
        supplierName: data.supplierName || null,
        invoiceDate: data.invoiceDate,
        totalAmount: netTotal, // Net amount (purchases - returns)
        notes: data.notes || null,
        products: validItems.map((item, mapIndex) => {
          const formIndex = item.formIndex
          // Use submitted item's color/size so each line sends its own variant
          const color = (item.color ?? '').toString().trim() || null
          const size = (item.size ?? '').toString().trim() || null
          const categoryValue = item.newCategory?.trim()
            ? item.newCategory.trim()
            : (item.category?.trim() || null)

          const groupKey = (item.productId && String(item.productId)) || `name:${(item.name || '').trim()}`
          const productId = item.productId || productIdByGroup[groupKey] || null

          const fallbackIndex = validItems.findIndex(o => (o.name || '').trim() === (item.name || '').trim() && o.productId)
          const variantsForLine = productVariants[formIndex] || productVariants[fallbackIndex]
          let productVariantId = item.productVariantId || null
          if (productId && color) {
            if (variantsForLine && Array.isArray(variantsForLine)) {
              const matchingVariant = variantsForLine.find(v =>
                v.color === color && (v.size || '') === (size || '')
              )
              if (matchingVariant) productVariantId = matchingVariant.id
              else productVariantId = null
            } else {
              productVariantId = null
            }
          }

          return {
            id: item.id,
            name: (item.name ?? '').toString().trim(),
            quantity: parseInt(item.quantity, 10),
            purchasePrice: parseFloat(item.purchasePrice),
            sku: item.sku?.trim() || null,
            category: categoryValue,
            description: item.description?.trim() || null,
            productId,
            productVariantId: productVariantId,
            color,
            size
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

      // Debug: why productId/productVariantId not passing for second line
      console.log('[EditPurchase] Save payload', {
        validItems: validItems.map((it, i) => ({ i, formIndex: it.formIndex, name: (it.name || '').trim(), productId: it.productId, color: it.color })),
        productIdByGroup,
        products: payload.products.map((p, i) => ({ i, name: p.name, productId: p.productId, productVariantId: p.productVariantId, color: p.color }))
      })
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
      <div className="max-w-6xl mx-auto py-4 sm:py-8 px-3 sm:px-6 lg:px-8 min-h-screen">
        {/* Header - touch-friendly back and title */}
        <div className="mb-6 sm:mb-8">
          <button
            type="button"
            onClick={() => navigate('/business/purchases')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors min-h-[44px] -ml-2 pl-2 pr-3 rounded-lg touch-manipulation active:bg-gray-100"
            aria-label="Back to Purchases"
          >
            <ArrowLeftIcon className="h-6 w-6 sm:h-5 sm:w-5 mr-2 flex-shrink-0" />
            <span className="text-base sm:text-sm">Back to Purchases</span>
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Edit Purchase Invoice</h1>
          <p className="text-gray-600 mt-1 sm:mt-2 text-sm sm:text-base">Update invoice details and products</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
          {/* Invoice Details Section - mobile: single column, larger touch targets */}
          <div className="card p-4 sm:p-6 rounded-xl">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 sm:mb-6">Invoice Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="form-group">
                <label className="block text-sm font-bold text-gray-900 mb-1.5">
                  Invoice Number *
                </label>
                <input
                  {...register('invoiceNumber', { required: 'Invoice number is required' })}
                  className="input-field bg-white text-gray-900 border-2 min-h-[48px] text-base px-4 py-3 rounded-lg w-full"
                  placeholder="Enter invoice number"
                  autoComplete="off"
                />
                {errors.invoiceNumber && (
                  <p className="text-red-500 text-xs mt-1">{errors.invoiceNumber.message}</p>
                )}
              </div>

              <div className="form-group">
                <label className="block text-sm font-bold text-gray-900 mb-1.5">
                  Supplier Name
                </label>
                <input
                  {...register('supplierName')}
                  className="input-field bg-white text-gray-900 border-2 min-h-[48px] text-base px-4 py-3 rounded-lg w-full"
                  placeholder="Enter supplier name"
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label className="block text-sm font-bold text-gray-900 mb-1.5">
                  Invoice Date *
                </label>
                <input
                  {...register('invoiceDate', { required: 'Invoice date is required' })}
                  type="date"
                  className="input-field bg-white text-gray-900 border-2 min-h-[48px] text-base px-4 py-3 rounded-lg w-full"
                />
                {errors.invoiceDate && (
                  <p className="text-red-500 text-xs mt-1">{errors.invoiceDate.message}</p>
                )}
              </div>

              <div className="form-group">
                <label className="block text-sm font-bold text-gray-900 mb-1.5">
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
                  className="input-field bg-white text-gray-900 border-2 min-h-[48px] text-base px-4 py-3 rounded-lg w-full"
                  placeholder="0.00"
                  readOnly
                />
                {errors.totalAmount && (
                  <p className="text-red-500 text-xs mt-1">{errors.totalAmount.message}</p>
                )}
                {(() => {
                  const totals = calculateTotal()
                  return (
                    <div className="text-xs text-gray-600 mt-1.5 space-y-0.5">
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

            <div className="form-group mt-4 sm:mt-6">
              <label className="block text-sm font-bold text-gray-900 mb-1.5">
                Notes
              </label>
              <textarea
                {...register('notes')}
                className="input-field bg-white text-gray-900 border-2 min-h-[80px] text-base px-4 py-3 rounded-lg w-full resize-y"
                rows={3}
                placeholder="Enter additional notes"
              />
            </div>
          </div>

          {/* Products Section - mobile friendly */}
          <div className="card p-4 sm:p-6 rounded-xl">
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Products</h2>
              <button
                type="button"
                onClick={addItem}
                className="btn-primary flex items-center justify-center text-sm min-h-[44px] px-4 py-3 rounded-xl touch-manipulation"
              >
                <PlusIcon className="h-5 w-5 sm:h-4 sm:w-4 mr-2 sm:mr-1" />
                Add Product
              </button>
            </div>

            <div className="space-y-4">
              {getProductGroups().map((group, groupIndex) => {
                const firstIndex = group.indices[0]
                const variantIndices = group.indices.slice(1)
                const field = fields[firstIndex]
                if (!field) return null
                const index = firstIndex
                const itemErrors = errors.items?.[index]
                const item = watchedItems[index]
                const itemTotal = (parseFloat(item?.quantity) || 0) * (parseFloat(item?.purchasePrice) || 0)
                const productAtFirst = selectedProducts[firstIndex]
                const showVariantsSection = !!(productAtFirst?.hasVariants || productAtFirst?.isStitched)

                return (
                  <div key={field.id} className="border rounded-xl p-4 sm:p-5 bg-white border-gray-200 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h5 className="font-semibold text-gray-900">Product {groupIndex + 1}</h5>
                      {fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeProductGroup(group.indices)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          aria-label="Remove product"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="form-group relative flex flex-col md:flex-row gap-2 md:gap-0 md:items-end">
                        <div className="relative flex-1">
                          <label className="block text-sm font-bold text-gray-900 mb-2">
                            Product Name *
                          </label>
                          <input
                            {...register(`items.${index}.name`, {
                              required: 'Product name is required',
                              onChange: (e) => {
                                const productName = e.target.value.trim()
                                const fieldKey = `items.${index}`

                                if (productSearchTimeouts[fieldKey]) {
                                  clearTimeout(productSearchTimeouts[fieldKey])
                                  delete productSearchTimeouts[fieldKey]
                                }

                                setTimeout(() => calculateTotal(), 100)

                                if (productName.length >= 2) {
                                  const lastQuery = lastSearchQueries[fieldKey]
                                  if (lastQuery === productName && productSuggestions[fieldKey] !== undefined) {
                                    setShowProductSuggestions(prev => ({ ...prev, [fieldKey]: true }))
                                    return
                                  }

                                  const timeout = setTimeout(async () => {
                                    const currentValue = watch(`items.${index}.name`)?.trim()
                                    if (currentValue !== productName) return
                                    try {
                                      const response = await api.get(`/products/search/${encodeURIComponent(productName)}`)
                                      if (response.data.success) {
                                        setLastSearchQueries(prev => ({ ...prev, [fieldKey]: productName }))
                                        setProductSuggestions(prev => ({ ...prev, [fieldKey]: response.data.products || [] }))
                                        setShowProductSuggestions(prev => ({ ...prev, [fieldKey]: true }))
                                      }
                                    } catch (error) {
                                      if (error.code !== 'ERR_CANCELED' && error.code !== 'ERR_INSUFFICIENT_RESOURCES') {
                                        console.error('Error searching products:', error)
                                      }
                                      setProductSuggestions(prev => ({ ...prev, [fieldKey]: [] }))
                                      setShowProductSuggestions(prev => ({ ...prev, [fieldKey]: true }))
                                    }
                                  }, 500)
                                  setProductSearchTimeouts(prev => ({ ...prev, [fieldKey]: timeout }))
                                } else {
                                  setProductSuggestions(prev => {
                                    const next = { ...prev }
                                    delete next[fieldKey]
                                    return next
                                  })
                                  setShowProductSuggestions(prev => {
                                    const next = { ...prev }
                                    delete next[fieldKey]
                                    return next
                                  })
                                  setLastSearchQueries(prev => {
                                    const next = { ...prev }
                                    delete next[fieldKey]
                                    return next
                                  })
                                }
                              }
                            })}
                            className="input-field bg-white text-gray-900 border-2 min-h-[44px] text-base px-3 py-2.5 rounded-lg w-full"
                            placeholder="Search or type product name"
                            autoComplete="off"
                            onFocus={() => {
                              const productName = watch(`items.${index}.name`)?.trim()
                              const fieldKey = `items.${index}`
                              if (productName && productName.length >= 2 && productSuggestions[fieldKey] !== undefined) {
                                setShowProductSuggestions(prev => ({ ...prev, [fieldKey]: true }))
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                setShowProductSuggestions(prev => ({ ...prev, [`items.${index}`]: false }))
                              }, 200)
                            }}
                          />
                          {/* Product Search Dropdown: results or "No results - Create product" */}
                          {showProductSuggestions[`items.${index}`] && productSuggestions[`items.${index}`] !== undefined && (
                            <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                              {productSuggestions[`items.${index}`].length > 0 ? (
                                productSuggestions[`items.${index}`].map((product) => (
                                  <div
                                    key={product.id}
                                    className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                    onMouseDown={(e) => {
                                      e.preventDefault()
                                      handleProductSelect(index, product)
                                      if (product.lastPurchasePrice) {
                                        setValue(`items.${index}.purchasePrice`, product.lastPurchasePrice)
                                      }
                                      setShowProductSuggestions(prev => ({ ...prev, [`items.${index}`]: false }))
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
                                    {product.hasVariants && (
                                      <div className="text-xs text-blue-600 mt-1">Has Variants</div>
                                    )}
                                  </div>
                                ))
                              ) : (
                                (() => {
                                  const query = watch(`items.${index}.name`)?.trim() || ''
                                  if (query.length < 2) return null
                                  return (
                                    <div
                                      className="px-4 py-3 border-b border-gray-100 bg-amber-50 text-amber-900"
                                      onMouseDown={(e) => {
                                        e.preventDefault()
                                        setCreateProductContextIndex(index)
                                        setCreateProductPrefillName(query)
                                        setCreateProductSku(generateProductSku(query))
                                        setCreateProductCategory('')
                                        setCreateProductShowNewCategory(false)
                                        setShowCreateProductModal(true)
                                        setShowProductSuggestions(prev => ({ ...prev, [`items.${index}`]: false }))
                                      }}
                                    >
                                      <p className="text-sm font-medium">No products found</p>
                                      <p className="text-sm text-amber-700 mt-1">
                                        Create product &quot;{query}&quot; and use it here?
                                      </p>
                                      <button
                                        type="button"
                                        className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-800 underline"
                                      >
                                        Create &quot;{query}&quot;
                                      </button>
                                    </div>
                                  )
                                })()
                              )}
                            </div>
                          )}
                          {itemErrors?.name && (
                            <p className="text-red-500 text-xs mt-1">{itemErrors.name.message}</p>
                          )}
                          {selectedProducts[index] && (
                            <p className="text-xs text-gray-500 mt-1">
                              Selected: {selectedProducts[index].name}
                              {selectedProducts[index].hasVariants && ' (Has Variants)'}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const name = watch(`items.${index}.name`) || ''
                            setCreateProductContextIndex(index)
                            setCreateProductPrefillName(name)
                            setCreateProductSku(generateProductSku(name))
                            setCreateProductCategory('')
                            setCreateProductShowNewCategory(false)
                            setShowCreateProductModal(true)
                          }}
                          className="min-h-[44px] px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium whitespace-nowrap touch-manipulation"
                          title="Create new product and use in this row"
                        >
                          + New
                        </button>
                      </div>

                      {/* Variant Selection - Show only when product has variants AND variants section is not used */}
                      {!showVariantsSection && selectedProducts[index] && selectedProducts[index].hasVariants && (
                        <>
                          <div className="form-group">
                            <label className="block text-sm font-bold text-gray-900 mb-2">
                              Color <span className="text-red-500">*</span>
                            </label>
                            <input
                              {...register(`items.${index}.color`, {
                                required: selectedProducts[index]?.hasVariants ? 'Color is required' : false
                              })}
                              onChange={(e) => {
                                const color = e.target.value
                                setValue(`items.${index}.color`, color, { shouldValidate: true })
                                setValue(`items.${index}.productVariantId`, null)
                                
                                // Auto-generate variant SKU when color/size changes
                                if (selectedProducts[index] && (selectedProducts[index].hasVariants || selectedProducts[index].isStitched)) {
                                  const productSku = watch(`items.${index}.sku`) || selectedProducts[index]?.sku || ''
                                  const size = watch(`items.${index}.size`) || ''
                                  const generatedSku = generateVariantSku(productSku, color, size)
                                  const currentSku = watch(`items.${index}.sku`)
                                  // Only auto-generate if SKU looks like it was auto-generated (contains color/size pattern)
                                  if (!currentSku || currentSku.includes('-') || currentSku === productSku) {
                                    setValue(`items.${index}.sku`, generatedSku)
                                  }
                                }
                              }}
                              className="input-field bg-white text-gray-900 border-2 min-h-[44px] text-base px-3 py-2.5 rounded-lg w-full"
                              placeholder="Enter color"
                              list={`color-options-${index}`}
                            />
                            {productVariants[index] && productVariants[index].length > 0 && (
                              <datalist id={`color-options-${index}`}>
                                {[...new Set(productVariants[index].map(v => v.color))].map(color => (
                                  <option key={color} value={color} />
                                ))}
                              </datalist>
                            )}
                          </div>
                          <div className="form-group">
                            <label className="block text-sm font-bold text-gray-900 mb-2">
                              Size {selectedProducts[index]?.isStitched && <span className="text-red-500">*</span>}
                            </label>
                            <input
                              {...register(`items.${index}.size`, {
                                required: selectedProducts[index]?.isStitched ? 'Size is required for stitched products' : false
                              })}
                              onChange={(e) => {
                                const size = e.target.value
                                setValue(`items.${index}.size`, size, { shouldValidate: true })
                                setValue(`items.${index}.productVariantId`, null)
                                
                                // Auto-generate variant SKU when color/size changes
                                if (selectedProducts[index] && (selectedProducts[index].hasVariants || selectedProducts[index].isStitched)) {
                                  const productSku = watch(`items.${index}.sku`) || selectedProducts[index]?.sku || ''
                                  const color = watch(`items.${index}.color`) || ''
                                  const generatedSku = generateVariantSku(productSku, color, size)
                                  const currentSku = watch(`items.${index}.sku`)
                                  // Only auto-generate if SKU looks like it was auto-generated (contains color/size pattern)
                                  if (!currentSku || currentSku.includes('-') || currentSku === productSku) {
                                    setValue(`items.${index}.sku`, generatedSku)
                                  }
                                }
                              }}
                              className="input-field bg-white text-gray-900 border-2 min-h-[44px] text-base px-3 py-2.5 rounded-lg w-full"
                              placeholder={selectedProducts[index]?.isStitched ? "Required" : "Optional"}
                              list={`size-options-${index}`}
                            />
                            {productVariants[index] && productVariants[index].length > 0 && (
                              <datalist id={`size-options-${index}`}>
                                {[...new Set(productVariants[index].map(v => v.size).filter(Boolean))].map(size => (
                                  <option key={size} value={size} />
                                ))}
                              </datalist>
                            )}
                          </div>
                          <div className="form-group">
                            <button
                              type="button"
                              onClick={() => handleCreateVariant(index)}
                              className="w-full px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium"
                            >
                              {(() => {
                                const color = watch(`items.${index}.color`)?.trim()
                                const size = watch(`items.${index}.size`)?.trim() || ''
                                const hasMatch = productVariants[index]?.some(v => 
                                  v.color === color && (v.size || '') === size
                                )
                                return hasMatch ? 'Variant Exists - Click to Use' : 'Create New Variant'
                              })()}
                            </button>
                          </div>
                        </>
                      )}

                      {/* Quantity & price: only when product has no variants/stitched; when it has variants, qty/price live in variant cards below */}
                      {!showVariantsSection && (
                        <>
                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Quantity *
                        </label>
                        <input
                          {...register(`items.${index}.quantity`, { 
                            required: !showVariantsSection ? 'Quantity is required' : false,
                            min: { value: 1, message: 'Quantity must be at least 1' },
                            onChange: () => setTimeout(() => calculateTotal(), 100)
                          })}
                          type="number"
                          min="1"
                          step="1"
                          className="input-field bg-white text-gray-900 border-2 min-h-[44px] text-base px-3 py-2.5 rounded-lg w-full"
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
                            required: !showVariantsSection ? 'Purchase price is required' : false,
                            min: { value: 0, message: 'Price must be positive' },
                            onChange: () => setTimeout(() => calculateTotal(), 100)
                          })}
                          type="number"
                          step="0.01"
                          min="0"
                          className="input-field bg-white text-gray-900 border-2 min-h-[44px] text-base px-3 py-2.5 rounded-lg w-full"
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
                        </>
                      )}

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          SKU <span className="text-xs text-gray-500">(auto-generated, editable)</span>
                        </label>
                        <input
                          {...register(`items.${index}.sku`)}
                          className="input-field bg-white text-gray-900 border-2 min-h-[44px] text-base px-3 py-2.5 rounded-lg w-full"
                          placeholder="SKU will be auto-generated"
                        />
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Category
                          {selectedProducts[index] && (selectedProducts[index].hasVariants || selectedProducts[index].isStitched) && (
                            <span className="text-xs text-gray-500 ml-2">(from product)</span>
                          )}
                        </label>
                        {loadingCategories ? (
                          <div className="w-full px-3 py-2 bg-gray-50 text-gray-500 border-2 border-gray-300 rounded-lg flex items-center">
                            <LoadingSpinner size="sm" />
                            <span className="ml-2 text-xs">Loading...</span>
                          </div>
                        ) : selectedProducts[index] && (selectedProducts[index].hasVariants || selectedProducts[index].isStitched) ? (
                          // Read-only category for products with variants or stitched products
                          <input
                            type="text"
                            value={selectedProducts[index].category || ''}
                            readOnly
                            disabled
                            className="input-field bg-gray-100 text-gray-600 border-2 cursor-not-allowed"
                            placeholder="Category from product"
                          />
                        ) : (
                          <>
                            <select
                              {...register(`items.${index}.category`)}
                              onChange={(e) => {
                                const value = e.target.value
                                setValue(`items.${index}.category`, value, { shouldValidate: true })
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
                              className="input-field bg-white text-gray-900 border-2 min-h-[44px] text-base px-3 py-2.5 rounded-lg w-full"
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

                    {/* Variants section: one price for all variants, quantity per row */}
                    {showVariantsSection && (
                      <div className="mt-4 space-y-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Variants</p>
                        <p className="text-sm text-gray-600">Add each variant (color/size) with quantity. Price is the same for all variants.</p>
                        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 mb-3">
                          <label className="text-sm font-medium text-gray-700">Price (Rs.) – same for all variants</label>
                          <input
                            {...register(`items.${firstIndex}.purchasePrice`, { required: true, min: 0, onChange: (e) => {
                              const v = parseFloat(e.target.value) || 0
                              group.indices.forEach((i) => setValue(`items.${i}.purchasePrice`, v, { shouldValidate: true }))
                              setTimeout(() => calculateTotal(), 100)
                            } })}
                            type="number"
                            step="0.01"
                            min="0"
                            className="min-h-[44px] w-28 px-3 py-2.5 text-sm border border-gray-300 rounded-lg"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="space-y-3">
                          {group.indices.map((groupIdxPos, groupIdx) => {
                            const idx = group.indices[groupIdx]
                            const vField = fields[idx]
                            const vItem = watchedItems[idx]
                            const groupPrice = parseFloat(watchedItems[firstIndex]?.purchasePrice) || 0
                            const vTotal = (parseFloat(vItem?.quantity) || 0) * groupPrice
                            const vProduct = selectedProducts[idx]
                            if (!vField) return null
                            return (
                              <div key={vField.id} className="flex flex-col sm:flex-row sm:flex-wrap gap-3 p-3 sm:p-4 rounded-xl bg-gray-50 border border-gray-200">
                                <div className="w-full sm:flex-1 sm:min-w-[140px] flex flex-col gap-2">
                                  <span className="text-xs font-medium text-gray-500" aria-hidden="true">
                                    Variant line {groupIdx + 1}
                                  </span>
                                  {vProduct?.hasVariants || vProduct?.isStitched ? (
                                    <div className="flex flex-col gap-2">
                                      {productVariants[idx]?.length > 0 && (
                                        <div className="flex flex-wrap gap-2 items-center">
                                          <span className="text-xs text-gray-500">Select or type new:</span>
                                          {productVariants[idx]?.map((v) => {
                                            const isSelected = watch(`items.${idx}.productVariantId`) === v.id
                                            return (
                                              <button
                                                key={v.id}
                                                type="button"
                                                onClick={() => handleVariantSelect(idx, v)}
                                                className={`min-h-[44px] text-sm px-3 py-2 rounded-lg border transition-colors touch-manipulation ${
                                                  isSelected ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white hover:border-gray-300'
                                                }`}
                                              >
                                                {v.color}{v.size ? ` · ${v.size}` : ''}
                                              </button>
                                            )
                                          })}
                                        </div>
                                      )}
                                      <div className="flex flex-wrap gap-2 items-center">
                                        <input
                                          {...register(`items.${idx}.color`, { required: vProduct?.hasVariants || vProduct?.isStitched })}
                                          value={watch(`items.${idx}.color`) ?? ''}
                                          onChange={(e) => {
                                            const color = e.target.value
                                            setValue(`items.${idx}.color`, color, { shouldValidate: true })
                                            setValue(`items.${idx}.productVariantId`, null)
                                            const productSku = watch(`items.${idx}.sku`) || vProduct?.sku || ''
                                            const size = watch(`items.${idx}.size`) || ''
                                            setValue(`items.${idx}.sku`, generateVariantSku(productSku, color, size))
                                          }}
                                          className="min-h-[44px] w-24 sm:w-28 px-3 py-2.5 text-sm border border-gray-300 rounded-lg"
                                          placeholder="Color *"
                                          list={productVariants[idx]?.length ? `color-options-edit-${idx}` : undefined}
                                        />
                                        <input
                                          {...register(`items.${idx}.size`)}
                                          onChange={(e) => {
                                            const size = e.target.value
                                            setValue(`items.${idx}.size`, size, { shouldValidate: true })
                                            setValue(`items.${idx}.productVariantId`, null)
                                            const productSku = watch(`items.${idx}.sku`) || vProduct?.sku || ''
                                            const color = watch(`items.${idx}.color`) || ''
                                            setValue(`items.${idx}.sku`, generateVariantSku(productSku, color, size))
                                          }}
                                          className="min-h-[44px] w-20 sm:w-24 px-3 py-2.5 text-sm border border-gray-300 rounded-lg"
                                          placeholder="Size"
                                          list={productVariants[idx]?.length ? `size-options-edit-${idx}` : undefined}
                                        />
                                        {productVariants[idx]?.length > 0 && (
                                          <>
                                            <datalist id={`color-options-edit-${idx}`}>
                                              {[...new Set(productVariants[idx].map(v => v.color))].map(c => (
                                                <option key={c} value={c} />
                                              ))}
                                            </datalist>
                                            <datalist id={`size-options-edit-${idx}`}>
                                              {[...new Set(productVariants[idx].map(v => v.size).filter(Boolean))].map(s => (
                                                <option key={s} value={s} />
                                              ))}
                                            </datalist>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-sm text-gray-500">Same product</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                  <input
                                    {...register(`items.${idx}.quantity`, { required: true, min: 1, onChange: () => setTimeout(() => calculateTotal(), 100) })}
                                    type="number"
                                    min="1"
                                    className="min-h-[44px] w-16 sm:w-20 px-3 py-2.5 text-sm border border-gray-300 rounded-lg"
                                    placeholder="Qty"
                                  />
                                  <span className="text-sm text-gray-600 min-w-[4rem]">Rs. {vTotal.toFixed(2)}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeItem(idx)}
                                  className="min-h-[44px] min-w-[44px] p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg touch-manipulation self-start sm:self-center"
                                  aria-label="Remove variant"
                                >
                                  <TrashIcon className="h-5 w-5" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                          <button
                            type="button"
                            onClick={() => addVariantLine(firstIndex)}
                            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 px-4 py-2.5 text-sm font-medium text-gray-600 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 transition-colors touch-manipulation"
                          >
                            <PlusIcon className="h-4 w-4 shrink-0" />
                            Add variant line
                          </button>
                          {selectedProducts[firstIndex]?.hasVariants && selectedProducts[firstIndex]?.id && (
                            <button
                              type="button"
                              onClick={() => setAddVariantForIndex(addVariantForIndex === firstIndex ? null : firstIndex)}
                              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors touch-manipulation"
                            >
                              <PlusIcon className="h-4 w-4 shrink-0" />
                              Create new variant (in catalog)
                            </button>
                          )}
                        </div>
                        {addVariantForIndex === firstIndex && selectedProducts[firstIndex]?.hasVariants && selectedProducts[firstIndex]?.id && (
                          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-3">
                            <p className="text-sm font-medium text-gray-700">New variant (saved to product catalog)</p>
                            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                              <div className="flex-1 min-w-[120px]">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Color <span className="text-red-500">*</span></label>
                                <input
                                  value={newVariantInputsByIndex[firstIndex]?.color || ''}
                                  onChange={(e) => {
                                    const color = e.target.value
                                    setNewVariantInputsByIndex(prev => ({
                                      ...prev,
                                      [firstIndex]: { ...(prev[firstIndex] || {}), color }
                                    }))
                                  }}
                                  className="w-full min-h-[44px] px-3 py-2.5 text-sm border border-gray-300 rounded-lg"
                                  placeholder="Color"
                                  list={productVariants[firstIndex]?.length ? `color-options-edit-new-${firstIndex}` : undefined}
                                />
                              </div>
                              <div className="flex-1 min-w-[100px]">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Size {selectedProducts[firstIndex]?.isStitched && <span className="text-red-500">*</span>}</label>
                                <input
                                  value={newVariantInputsByIndex[firstIndex]?.size || ''}
                                  onChange={(e) => {
                                    const size = e.target.value
                                    setNewVariantInputsByIndex(prev => ({
                                      ...prev,
                                      [firstIndex]: { ...(prev[firstIndex] || {}), size }
                                    }))
                                  }}
                                  className="w-full min-h-[44px] px-3 py-2.5 text-sm border border-gray-300 rounded-lg"
                                  placeholder={selectedProducts[firstIndex]?.isStitched ? 'Required' : 'Optional'}
                                  list={productVariants[firstIndex]?.length ? `size-options-edit-new-${firstIndex}` : undefined}
                                />
                              </div>
                              {productVariants[firstIndex]?.length > 0 && (
                                <>
                                  <datalist id={`color-options-edit-new-${firstIndex}`}>
                                    {[...new Set(productVariants[firstIndex].map(v => v.color))].map(c => (
                                      <option key={c} value={c} />
                                    ))}
                                  </datalist>
                                  <datalist id={`size-options-edit-new-${firstIndex}`}>
                                    {[...new Set(productVariants[firstIndex].map(v => v.size).filter(Boolean))].map(s => (
                                      <option key={s} value={s} />
                                    ))}
                                  </datalist>
                                </>
                              )}
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleCreateVariant(firstIndex)}
                                  disabled={isCreatingVariant}
                                  className="min-h-[44px] px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 touch-manipulation disabled:opacity-60 disabled:pointer-events-none"
                                >
                                  {isCreatingVariant ? 'Creating…' : (productVariants[firstIndex]?.some(v =>
                                    v.color === (newVariantInputsByIndex[firstIndex]?.color || '').trim() &&
                                    (v.size || '') === (newVariantInputsByIndex[firstIndex]?.size || '').trim()
                                  ) ? 'Use this variant' : 'Add & use')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAddVariantForIndex(null)}
                                  className="min-h-[44px] px-3 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 touch-manipulation"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="form-group mt-4">
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Description
                      </label>
                      <textarea
                        {...register(`items.${index}.description`)}
                        className="input-field bg-white text-gray-900 border-2 w-full min-h-[80px] px-3 py-2.5"
                        rows={2}
                        placeholder="Enter product description (optional)"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Return Items Section - mobile friendly */}
          <div className="card p-4 sm:p-6 rounded-xl">
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Return Items</h2>
              <button
                type="button"
                onClick={() => appendReturn({ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '', reason: 'Purchase invoice return' })}
                className="btn-secondary flex items-center justify-center text-sm min-h-[44px] px-4 py-3 rounded-xl touch-manipulation"
              >
                <PlusIcon className="h-5 w-5 sm:h-4 sm:w-4 mr-2 sm:mr-1" />
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
                          className="input-field bg-white text-gray-900 border-2 min-h-[44px] text-base px-3 py-2.5 rounded-lg w-full"
                          placeholder="Enter SKU (optional)"
                        />
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">
                          Category
                        </label>
                        <select
                          {...register(`returnItems.${index}.category`)}
                          className="input-field bg-white text-gray-900 border-2 min-h-[44px] text-base px-3 py-2.5 rounded-lg w-full"
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
                        className="input-field bg-white text-gray-900 border-2 min-h-[44px] text-base px-3 py-2.5 rounded-lg w-full"
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

          {/* Payments Section - card view (default, mobile-friendly) or grid/table */}
          {invoice && invoice.supplier && (
            <div className="card p-4 sm:p-6 rounded-xl">
              <div className="flex flex-col gap-3 mb-4 sm:mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Payments</h2>
                  <div className="flex items-center gap-2">
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

              {/* Payments List - Card view (default) or Grid/Table */}
              {payments.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No payments recorded yet</p>
              ) : paymentsViewMode === 'card' ? (
                <div className="space-y-3">
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1.5 min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{payment.paymentNumber}</p>
                          <p className="text-sm text-gray-600">
                            {new Date(payment.date).toLocaleDateString()}
                          </p>
                          <p className="text-base font-bold text-gray-900">
                            Rs. {payment.amount.toLocaleString()}
                          </p>
                          <p className="text-sm text-gray-500">{payment.paymentMethod}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { window.location.href = `/business/purchases/${invoiceId}` }}
                          className="flex-shrink-0 p-2.5 rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-800 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation"
                          title="View invoice"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ))}
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
                              onClick={() => { window.location.href = `/business/purchases/${invoiceId}` }}
                              className="text-blue-600 hover:text-blue-900 p-2 -m-2"
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
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto safe-area-padding">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md my-4 min-h-0">
                <div className="p-4 sm:p-6">
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

          {/* Footer Actions - mobile: full-width stacked, touch-friendly */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 sm:space-x-3 pt-4 sm:pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/business/purchases')}
              className="btn-secondary min-h-[48px] px-4 py-3 rounded-xl touch-manipulation w-full sm:w-auto"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex items-center justify-center min-h-[48px] px-4 py-3 rounded-xl touch-manipulation w-full sm:w-auto"
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

        {/* Create Product Modal - same UX as Add Purchase; creates in DB immediately */}
        {showCreateProductModal && createProductContextIndex !== null && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white rounded-t-2xl sm:rounded-xl max-w-md w-full max-h-[92vh] overflow-hidden flex flex-col shadow-xl">
              <div className="flex justify-between items-center p-4 sm:p-6 pb-2 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl sm:rounded-t-xl shrink-0 z-10">
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Create New Product</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateProductModal(false)
                    setCreateProductContextIndex(null)
                    setCreateProductPrefillName('')
                    setCreateProductSku('')
                    setCreateProductCategory('')
                    setCreateProductShowNewCategory(false)
                  }}
                  className="p-2 -m-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg touch-manipulation"
                  aria-label="Close"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <form
                key={showCreateProductModal ? `open-${createProductPrefillName}` : 'closed'}
                onSubmit={async (e) => {
                  e.preventDefault()
                  const formData = new FormData(e.target)
                  const name = (formData.get('name') || '').toString().trim()
                  if (!name) {
                    toast.error('Product name is required')
                    return
                  }
                  const productData = {
                    name,
                    description: (formData.get('description') || '').toString().trim() || null,
                    category: (createProductCategory || '').trim() || null,
                    sku: (formData.get('sku') || '').toString().trim() || null,
                    isStitched: formData.get('isStitched') === 'on',
                    hasVariants: formData.get('hasVariants') === 'on'
                  }
                  const idx = createProductContextIndex
                  try {
                    const createRes = await api.post('/product', productData)
                    const newProduct = createRes.data?.product
                    if (newProduct?.id) {
                      if ((productData.category || '').trim() && !categories.includes((productData.category || '').trim())) {
                        setCategories(prev => [...prev, (productData.category || '').trim()].sort())
                      }
                      handleProductSelect(idx, newProduct)
                      if (newProduct.lastPurchasePrice) {
                        setValue(`items.${idx}.purchasePrice`, newProduct.lastPurchasePrice)
                      }
                      toast.success('Product created and selected for this row.')
                    } else {
                      toast.error('Product was created but could not be selected.')
                    }
                  } catch (err) {
                    const msg = err.response?.data?.error || err.response?.data?.message || 'Failed to create product'
                    toast.error(msg)
                    return
                  }
                  setShowCreateProductModal(false)
                  setCreateProductContextIndex(null)
                  setCreateProductPrefillName('')
                  setCreateProductSku('')
                  setCreateProductCategory('')
                  setCreateProductShowNewCategory(false)
                }}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Product Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      name="name"
                      required
                      defaultValue={createProductPrefillName}
                      onChange={(e) => setCreateProductSku(generateProductSku(e.target.value.trim()))}
                      className="w-full px-3 py-2.5 sm:py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm touch-manipulation"
                      placeholder="Enter product name"
                    />
                    <p className="text-xs text-gray-500 mt-1">Product will be used in this purchase row after creation.</p>
                  </div>
                  <input type="hidden" name="category" value={createProductCategory} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select
                        value={createProductShowNewCategory ? '__new__' : createProductCategory}
                        onChange={(e) => {
                          const value = e.target.value
                          if (value === '__new__') {
                            setCreateProductShowNewCategory(true)
                            setCreateProductCategory('')
                          } else {
                            setCreateProductShowNewCategory(false)
                            setCreateProductCategory(value)
                          }
                        }}
                        className="w-full px-3 py-2.5 sm:py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm touch-manipulation"
                      >
                        <option value="">Select category (optional)</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        <option value="__new__">+ Add new category</option>
                      </select>
                      {createProductShowNewCategory && (
                        <input
                          type="text"
                          value={createProductCategory}
                          onChange={(e) => setCreateProductCategory(e.target.value)}
                          className="w-full px-3 py-2.5 sm:py-2 mt-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm touch-manipulation"
                          placeholder="Enter new category name"
                          autoFocus
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                      <input
                        name="sku"
                        type="text"
                        value={createProductSku}
                        onChange={(e) => setCreateProductSku(e.target.value)}
                        className="w-full px-3 py-2.5 sm:py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm touch-manipulation"
                        placeholder="Auto-generated from name"
                      />
                    </div>
                  </div>
                  <div className="space-y-3 pt-2">
                    <p className="text-sm font-semibold text-gray-800">Product type</p>
                    <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-colors touch-manipulation min-h-[56px] has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 has-[:checked]:ring-2 has-[:checked]:ring-blue-200">
                      <input type="checkbox" name="isStitched" className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0" />
                      <div>
                        <span className="font-medium text-gray-900 block">Stitched product</span>
                        <span className="text-sm text-gray-600">Requires size; e.g. garments, custom stitched items.</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-colors touch-manipulation min-h-[56px] has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 has-[:checked]:ring-2 has-[:checked]:ring-blue-200">
                      <input type="checkbox" name="hasVariants" className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0" />
                      <div>
                        <span className="font-medium text-gray-900 block">Has variants</span>
                        <span className="text-sm text-gray-600">Color/size options; separate stock per variant.</span>
                      </div>
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      name="description"
                      className="w-full px-3 py-2.5 sm:py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm min-h-[80px] touch-manipulation"
                      rows={2}
                      placeholder="Enter description (optional)"
                    />
                  </div>
                </div>
                <div className="p-4 sm:p-6 pt-4 border-t border-gray-200 bg-gray-50/80 shrink-0 rounded-b-2xl sm:rounded-b-xl flex flex-col sm:flex-row gap-3 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateProductModal(false)
                      setCreateProductContextIndex(null)
                      setCreateProductPrefillName('')
                      setCreateProductSku('')
                      setCreateProductCategory('')
                      setCreateProductShowNewCategory(false)
                    }}
                    className="order-2 sm:order-1 px-4 py-3 sm:py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 touch-manipulation"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="order-1 sm:order-2 px-6 py-3.5 sm:py-2.5 text-base sm:text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 shadow-lg shadow-blue-900/20 touch-manipulation min-h-[48px] sm:min-h-0"
                  >
                    Create Product
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ModernLayout>
  )
}

export default EditPurchasePage

