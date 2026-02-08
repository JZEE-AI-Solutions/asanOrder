import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { ArrowLeftIcon, DocumentTextIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
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
  const [productSearchResults, setProductSearchResults] = useState({}) // index -> products[]
  const [showProductSearch, setShowProductSearch] = useState({}) // index -> boolean
  const [selectedProducts, setSelectedProducts] = useState({}) // index -> product object
  const [productVariants, setProductVariants] = useState({}) // index -> variants[]
  const [showCreateProductModal, setShowCreateProductModal] = useState(false)
  /** When opening Create Product from a purchase row: that row index; after create we auto-select the new product in this row */
  const [createProductContextIndex, setCreateProductContextIndex] = useState(null)
  /** Prefill name in Create Product modal (e.g. from current row or "Create [typed name]") */
  const [createProductPrefillName, setCreateProductPrefillName] = useState('')
  /** Auto-generated SKU in Create Product modal; updated when name changes */
  const [createProductSku, setCreateProductSku] = useState('')
  /** Category in Create Product modal: selected value or new category name */
  const [createProductCategory, setCreateProductCategory] = useState('')
  /** When true, show "new category" text input in Create Product modal */
  const [createProductShowNewCategory, setCreateProductShowNewCategory] = useState(false)
  const [returnHandlingMethod, setReturnHandlingMethod] = useState('REDUCE_AP') // REDUCE_AP | REFUND
  const [returnRefundAccountId, setReturnRefundAccountId] = useState('')
  const [returnProductSuggestions, setReturnProductSuggestions] = useState({}) // key -> products[]
  const [showReturnProductSuggestions, setShowReturnProductSuggestions] = useState({}) // key -> boolean
  const [returnSearchTimeouts, setReturnSearchTimeouts] = useState({}) // key -> timeoutId
  const returnSearchTimeoutsRef = useRef({})
  /** Product row index showing the "add new variant" form (card expanded) */
  const [addVariantForIndex, setAddVariantForIndex] = useState(null)
  const [isCreatingVariant, setIsCreatingVariant] = useState(false)
  const [newVariantInputsByIndex, setNewVariantInputsByIndex] = useState({})
  /** Pending products created in Create Product popup (in memory only). Key = row index; created in DB when invoice is saved. */
  const [pendingProductsByRow, setPendingProductsByRow] = useState({})

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    watch,
    setValue,
    getValues
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
      items: [{ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '', productId: null, productVariantId: null, color: '', size: '' }],
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
    const netTotal = Math.max(0, purchaseTotal - returnTotal)
    setValue('totalAmount', netTotal.toFixed(2))
    return { purchaseTotal, returnTotal, netTotal }
  }

  // Update total when items or return items change
  useEffect(() => {
    calculateTotal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedItems, watchedReturnItems])

  returnSearchTimeoutsRef.current = returnSearchTimeouts

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout) clearTimeout(searchTimeout)
      Object.values(returnSearchTimeoutsRef.current).forEach(t => { if (t) clearTimeout(t) })
    }
  }, [searchTimeout])

  // Extract user-facing error message from API error (handles various backend shapes)
  const getApiErrorMessage = (error, fallback = 'Something went wrong') => {
    if (!error) return fallback
    const data = error.response?.data
    if (data?.error && typeof data.error === 'string') return data.error
    if (data?.message && typeof data.message === 'string') return data.message
    const arr = data?.errors
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0]
      const msg = first?.msg ?? first?.message ?? first?.error
      if (typeof msg === 'string') return msg
    }
    if (error.message && typeof error.message === 'string') return error.message
    return fallback
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
    append({ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '', productId: null, productVariantId: null, color: '', size: '' })
  }

  const normalizeName = (value) => {
    if (!value) return ''
    return value
      .toString()
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
  }

  // Search products by name
  const searchProducts = async (index, query) => {
    if (!tenant?.id || query.length < 2) {
      setProductSearchResults(prev => ({ ...prev, [index]: [] }))
      return
    }

    try {
      const response = await api.get(`/products/search/${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      if (response.data.success) {
        setProductSearchResults(prev => ({ ...prev, [index]: response.data.products || [] }))
        setShowProductSearch(prev => ({ ...prev, [index]: true }))
      }
    } catch (error) {
      console.error('Error searching products:', error)
      setProductSearchResults(prev => ({ ...prev, [index]: [] }))
    }
  }

  // Fetch variants for a product
  const fetchProductVariants = async (index, productId, indicesToSync = []) => {
    if (!productId) {
      const indices = Array.from(new Set([index, ...indicesToSync]))
      setProductVariants(prev => {
        const next = { ...prev }
        indices.forEach(i => { next[i] = [] })
        return next
      })
      return
    }

    try {
      const response = await api.get(`/product/${productId}/variants`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      if (response.data.variants) {
        const indices = Array.from(new Set([index, ...indicesToSync]))
        setProductVariants(prev => {
          const next = { ...prev }
          indices.forEach(i => { next[i] = response.data.variants || [] })
          return next
        })
      }
    } catch (error) {
      console.error('Error fetching variants:', error)
      const indices = Array.from(new Set([index, ...indicesToSync]))
      setProductVariants(prev => {
        const next = { ...prev }
        indices.forEach(i => { next[i] = [] })
        return next
      })
    }
  }

  // Handle product selection (real product from search; clears any pending product for this row)
  const handleProductSelect = (index, product) => {
    const items = getValues('items') || []
    const trimmedProductName = normalizeName(product?.name || '')
    const sameNameIndices = items
      .map((item, idx) => ({ idx, name: normalizeName(item?.name || '') }))
      .filter(entry => entry.name && trimmedProductName && entry.name === trimmedProductName)
      .map(entry => entry.idx)
    setPendingProductsByRow(prev => {
      const next = { ...prev }
      delete next[index]
      return next
    })
    setSelectedProducts(prev => {
      const next = { ...prev, [index]: product }
      sameNameIndices.forEach(idx => { next[idx] = product })
      return next
    })
    setValue(`items.${index}.name`, product.name)
    setValue(`items.${index}.productId`, product.id)
    setValue(`items.${index}.category`, product.category || '')
    // Auto-generate SKU if product doesn't have one, otherwise use existing
    const productSku = product.sku || generateProductSku(product.name)
    setValue(`items.${index}.sku`, productSku)
    setShowProductSearch(prev => ({ ...prev, [index]: false }))
    setProductSearchResults(prev => ({ ...prev, [index]: [] }))
    sameNameIndices.forEach(idx => {
      const existingId = getValues(`items.${idx}.productId`)
      if (!existingId) setValue(`items.${idx}.productId`, product.id)
    })
    
    // If product has variants, fetch them
    if (product.hasVariants) {
      fetchProductVariants(index, product.id, sameNameIndices)
    } else {
      setProductVariants(prev => {
        const next = { ...prev }
        const indices = Array.from(new Set([index, ...sameNameIndices]))
        indices.forEach(i => { next[i] = [] })
        return next
      })
      const indices = Array.from(new Set([index, ...sameNameIndices]))
      indices.forEach(i => {
        setValue(`items.${i}.productVariantId`, null)
        setValue(`items.${i}.color`, '')
        setValue(`items.${i}.size`, '')
      })
    }
  }

  // Handle variant selection or creation
  const handleVariantSelect = async (index, variant) => {
    if (variant && variant.id) {
      // Existing variant selected
      setValue(`items.${index}.productVariantId`, variant.id)
      setValue(`items.${index}.color`, variant.color)
      setValue(`items.${index}.size`, variant.size || '')
      // Use variant SKU if exists, otherwise auto-generate
      const productSku = watch(`items.${index}.sku`) || selectedProducts[index]?.sku || ''
      const variantSku = variant.sku || generateVariantSku(productSku, variant.color, variant.size)
      setValue(`items.${index}.sku`, variantSku)
    }
  }

  // Create new variant (backend auto-generates unique variant SKU from product.sku + color + size)
  const handleCreateVariant = async (index) => {
    if (isCreatingVariant) return
    const product = selectedProducts[index]
    const color = (newVariantInputsByIndex[index]?.color || '').trim()
    const size = (newVariantInputsByIndex[index]?.size || '').trim()
    
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
        const variant = response.data.variant
        setValue(`items.${index}.sku`, variant.sku || '')
        await fetchProductVariants(index, product.id)
        handleVariantSelect(index, variant)
        setAddVariantForIndex(null)
        setNewVariantInputsByIndex(prev => {
          const next = { ...prev }
          delete next[index]
          return next
        })
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to create variant'))
      console.error('Create variant error:', error?.response?.data ?? error)
    } finally {
      setIsCreatingVariant(false)
    }
  }

  const removeItem = (index) => {
    if (fields.length > 1) {
      remove(index)
      setPendingProductsByRow(prev => {
        const next = {}
        Object.entries(prev).forEach(([k, v]) => {
          const ki = parseInt(k, 10)
          if (ki < index) next[ki] = v
          if (ki > index) next[ki - 1] = v
        })
        return next
      })
      setSelectedProducts(prev => {
        const next = {}
        Object.entries(prev).forEach(([k, v]) => {
          const ki = parseInt(k, 10)
          if (ki < index) next[ki] = v
          if (ki > index) next[ki - 1] = v
        })
        return next
      })
      setProductVariants(prev => {
        const next = {}
        Object.entries(prev).forEach(([k, v]) => {
          const ki = parseInt(k, 10)
          if (ki < index) next[ki] = v
          if (ki > index) next[ki - 1] = v
        })
        return next
      })
      setProductSearchResults(prev => {
        const next = {}
        Object.entries(prev).forEach(([k, v]) => {
          const ki = parseInt(k, 10)
          if (ki < index) next[ki] = v
          if (ki > index) next[ki - 1] = v
        })
        return next
      })
      setShowProductSearch(prev => {
        const next = {}
        Object.entries(prev).forEach(([k, v]) => {
          const ki = parseInt(k, 10)
          if (ki < index) next[ki] = v
          if (ki > index) next[ki - 1] = v
        })
        return next
      })
      setNewCategoryInputs(prev => {
        const next = {}
        Object.entries(prev).forEach(([k, v]) => {
          const ki = parseInt(k, 10)
          if (ki < index) next[ki] = v
          if (ki > index) next[ki - 1] = v
        })
        return next
      })
      if (addVariantForIndex === index) setAddVariantForIndex(null)
      else if (addVariantForIndex > index) setAddVariantForIndex(addVariantForIndex - 1)
      setTimeout(() => calculateTotal(), 100)
    } else {
      toast.error('At least one item is required')
    }
  }

  const addReturnItem = () => {
    appendReturn({ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '' })
  }

  /** Group consecutive items by product (productId or name). Variant lines (same name, no productId) join the previous line's group so one card shows all variant lines. */
  const getProductGroups = () => {
    const items = watchedItems || []
    const groups = []
    let current = null
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const trimmedName = normalizeName(item?.name || '')
      const prevItem = i > 0 ? items[i - 1] : null
      const prevTrimmedName = normalizeName(prevItem?.name || '')
      const sameNameAsPrev = trimmedName && prevTrimmedName && trimmedName === prevTrimmedName
      // Use productId if set; else if same name as previous (variant line), reuse previous group key so they stay in one group
      let key = item?.productId != null ? String(item.productId) : null
      if (key == null && sameNameAsPrev && current) key = current.key
      if (key == null) key = `name:${trimmedName || i}`
      if (!current || current.key !== key) {
        current = { key, indices: [i] }
        groups.push(current)
      } else {
        current.indices.push(i)
      }
    }
    return groups
  }

  /** Add a new variant line (new item) with same product as the source index. New line index = current length (before append). */
  const addVariantLine = (sourceIndex) => {
    const template = watch('items')[sourceIndex]
    const product = selectedProducts[sourceIndex]
    const newIndex = fields.length
    const name = template?.name || ''
    const productId = template?.productId ?? product?.id ?? null
    const newItem = {
      name,
      quantity: 1,
      purchasePrice: template?.purchasePrice ?? 0,
      sku: '',
      category: template?.category || '',
      description: '',
      productId,
      productVariantId: null,
      color: '',
      size: ''
    }
    append(newItem)
    if (product) {
      setSelectedProducts(prev => ({ ...prev, [newIndex]: product }))
      setProductVariants(prev => ({ ...prev, [newIndex]: productVariants[sourceIndex] || [] }))
    }
    // Explicitly set form values for the new line after append is applied so they persist on submit
    setTimeout(() => {
      setValue(`items.${newIndex}.name`, name, { shouldValidate: false })
      setValue(`items.${newIndex}.productId`, productId, { shouldValidate: false })
      calculateTotal()
    }, 0)
  }

  /** Remove entire product group (all indices). Removes from highest index first to avoid index shift. */
  const removeProductGroup = (indices) => {
    if (indices.length === 0) return
    const isOnlyGroup = indices.length === fields.length
    if (isOnlyGroup) {
      const sorted = [...indices].sort((a, b) => b - a)
      sorted.forEach(idx => remove(idx))
      setSelectedProducts({})
      setProductVariants({})
      setPendingProductsByRow({})
      setProductSearchResults({})
      setShowProductSearch({})
      setNewCategoryInputs({})
      if (addVariantForIndex !== null) setAddVariantForIndex(null)
      append({ name: '', quantity: 1, purchasePrice: 0, sku: '', category: '', description: '', productId: null, productVariantId: null, color: '', size: '' })
    } else {
      const sorted = [...indices].sort((a, b) => b - a)
      sorted.forEach(idx => removeItem(idx))
    }
    setTimeout(() => calculateTotal(), 100)
  }

  // Search products for return item autocomplete
  const searchReturnProducts = async (fieldKey, query) => {
    if (!tenant?.id || query.length < 2) {
      setReturnProductSuggestions(prev => ({ ...prev, [fieldKey]: [] }))
      return
    }
    try {
      const response = await api.get(`/products/search/${encodeURIComponent(query)}`)
      if (response.data.success) {
        setReturnProductSuggestions(prev => ({ ...prev, [fieldKey]: response.data.products || [] }))
        setShowReturnProductSuggestions(prev => ({ ...prev, [fieldKey]: true }))
      }
    } catch (error) {
      if (error.code !== 'ERR_CANCELED') console.error('Error searching products for return:', error)
      setReturnProductSuggestions(prev => ({ ...prev, [fieldKey]: [] }))
    }
  }

  const onSubmit = async (data) => {
    // Prevent submission if any modal is open (safety check)
    if (document.querySelector('.fixed.inset-0.bg-black.bg-opacity-50')) {
      console.warn('Form submission prevented: Modal is open')
      return
    }
    // Validate items and keep form index for pending-product resolution
    const itemsWithIndex = data.items.map((item, formIndex) => ({ ...item, formIndex }))
    const currentItemsWithIndex = (getValues('items') || []).map((item, formIndex) => ({ ...item, formIndex }))
    const validItems = itemsWithIndex.filter(item => 
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

    const totals = calculateTotal()
    const { purchaseTotal, returnTotal, netTotal } = totals

    if (returnTotal > purchaseTotal) {
      toast.error(`Return total (Rs. ${returnTotal.toFixed(2)}) cannot exceed purchase total (Rs. ${purchaseTotal.toFixed(2)})`)
      return
    }

    if (validReturnItems.length > 0) {
      if (!returnHandlingMethod || !['REDUCE_AP', 'REFUND'].includes(returnHandlingMethod)) {
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
      const totalAmount = netTotal
      
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

      // Create pending products (from Create Product popup) in DB first; then create variants if color/size provided
      const createdProductIdsByFormIndex = {}
      const createdVariantIdsByFormIndex = {}
      const createdProductIdsByName = {}
      const createdVariantIdsByKey = {}
      for (const item of validItems) {
        const formIndex = item.formIndex
        const selected = selectedProducts[formIndex]
        if (selected?.tempId && pendingProductsByRow[formIndex]) {
          const pending = pendingProductsByRow[formIndex]
          try {
            const createRes = await api.post('/product', {
              name: pending.name,
              description: pending.description || null,
              category: (pending.category || '').trim() || null,
              sku: pending.sku || null,
              isStitched: pending.isStitched || false,
              hasVariants: pending.hasVariants || false
            })
            const newProduct = createRes.data?.product
            if (newProduct?.id) {
              createdProductIdsByFormIndex[formIndex] = newProduct.id
              const color = (item.color || '').trim()
              const size = (item.size || '').trim()
              if (pending.hasVariants && color) {
                if (pending.isStitched && !size) {
                  toast.error(`Size is required for stitched product "${pending.name}"`)
                  setIsSubmitting(false)
                  return
                }
                // Omit sku so backend auto-generates unique variant SKU (product.sku + color + size)
                const variantRes = await api.post(`/product/${newProduct.id}/variants`, {
                  color,
                  size: size || null,
                  currentQuantity: 0,
                  isActive: true
                })
                const variant = variantRes.data?.variant
                if (variant?.id) {
                  createdVariantIdsByFormIndex[formIndex] = variant.id
                }
              }
            }
          } catch (err) {
            toast.error(getApiErrorMessage(err, 'Failed to create product'))
            setIsSubmitting(false)
            return
          }
        }
      }

      // Create products for manual entries that were not selected from suggestions (productId still null)
      const itemsForCreation = currentItemsWithIndex.length > 0 ? currentItemsWithIndex : validItems
      const nameGroups = {}
      itemsForCreation.forEach((item) => {
        const nameKey = normalizeName(item.name || '')
        if (!nameKey) return
        if (!nameGroups[nameKey]) nameGroups[nameKey] = []
        nameGroups[nameKey].push(item)
      })

      for (const [nameKey, groupItems] of Object.entries(nameGroups)) {
        const existingFromSelected = groupItems
          .map(i => selectedProducts[i.formIndex]?.id)
          .find(Boolean)
        const existingId = groupItems.find(i => i.productId)?.productId
          || existingFromSelected
          || createdProductIdsByName[nameKey]
        const firstItem = groupItems[0]
        const firstSelected = selectedProducts[firstItem.formIndex]
        const normalizedName = normalizeName(firstItem.name || '')
        const hasVariants = groupItems.some(i => (i.color || '').toString().trim())
        const isStitched = firstSelected?.isStitched || false

        const applyResolvedProductId = (resolvedId) => {
          if (!resolvedId) return
          createdProductIdsByName[nameKey] = resolvedId
          groupItems.forEach(i => {
            if (!createdProductIdsByFormIndex[i.formIndex]) createdProductIdsByFormIndex[i.formIndex] = resolvedId
          })
        }

        if (existingId) {
          applyResolvedProductId(existingId)
        } else {
          // Try to find existing product by name before creating a duplicate
          try {
            const searchRes = await api.get(`/products/search/${encodeURIComponent(firstItem.name || '')}`)
            const candidates = searchRes.data?.products || []
            const exact = candidates.find(p => normalizeName(p?.name || '') === normalizedName)
            if (exact?.id) applyResolvedProductId(exact.id)
          } catch (err) {
            // ignore search errors and fall back to create
          }
        }

        const resolvedProductId = createdProductIdsByName[nameKey]

        if (!resolvedProductId) {
          try {
            const createRes = await api.post('/product', {
              name: (firstItem.name || '').toString().trim(),
              description: firstItem.description?.trim() || null,
              category: (firstItem.category || '').trim() || null,
              sku: firstItem.sku?.trim() || null,
              isStitched,
              hasVariants
            })
            const newProduct = createRes.data?.product
            if (newProduct?.id) applyResolvedProductId(newProduct.id)
          } catch (err) {
            toast.error(getApiErrorMessage(err, 'Failed to create product'))
            setIsSubmitting(false)
            return
          }
        }

        const finalProductId = createdProductIdsByName[nameKey]
        if (finalProductId && hasVariants) {
          let existingVariants = []
          try {
            const variantsRes = await api.get(`/product/${finalProductId}/variants`)
            existingVariants = variantsRes.data?.variants || []
          } catch (err) {
            existingVariants = []
          }

          for (const item of groupItems) {
            const color = (item.color || '').toString().trim()
            const size = (item.size || '').toString().trim()
            if (!color) continue
            const variantKey = `${nameKey}::${color}::${size || ''}`
            if (createdVariantIdsByKey[variantKey]) {
              createdVariantIdsByFormIndex[item.formIndex] = createdVariantIdsByKey[variantKey]
              continue
            }
            const matchingExisting = existingVariants.find(v =>
              (v.color || '') === color && ((v.size || '') === (size || ''))
            )
            if (matchingExisting?.id) {
              createdVariantIdsByKey[variantKey] = matchingExisting.id
              createdVariantIdsByFormIndex[item.formIndex] = matchingExisting.id
              continue
            }
            try {
              const variantRes = await api.post(`/product/${finalProductId}/variants`, {
                color,
                size: size || null,
                currentQuantity: 0,
                isActive: true
              })
              const variant = variantRes.data?.variant
              if (variant?.id) {
                createdVariantIdsByKey[variantKey] = variant.id
                createdVariantIdsByFormIndex[item.formIndex] = variant.id
              }
            } catch (err) {
              toast.error(getApiErrorMessage(err, `Failed to create variant for "${firstItem.name}"`))
              setIsSubmitting(false)
              return
            }
          }
        }
      }

      // Resolve productId per line: form often has productId null for variant lines; use first same-name line that has id
      const productIdByGroup = {}
      const nameToProductId = {}
      const lookupItems = currentItemsWithIndex.length > 0 ? currentItemsWithIndex : validItems
      lookupItems.forEach((it) => {
        const trimmedName = normalizeName(it.name || '')
        if (!trimmedName) return
        if (it.productId && !nameToProductId[trimmedName]) nameToProductId[trimmedName] = it.productId
      })
      Object.entries(selectedProducts).forEach(([idx, product]) => {
        const trimmedName = normalizeName(product?.name || '')
        if (!trimmedName || !product?.id) return
        if (!nameToProductId[trimmedName]) nameToProductId[trimmedName] = product.id
      })
      lookupItems.forEach((it) => {
        const key = (it.productId && String(it.productId)) || `name:${normalizeName(it.name || '')}`
        const id = it.productId || selectedProducts[it.formIndex]?.id
        if (!productIdByGroup[key] && id) productIdByGroup[key] = id
      })
      lookupItems.forEach((it) => {
        const key = (it.productId && String(it.productId)) || `name:${normalizeName(it.name || '')}`
        const trimmedName = normalizeName(it.name || '')
        if (productIdByGroup[key]) return
        // Use first same-name line that has productId or selectedProducts (so variant line gets id from first line)
        const firstWithId = lookupItems.find(
          o => normalizeName(o.name || '') === trimmedName && (o.productId || selectedProducts[o.formIndex]?.id)
        )
        const resolvedId = firstWithId?.productId || (firstWithId && selectedProducts[firstWithId.formIndex]?.id) || null
        const nameResolvedId = nameToProductId[trimmedName]
        if (resolvedId || nameResolvedId) {
          const finalId = resolvedId || nameResolvedId
          productIdByGroup[key] = finalId
          if (!productIdByGroup[`name:${trimmedName}`]) productIdByGroup[`name:${trimmedName}`] = finalId
        } else {
          const sameName = lookupItems.find(o => normalizeName(o.name || '') === trimmedName)
          productIdByGroup[key] = sameName?.productId || (sameName && selectedProducts[sameName.formIndex]?.id) || null
        }
      })

      console.groupCollapsed('[AddPurchase] save-debug')
      console.log('itemsWithIndex', itemsWithIndex.map(it => ({
        formIndex: it.formIndex,
        name: it.name,
        productId: it.productId,
        productVariantId: it.productVariantId,
        color: it.color,
        size: it.size
      })))
      console.log('currentItemsWithIndex', currentItemsWithIndex.map(it => ({
        formIndex: it.formIndex,
        name: it.name,
        productId: it.productId,
        productVariantId: it.productVariantId,
        color: it.color,
        size: it.size
      })))
      console.log('selectedProducts keys', Object.keys(selectedProducts))
      console.log('selectedProducts', Object.entries(selectedProducts).map(([idx, p]) => ({
        idx,
        id: p?.id,
        name: p?.name,
        hasVariants: p?.hasVariants,
        isStitched: p?.isStitched
      })))
      console.log('nameToProductId', nameToProductId)
      console.log('productIdByGroup', productIdByGroup)
      console.groupEnd()

      const payload = {
        invoiceNumber: data.invoiceNumber?.trim() || undefined,
        supplierName: data.supplierName || null,
        invoiceDate: data.invoiceDate,
        totalAmount: totalAmount,
        paymentAmount: paymentAmount > 0 ? paymentAmount : undefined,
        paymentAccountId: paymentAmount > 0 ? (data.paymentAccountId || null) : null,
        notes: data.notes || null,
        useAdvanceBalance: advanceAmountUsed > 0,
        advanceAmountUsed: advanceAmountUsed > 0 ? advanceAmountUsed : undefined,
        products: validItems.map((item, mapIndex) => {
          const formIndex = item.formIndex
          // Use getValues so we always send current form value for this line (avoids stale data.items for second variant line)
          const rowColor = getValues(`items.${formIndex}.color`)
          const rowSize = getValues(`items.${formIndex}.size`)
          const color = (item.color ?? rowColor ?? '').toString().trim() || null
          const size = (item.size ?? rowSize ?? '').toString().trim() || null
          const groupKey = (item.productId && String(item.productId)) || `name:${normalizeName(item.name || '')}`
          const nameKey = `name:${normalizeName(item.name || '')}`
          // Resolve productId: use group map or first same-name line that has id (variant lines often have productId null)
          const productIdFromGroup = productIdByGroup[groupKey] ?? productIdByGroup[nameKey] ?? nameToProductId[normalizeName(item.name || '')] ?? (() => {
            const firstWithId = lookupItems.find(
              o => normalizeName(o.name || '') === normalizeName(item.name || '') && (o.productId || selectedProducts[o.formIndex]?.id)
            )
            return firstWithId?.productId || (firstWithId && selectedProducts[firstWithId.formIndex]?.id) || null
          })()
          const productId = createdProductIdsByFormIndex[formIndex] ?? item.productId ?? productIdFromGroup ?? selectedProducts[formIndex]?.id ?? null
          const categoryValue = item.newCategory?.trim()
            ? item.newCategory.trim()
            : (item.category?.trim() || null)

          const fallbackIndex = lookupItems.findIndex(o => normalizeName(o.name || '') === normalizeName(item.name || '') && (o.productId || selectedProducts[o.formIndex]?.id))
          const fallbackFormIndex = fallbackIndex >= 0 ? lookupItems[fallbackIndex].formIndex : formIndex
          const variantsForLine = productVariants[formIndex] || productVariants[fallbackFormIndex]
          let productVariantId = createdVariantIdsByFormIndex[formIndex] ?? item.productVariantId ?? null
          if (productVariantId == null && productId && color) {
            if (variantsForLine && Array.isArray(variantsForLine)) {
              const matchingVariant = variantsForLine.find(v =>
                v.color === color && (v.size || '') === (size || '')
              )
              if (matchingVariant) productVariantId = matchingVariant.id
            }
          }

          return {
            name: (item.name ?? '').toString().trim(),
            quantity: parseInt(item.quantity, 10),
            purchasePrice: parseFloat(item.purchasePrice),
            sku: item.sku?.trim() || null,
            category: categoryValue,
            description: item.description?.trim() || null,
            productId,
            productVariantId,
            color,
            size
          }
        }),
        returnItems: validReturnItems.length > 0 ? validReturnItems.map(item => ({
          name: item.name.trim(),
          productName: item.name.trim(),
          quantity: parseInt(item.quantity),
          purchasePrice: parseFloat(item.purchasePrice),
          sku: item.sku?.trim() || null,
          category: item.category?.trim() || null,
          description: item.description?.trim() || null
        })) : [],
        returnHandlingMethod: validReturnItems.length > 0 ? returnHandlingMethod : undefined,
        returnRefundAccountId: validReturnItems.length > 0 && returnHandlingMethod === 'REFUND' ? returnRefundAccountId : undefined
      }

      const response = await api.post('/purchase-invoice/with-products', payload)
      setPendingProductsByRow({})
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
      toast.error(getApiErrorMessage(error, 'Failed to create purchase invoice'))
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
                    setValue('supplierName', e.target.value, { shouldValidate: true })
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

            </div>
            {/* totalAmount is auto-calculated from items and shown in Payment Summary at bottom */}
            <input
              type="hidden"
              {...register('totalAmount', { 
                required: 'Total amount is required',
                min: { value: 0, message: 'Amount must be positive' }
              })}
            />
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
              {getProductGroups().map((group, groupIndex) => {
                const firstIndex = group.indices[0]
                const variantIndices = group.indices.slice(1)
                const field = fields[firstIndex]
                if (!field) return null
                const index = firstIndex
                const itemErrors = errors.items?.[index]
                const item = watchedItems[index]
                const itemTotal = (parseFloat(item?.quantity) || 0) * (parseFloat(item?.purchasePrice) || 0)
                const productAtFirst = selectedProducts[firstIndex] || pendingProductsByRow[firstIndex]
                const showVariantsSection = !!(productAtFirst?.hasVariants || productAtFirst?.isStitched)

                return (
                  <div key={field.id} className="border rounded-xl p-4 sm:p-5 bg-white border-gray-200 shadow-sm">
                    <div className="flex justify-between items-center gap-2 mb-4">
                      <span className="text-sm font-medium text-gray-500">Product {groupIndex + 1}</span>
                      {fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeProductGroup(group.indices)}
                          className="min-h-[44px] min-w-[44px] p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors touch-manipulation"
                          aria-label="Remove product"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>

                    {/* 1. Product */}
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">1. Product</p>
                      <div className="relative">
                        <label className="sr-only">Product</label>
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <input
                              {...register(`items.${index}.name`, { 
                                required: 'Product is required'
                              })}
                              onChange={(e) => {
                                const query = e.target.value.trim()
                                setValue(`items.${index}.name`, e.target.value, { shouldValidate: true })
                                
                                // Auto-generate SKU from product name if no product is selected
                                if (!selectedProducts[index] && query) {
                                  const generatedSku = generateProductSku(query)
                                  const currentSku = watch(`items.${index}.sku`)
                                  // Only auto-generate if SKU is empty or matches previous auto-generated pattern
                                  if (!currentSku || currentSku === generateProductSku(watch(`items.${index}.name`) || '')) {
                                    setValue(`items.${index}.sku`, generatedSku)
                                  }
                                }
                                
                                if (query.length >= 2) {
                                  searchProducts(index, query)
                                } else {
                                  setShowProductSearch(prev => ({ ...prev, [index]: false }))
                                  setProductSearchResults(prev => ({ ...prev, [index]: [] }))
                                  // Clear product selection if name is cleared
                                  if (!query) {
                                    setSelectedProducts(prev => {
                                      const updated = { ...prev }
                                      delete updated[index]
                                      return updated
                                    })
                                    setPendingProductsByRow(prev => {
                                      const next = { ...prev }
                                      delete next[index]
                                      return next
                                    })
                                    setValue(`items.${index}.productId`, null)
                                    setValue(`items.${index}.productVariantId`, null)
                                    setProductVariants(prev => ({ ...prev, [index]: [] }))
                                  }
                                }
                              }}
                              className={`w-full min-h-[44px] px-3 py-2.5 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 touch-manipulation ${
                                itemErrors?.name ? 'border-red-300' : 'border-gray-300'
                              }`}
                              placeholder="Search or type product name"
                              autoComplete="off"
                              onFocus={() => {
                                const query = watch(`items.${index}.name`)?.trim()
                                if (query && query.length >= 2) {
                                  setShowProductSearch(prev => ({ ...prev, [index]: true }))
                                }
                              }}
                              onBlur={() => {
                                setTimeout(() => setShowProductSearch(prev => ({ ...prev, [index]: false })), 200)
                              }}
                            />
                            {/* Product Search Dropdown: results or "No results - Create product" */}
                            {showProductSearch[index] && productSearchResults[index] !== undefined && (
                              <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                                {productSearchResults[index].length > 0 ? (
                                  productSearchResults[index].map((product) => (
                                    <div
                                      key={product.id}
                                      className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                      onMouseDown={(e) => {
                                        e.preventDefault()
                                        handleProductSelect(index, product)
                                      }}
                                    >
                                      <div className="font-medium text-gray-900">{product.name}</div>
                                      {product.category && (
                                        <div className="text-xs text-gray-500">{product.category}</div>
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
                                          setShowProductSearch(prev => ({ ...prev, [index]: false }))
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
                        {itemErrors?.name && (
                          <p className="text-red-500 text-xs mt-1">{itemErrors.name.message}</p>
                        )}
                        {selectedProducts[index] && (selectedProducts[index].hasVariants || selectedProducts[index].isStitched) && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {selectedProducts[index].hasVariants && (
                              <span className="inline-flex items-center px-2 py-1 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium">Has variants</span>
                            )}
                            {selectedProducts[index].isStitched && (
                              <span className="inline-flex items-center px-2 py-1 rounded-lg bg-amber-50 text-amber-800 text-xs font-medium">Stitched</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* When product has variants/stitched: no variant section here; all variant selection is in VARIANTS cards below. */}

                      {/* Quantity & price: only when product has no variants/stitched */}
                      {!showVariantsSection && (
                        <>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-4">
                        2. Quantity & price
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Qty <span className="text-red-500">*</span>
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
                          className={`w-full min-h-[44px] px-3 py-2.5 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 touch-manipulation ${
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
                          Price (Rs.) <span className="text-red-500">*</span>
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
                          className={`w-full min-h-[44px] px-3 py-2.5 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 touch-manipulation ${
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
                          Item total (Rs.)
                        </label>
                        <input
                          type="text"
                          value={itemTotal.toFixed(2)}
                          readOnly
                          className="w-full px-3 py-2 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-sm"
                        />
                      </div>
                      </div>
                        </>
                      )}

                      {/* SKU & Category: product-level SKU when product has variants, item SKU otherwise */}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        {selectedProducts[index] || pendingProductsByRow[index] ? (
                          <>
                            <span className="text-gray-500">
                              SKU: <span className="text-gray-700 font-medium">
                                {showVariantsSection
                                  ? (selectedProducts[index]?.sku ?? pendingProductsByRow[index]?.sku ?? '—')
                                  : (watch(`items.${index}.sku`) || selectedProducts[index]?.sku || pendingProductsByRow[index]?.sku || '—')}
                              </span>
                            </span>
                            <span className="text-gray-500">
                              Category: <span className="text-gray-700 font-medium">{watch(`items.${index}.category`) || selectedProducts[index]?.category || pendingProductsByRow[index]?.category || '—'}</span>
                            </span>
                          </>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
                              <input
                                {...register(`items.${index}.sku`)}
                                className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg text-sm"
                                placeholder="Auto-generated when product selected"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
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
                                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                  >
                                    <option value="">Select category (optional)</option>
                                    {categories.map(cat => (
                                      <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                    <option value="__new__">+ Add New Category</option>
                                  </select>
                                  {newCategoryInputs[index] && (
                                    <input
                                      {...register(`items.${index}.newCategory`)}
                                      className="w-full px-3 py-2 mt-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg text-sm"
                                      placeholder="Enter new category name"
                                      autoFocus
                                    />
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                    {/* Additional lines: when product has no variants but user added extra lines (e.g. switched product), show qty/price/remove so data is visible */}
                    {!showVariantsSection && variantIndices.length > 0 && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Additional lines</p>
                        {variantIndices.map((idx) => {
                          const vField = fields[idx]
                          const vItem = watchedItems[idx]
                          const vTotal = (parseFloat(vItem?.quantity) || 0) * (parseFloat(vItem?.purchasePrice) || 0)
                          if (!vField) return null
                          return (
                            <div key={vField.id} className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200">
                              <span className="text-sm text-gray-500 sm:flex-1 sm:min-w-[80px]">Same product</span>
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  {...register(`items.${idx}.quantity`, { required: true, min: 1, onChange: () => setTimeout(() => calculateTotal(), 100) })}
                                  type="number"
                                  min="1"
                                  className="min-h-[44px] w-16 sm:w-20 px-3 py-2.5 text-sm border border-gray-300 rounded-lg"
                                  placeholder="Qty"
                                />
                                <input
                                  {...register(`items.${idx}.purchasePrice`, { required: true, min: 0, onChange: () => setTimeout(() => calculateTotal(), 100) })}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="min-h-[44px] w-24 sm:w-28 px-3 py-2.5 text-sm border border-gray-300 rounded-lg"
                                  placeholder="Price"
                                />
                                <span className="text-sm text-gray-600 min-w-[4rem]">Rs. {vTotal.toFixed(2)}</span>
                              </div>
                              <button type="button" onClick={() => removeItem(idx)} className="min-h-[44px] min-w-[44px] p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg touch-manipulation self-start sm:self-center" aria-label="Remove line">
                                <TrashIcon className="h-5 w-5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Variant cards: only when variant or stitched product chosen; one price for all variants, quantity per row */}
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
                          {group.indices.map((linePosition, groupIdx) => {
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
                                    vProduct.tempId ? (
                                      <div className="flex flex-wrap gap-2 items-center">
                                        <input
                                          {...register(`items.${idx}.color`, { required: vProduct?.hasVariants || vProduct?.isStitched })}
                                          onChange={(e) => {
                                            const color = e.target.value
                                            setValue(`items.${idx}.color`, color, { shouldValidate: true })
                                            const productSku = watch(`items.${idx}.sku`) || vProduct?.sku || ''
                                            const size = watch(`items.${idx}.size`) || ''
                                            setValue(`items.${idx}.sku`, generateVariantSku(productSku, color, size))
                                          }}
                                          className="min-h-[44px] w-24 sm:w-28 px-3 py-2.5 text-sm border border-gray-300 rounded-lg"
                                          placeholder="Color *"
                                        />
                                        <input
                                          {...register(`items.${idx}.size`)}
                                          onChange={(e) => {
                                            const size = e.target.value
                                            setValue(`items.${idx}.size`, size, { shouldValidate: true })
                                            const productSku = watch(`items.${idx}.sku`) || vProduct?.sku || ''
                                            const color = watch(`items.${idx}.color`) || ''
                                            setValue(`items.${idx}.sku`, generateVariantSku(productSku, color, size))
                                          }}
                                          className="min-h-[44px] w-20 sm:w-24 px-3 py-2.5 text-sm border border-gray-300 rounded-lg"
                                          placeholder="Size"
                                        />
                                      </div>
                                    ) : (
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
                                            id={`add-purchase-item-${idx}-color`}
                                            aria-label={`Variant line ${groupIdx + 1} color`}
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
                                            placeholder="Color * (e.g. Blank)"
                                            list={productVariants[idx]?.length ? `color-options-${idx}` : undefined}
                                          />
                                          <input
                                            id={`add-purchase-item-${idx}-size`}
                                            aria-label={`Variant line ${groupIdx + 1} size`}
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
                                            list={productVariants[idx]?.length ? `size-options-${idx}` : undefined}
                                          />
                                          {productVariants[idx]?.length > 0 && (
                                            <>
                                              <datalist id={`color-options-${idx}`}>
                                                {[...new Set(productVariants[idx].map(v => v.color))].map(c => (
                                                  <option key={c} value={c} />
                                                ))}
                                              </datalist>
                                              <datalist id={`size-options-${idx}`}>
                                                {[...new Set(productVariants[idx].map(v => v.size).filter(Boolean))].map(s => (
                                                  <option key={s} value={s} />
                                                ))}
                                              </datalist>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  ) : (
                                    <span className="text-sm text-gray-500">Same product</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                  <label className="sr-only">Qty</label>
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
                          {selectedProducts[firstIndex]?.hasVariants && !selectedProducts[firstIndex]?.tempId && (
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
                        {addVariantForIndex === firstIndex && selectedProducts[firstIndex]?.hasVariants && !selectedProducts[firstIndex]?.tempId && (
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
                                      [firstIndex]: {
                                        ...(prev[firstIndex] || {}),
                                        color
                                      }
                                    }))
                                  }}
                                  className="w-full min-h-[44px] px-3 py-2.5 text-sm border border-gray-300 rounded-lg"
                                  placeholder="Color"
                                  list={`color-options-${firstIndex}`}
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
                                      [firstIndex]: {
                                        ...(prev[firstIndex] || {}),
                                        size
                                      }
                                    }))
                                  }}
                                  className="w-full min-h-[44px] px-3 py-2.5 text-sm border border-gray-300 rounded-lg"
                                  placeholder={selectedProducts[firstIndex]?.isStitched ? 'Required' : 'Optional'}
                                  list={`size-options-${firstIndex}`}
                                />
                              </div>
                              {productVariants[firstIndex]?.length > 0 && (
                                <>
                                  <datalist id={`color-options-${firstIndex}`}>
                                    {[...new Set(productVariants[firstIndex].map(v => v.color))].map(c => <option key={c} value={c} />)}
                                  </datalist>
                                  <datalist id={`size-options-${firstIndex}`}>
                                    {[...new Set(productVariants[firstIndex].map(v => v.size).filter(Boolean))].map(s => <option key={s} value={s} />)}
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
                                    v.color === watch(`items.${firstIndex}.color`)?.trim() &&
                                    (v.size || '') === (watch(`items.${firstIndex}.size`)?.trim() || '')
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

                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <textarea
                        {...register(`items.${index}.description`)}
                        className="w-full min-h-[80px] px-3 py-2.5 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 touch-manipulation"
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
                onClick={addReturnItem}
                className="inline-flex items-center px-3 py-2 border border-red-300 rounded-lg text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
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
                const fieldKey = `returnItems.${index}`

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
                              setReturnSearchTimeouts(prev => {
                                if (prev[fieldKey]) clearTimeout(prev[fieldKey])
                                return { ...prev, [fieldKey]: null }
                              })
                              setTimeout(() => calculateTotal(), 100)
                              if (productName.length >= 2) {
                                const timeout = setTimeout(() => {
                                  if (watch(`returnItems.${index}.name`)?.trim() !== productName) return
                                  searchReturnProducts(fieldKey, productName)
                                }, 500)
                                setReturnSearchTimeouts(prev => ({ ...prev, [fieldKey]: timeout }))
                              } else {
                                setReturnProductSuggestions(prev => ({ ...prev, [fieldKey]: [] }))
                                setShowReturnProductSuggestions(prev => ({ ...prev, [fieldKey]: false }))
                              }
                            }
                          })}
                          className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg ${
                            returnItemErrors?.name ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="Type to search products..."
                          autoComplete="off"
                          onFocus={() => {
                            const productName = watch(`returnItems.${index}.name`)?.trim()
                            if (productName && productName.length >= 2 && returnProductSuggestions[fieldKey]?.length > 0) {
                              setShowReturnProductSuggestions(prev => ({ ...prev, [fieldKey]: true }))
                            }
                          }}
                          onBlur={() => {
                            setTimeout(() => {
                              setShowReturnProductSuggestions(prev => ({ ...prev, [fieldKey]: false }))
                            }, 200)
                          }}
                        />
                        {showReturnProductSuggestions[fieldKey] && returnProductSuggestions[fieldKey]?.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                            {returnProductSuggestions[fieldKey].map((product) => (
                              <div
                                key={product.id}
                                className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                onClick={() => {
                                  setValue(`returnItems.${index}.name`, product.name)
                                  setValue(`returnItems.${index}.purchasePrice`, product.lastPurchasePrice ?? 0)
                                  setValue(`returnItems.${index}.category`, product.category ?? '')
                                  setValue(`returnItems.${index}.sku`, product.sku ?? '')
                                  setValue(`returnItems.${index}.description`, product.description ?? '')
                                  setShowReturnProductSuggestions(prev => ({ ...prev, [fieldKey]: false }))
                                  setTimeout(() => calculateTotal(), 100)
                                }}
                              >
                                <div className="font-medium text-gray-900">{product.name}</div>
                                {product.category && (
                                  <div className="text-xs text-gray-500">Category: {product.category}</div>
                                )}
                                {product.lastPurchasePrice != null && (
                                  <div className="text-xs text-gray-500">Last Price: Rs. {Number(product.lastPurchasePrice).toFixed(2)}</div>
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
                          className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg ${
                            returnItemErrors?.quantity ? 'border-red-300' : 'border-gray-300'
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
                          className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg ${
                            returnItemErrors?.purchasePrice ? 'border-red-300' : 'border-gray-300'
                          }`}
                          placeholder="0.00"
                        />
                        {returnItemErrors?.purchasePrice && (
                          <p className="text-red-500 text-xs mt-1">{returnItemErrors.purchasePrice.message}</p>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">SKU</label>
                        <input
                          {...register(`returnItems.${index}.sku`)}
                          className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg"
                          placeholder="Enter SKU (optional)"
                        />
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">Category</label>
                        <select
                          {...register(`returnItems.${index}.category`)}
                          className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg"
                        >
                          <option value="">Select category</option>
                          {categories.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="block text-sm font-bold text-gray-900 mb-2">Return Total (Rs.)</label>
                        <input
                          type="text"
                          value={returnItemTotal.toFixed(2)}
                          className="w-full px-3 py-2 bg-gray-100 text-gray-900 border-2 border-gray-300 rounded-lg cursor-not-allowed"
                          readOnly
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="block text-sm font-bold text-gray-900 mb-2">Description</label>
                      <textarea
                        {...register(`returnItems.${index}.description`)}
                        className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg"
                        rows={2}
                        placeholder="Enter return description (optional)"
                      />
                    </div>
                  </div>
                )
              })}
              {returnFields.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No return items added. Click &quot;Add Return Item&quot; to add returns.</p>
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
                              setValue('paymentStatus', e.target.value, { shouldValidate: true })
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

          {/* Notes - at bottom before actions */}
          <div className="card p-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              {...register('notes')}
              className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              placeholder="Enter additional notes (optional)"
            />
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

        {/* Create Product Modal - mobile-friendly (bottom sheet on small screens) */}
        {showCreateProductModal && (
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
                  const productData = {
                    name: formData.get('name'),
                    description: formData.get('description') || null,
                    category: (formData.get('category') || '').trim() || null,
                    sku: formData.get('sku') || null,
                    isStitched: formData.get('isStitched') === 'on',
                    hasVariants: formData.get('hasVariants') === 'on'
                  }

                  const idx = createProductContextIndex
                  if (idx === null) return
                  const pending = {
                    name: productData.name,
                    description: productData.description || null,
                    category: (productData.category || '').trim() || null,
                    sku: productData.sku || null,
                    isStitched: productData.isStitched || false,
                    hasVariants: productData.hasVariants || false
                  }
                  setPendingProductsByRow(prev => ({ ...prev, [idx]: pending }))
                  const newCategory = pending.category
                  if (newCategory && !categories.includes(newCategory)) {
                    setCategories(prev => [...prev, newCategory].sort())
                  }
                  const pendingProductForRow = {
                    tempId: `pending-${idx}`,
                    id: null,
                    name: pending.name,
                    category: pending.category || '',
                    sku: pending.sku || '',
                    hasVariants: pending.hasVariants,
                    isStitched: pending.isStitched
                  }
                  setSelectedProducts(prev => ({ ...prev, [idx]: pendingProductForRow }))
                  setValue(`items.${idx}.name`, pending.name)
                  setValue(`items.${idx}.category`, pending.category || '')
                  setValue(`items.${idx}.sku`, pending.sku || '')
                  setValue(`items.${idx}.productId`, null)
                  setValue(`items.${idx}.productVariantId`, null)
                  setProductVariants(prev => ({ ...prev, [idx]: [] }))
                  toast.success('Product added to this row.')
                  setShowCreateProductModal(false)
                  setCreateProductPrefillName('')
                  setCreateProductSku('')
                  setCreateProductCategory('')
                  setCreateProductShowNewCategory(false)
                  setCreateProductContextIndex(null)
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
                    {createProductContextIndex !== null && (
                      <p className="text-xs text-gray-500 mt-1">Product will be used in this purchase row after creation.</p>
                    )}
                  </div>

                  <input type="hidden" name="category" value={createProductCategory} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Category
                      </label>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        SKU
                      </label>
                      <input
                        name="sku"
                        type="text"
                        value={createProductSku}
                        onChange={(e) => setCreateProductSku(e.target.value)}
                        className="w-full px-3 py-2.5 sm:py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm touch-manipulation"
                        placeholder="Auto-generated from name"
                      />
                      <p className="text-xs text-gray-500 mt-1">Auto-generated from product name; you can edit.</p>
                    </div>
                  </div>

                  {/* Prominent product type options - mobile-friendly cards */}
                  <div className="space-y-3 pt-2">
                    <p className="text-sm font-semibold text-gray-800">Product type</p>
                    <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-colors touch-manipulation min-h-[56px] has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 has-[:checked]:ring-2 has-[:checked]:ring-blue-200">
                      <input
                        type="checkbox"
                        name="isStitched"
                        className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                      />
                      <div>
                        <span className="font-medium text-gray-900 block">Stitched product</span>
                        <span className="text-sm text-gray-600">Requires size; e.g. garments, custom stitched items.</span>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-colors touch-manipulation min-h-[56px] has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50 has-[:checked]:ring-2 has-[:checked]:ring-blue-200">
                      <input
                        type="checkbox"
                        name="hasVariants"
                        className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                      />
                      <div>
                        <span className="font-medium text-gray-900 block">Has variants</span>
                        <span className="text-sm text-gray-600">Color/size options; separate stock per variant.</span>
                      </div>
                    </label>
                  </div>

                  {/* Description – always at bottom */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
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

export default AddPurchasePage

