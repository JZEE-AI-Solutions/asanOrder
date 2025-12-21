import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  ShoppingCartIcon, 
  PlusIcon, 
  MinusIcon, 
  XMarkIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  CurrencyDollarIcon,
  UserIcon,
  PhoneIcon,
  MapPinIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import api, { getImageUrl } from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'
import CartModal from './CartModal'
import CityAutocomplete from './CityAutocomplete'
import WhatsAppConfirmationModal from './WhatsAppConfirmationModal'

const ShoppingCartForm = ({ form, onSubmit }) => {
  const { formLink } = useParams()
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [filteredProducts, setFilteredProducts] = useState([])
  const [cart, setCart] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showCart, setShowCart] = useState(false)
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [customerInfo, setCustomerInfo] = useState({})
  const [shippingCharges, setShippingCharges] = useState(0)
  const [loadingShipping, setLoadingShipping] = useState(false)
  const [whatsappModal, setWhatsappModal] = useState({ isOpen: false, url: null, phone: null, orderId: null })

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    trigger
  } = useForm({
    mode: 'onChange', // Validate on change for better UX
    reValidateMode: 'onChange'
  })

  useEffect(() => {
    if (form) {
      fetchProducts()
      loadCustomerInfo()
    }
  }, [form])

  useEffect(() => {
    filterProducts()
  }, [searchTerm])

  // Calculate shipping charges when city or cart changes
  useEffect(() => {
    const calculateShipping = async () => {
      const city = watch('City')
      if (!city || cart.length === 0 || !form?.tenantId) {
        setShippingCharges(0)
        return
      }

      try {
        setLoadingShipping(true)
        const requestData = {
          tenantId: form.tenantId,
          city: city,
          products: cart.map(item => ({ id: item.id, quantity: item.quantity })),
          productQuantities: cart.reduce((acc, item) => {
            acc[item.id] = item.quantity
            return acc
          }, {})
        }
        console.log('🛒 Frontend shipping calculation request:', requestData)
        const response = await api.post('/shipping/calculate', requestData)
        console.log('🛒 Frontend shipping calculation response:', response.data)
        const calculatedCharges = response.data.shippingCharges || 0
        setShippingCharges(calculatedCharges)
        console.log('🛒 Set shipping charges to:', calculatedCharges)
      } catch (error) {
        console.error('Error calculating shipping:', error)
        console.error('Error details:', error.response?.data)
        setShippingCharges(0)
      } finally {
        setLoadingShipping(false)
      }
    }

    calculateShipping()
  }, [cart, watch('City'), form?.tenantId])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      
      // Check if form has PRODUCT_SELECTOR fields with selected products
      const productSelectorFields = form.fields?.filter(field => field.fieldType === 'PRODUCT_SELECTOR')
      
      if (productSelectorFields && productSelectorFields.length > 0) {
        // If form has selected products, use those (like Simple Cart)
        const firstField = productSelectorFields[0]
        if (firstField.selectedProducts) {
          let selectedProducts = firstField.selectedProducts
          if (typeof selectedProducts === 'string') {
            try {
              selectedProducts = JSON.parse(selectedProducts)
            } catch (error) {
              console.error('Error parsing selectedProducts:', error)
              selectedProducts = []
            }
          }
          
          if (Array.isArray(selectedProducts) && selectedProducts.length > 0) {
            // Get product IDs and fetch full product data
            const productIds = selectedProducts.map(p => p.id)
            const response = await api.post('/products/by-ids', {
              productIds: productIds,
              tenantId: form.tenantId
            })
            const productsData = response.data.products || []
            // Merge with prices from selectedProducts if available
            const productsWithPrices = productsData.map(product => {
              const selectedProduct = selectedProducts.find(p => p.id === product.id)
              // Use price from selectedProducts if available (even if 0), otherwise use currentRetailPrice
              let price
              if (selectedProduct && selectedProduct.price !== undefined && selectedProduct.price !== null) {
                price = typeof selectedProduct.price === 'number' 
                  ? selectedProduct.price 
                  : parseFloat(selectedProduct.price) || 0
              } else {
                price = product.currentRetailPrice ? parseFloat(product.currentRetailPrice) || 0 : 0
              }
              console.log('🛒 Loading product for cart:', product.name, 'Price from form:', selectedProduct?.price, 'Final price:', price)
              return {
                ...product,
                price: price
              }
            })
            setProducts(productsWithPrices)
            setFilteredProducts(productsWithPrices)
            return
          }
        }
      }
      
      // If no selected products, get all products (full shopping catalog)
      const response = await api.post('/products/by-ids', {
        productIds: [], // Empty array to get all products
        tenantId: form.tenantId
      })
      const productsData = response.data.products || []
      setProducts(productsData)
      setFilteredProducts(productsData)
    } catch (error) {
      console.error('Error fetching products:', error)
      toast.error('Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const loadCustomerInfo = () => {
    // Load customer info from form fields if any
    // This is now just for reference - form values are managed by react-hook-form
    if (form.fields) {
      const customerFields = form.fields.filter(field => 
        ['TEXT', 'EMAIL', 'PHONE', 'ADDRESS', 'TEXTAREA'].includes(field.fieldType)
      )
      
      const initialCustomerInfo = {}
      customerFields.forEach(field => {
        // Use field.label as the key to match react-hook-form registration
        initialCustomerInfo[field.label] = ''
      })
      
      setCustomerInfo(initialCustomerInfo)
    }
  }

  const filterProducts = async () => {
    if (!searchTerm) {
      setFilteredProducts(products)
    } else {
      // Use client-side filtering for now (same as Simple Cart forms)
      const filtered = products.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredProducts(filtered)
    }
  }

  const addToCart = (product) => {
    // Check if product is in stock
    const stock = product.currentQuantity || product.quantity || 0
    if (stock <= 0) {
      toast.error(`${product.name} is out of stock`)
      return
    }
    
    const existingItem = cart.find(item => item.id === product.id)
    
    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ))
    } else {
      // Use product.price (from form's selectedProducts) if available, otherwise use currentRetailPrice
      const productPrice = product.price !== undefined && product.price !== null
        ? (typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0)
        : (product.currentRetailPrice ? parseFloat(product.currentRetailPrice) || 0 : 0)
      console.log('🛒 Adding to cart:', product.name, 'Price:', productPrice, 'From product.price:', product.price, 'From currentRetailPrice:', product.currentRetailPrice)
      setCart([...cart, { 
        ...product, 
        quantity: 1,
        price: productPrice,
        hasImage: product.hasImage
      }])
    }
    toast.success(`${product.name} added to cart`)
  }

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.id !== productId))
    toast.success('Item removed from cart')
  }

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }
    
    setCart(cart.map(item =>
      item.id === productId
        ? { ...item, quantity }
        : item
    ))
  }

  const getSubtotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0)
  }

  const getTotalPrice = () => {
    return getSubtotal() + shippingCharges
  }

  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0)
  }

  const handleWhatsAppConfirm = () => {
    if (whatsappModal.url) {
      const whatsappWindow = window.open(whatsappModal.url, '_blank', 'noopener,noreferrer')
      if (whatsappWindow) {
        toast.success('Opening WhatsApp...', { duration: 2000 })
      } else {
        toast.error('Please allow popups to open WhatsApp', { duration: 3000 })
      }
    }
    const orderId = whatsappModal.orderId
    setWhatsappModal({ isOpen: false, url: null, phone: null, orderId: null })
    // Redirect to order receipt page after closing modal
    if (orderId) {
      setTimeout(() => {
        navigate(`/order/${orderId}`)
      }, 500)
    }
  }

  const handleWhatsAppCancel = () => {
    const orderId = whatsappModal.orderId
    setWhatsappModal({ isOpen: false, url: null, phone: null, orderId: null })
    // Redirect to order receipt page after closing modal
    if (orderId) {
      setTimeout(() => {
        navigate(`/order/${orderId}`)
      }, 500)
    }
  }

  const handleFormSubmit = async (data) => {
    // Prevent double submission
    if (submitting) {
      console.log('⚠️ Submission already in progress, ignoring duplicate submit')
      return
    }

    if (cart.length === 0) {
      toast.error('Please add items to your cart')
      return
    }

    setSubmitting(true)

    try {
      // react-hook-form already validated all fields before calling this function
      // If we reach here, all required fields are valid
      console.log('Form submission data:', data)
      
      // Prepare formData as an object (not stringified) - backend will stringify it
      // This matches the format expected by the backend validation
      const formData = {}
      if (form.fields) {
        form.fields.forEach(field => {
          if (['TEXT', 'EMAIL', 'PHONE', 'ADDRESS', 'TEXTAREA'].includes(field.fieldType)) {
            const value = data[field.label]
            if (field.isRequired) {
              formData[field.label] = value || ''
            } else if (value !== undefined && value !== null && value !== '' && value !== 0) {
              formData[field.label] = value
            }
          }
        })
      }
      
      // Always include City field (required)
      if (data.City) {
        formData.City = data.City
      }

      const orderData = {
        formLink: formLink || form.formLink,
        formData: formData, // Send as object, not stringified
        paymentAmount: null,
        images: [],
        paymentReceipt: null,
        selectedProducts: cart.length > 0 ? JSON.stringify(cart.map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity
        }))) : null,
        productQuantities: JSON.stringify(cart.reduce((acc, item) => {
          acc[item.id] = item.quantity
          return acc
        }, {})),
        productPrices: JSON.stringify(cart.reduce((acc, item) => {
          acc[item.id] = item.price
          return acc
        }, {}))
      }

      console.log('📤 Submitting order data:', orderData)
      console.log('📝 Form data details:', JSON.stringify(orderData.formData, null, 2))
      console.log('🛍️ Selected Products (stringified):', orderData.selectedProducts)
      console.log('📦 Product Quantities (stringified):', orderData.productQuantities)
      console.log('💰 Product Prices (stringified):', orderData.productPrices)
      
      const response = await api.post('/order/submit', orderData)
      console.log('✅ Order response:', response.data)
      
      toast.success('Order submitted successfully! 🎉')
      
      // Show WhatsApp confirmation modal if URL is available (for business owner)
      if (response.data.whatsappUrl) {
        setWhatsappModal({
          isOpen: true,
          url: response.data.whatsappUrl,
          phone: response.data.businessOwnerPhone || 'business owner',
          orderId: response.data.order.id
        })
      } else {
        // Redirect to order receipt page if no WhatsApp
        setTimeout(() => {
          navigate(`/order/${response.data.order.id}`)
        }, 1500)
      }
      
    } catch (error) {
      console.error('Submit error:', error)
      console.error('Error response:', error.response?.data)
      
      if (error.response?.data?.missingFields) {
        const missingFields = error.response.data.missingFields
        toast.error(`Missing required fields: ${missingFields.join(', ')}`)
      } else if (error.response?.data?.error) {
        toast.error(error.response.data.error)
      } else {
        toast.error('Failed to submit order')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const renderCustomerFields = () => {
    if (!form.fields) return null

    const customerFields = form.fields.filter(field => 
      ['TEXT', 'EMAIL', 'PHONE', 'ADDRESS', 'TEXTAREA'].includes(field.fieldType)
    )

    return customerFields.map((field, index) => {
      const Icon = getFieldIcon(field.fieldType)
      // Use field.label as the form field name (consistent with react-hook-form)
      const fieldName = field.label
      const hasError = errors[fieldName]
      const errorMessage = hasError?.message || (hasError ? `${field.label} is required` : null)
      
      return (
        <div key={index} className="space-y-2">
          <label className={`block text-sm font-medium ${hasError ? 'text-red-700' : 'text-gray-700'}`}>
            {field.label} {field.isRequired && <span className="text-red-500">*</span>}
          </label>
          {field.fieldType === 'TEXTAREA' ? (
            <div>
              <textarea
                {...register(fieldName, { 
                  required: field.isRequired ? `${field.label} is required` : false,
                  validate: (value) => {
                    if (field.isRequired && (!value || value.trim() === '')) {
                      return `${field.label} is required`
                    }
                    return true
                  }
                })}
                placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                className={`w-full px-3 py-2 border-2 rounded-md focus:outline-none focus:ring-2 bg-white text-gray-900 transition-colors ${
                  hasError
                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500 bg-red-50' 
                    : 'border-gray-300 focus:ring-pink-500 focus:border-pink-500'
                }`}
                rows={3}
              />
              {errorMessage && (
                <p className="mt-1 text-red-600 text-sm font-medium flex items-center gap-1.5">
                  <span className="text-red-500">●</span>
                  <span>{errorMessage}</span>
                </p>
              )}
            </div>
          ) : (
            <div>
              <div className="relative">
                <Icon className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 ${hasError ? 'text-red-400' : 'text-gray-400'}`} />
                <input
                  type={field.fieldType === 'EMAIL' ? 'email' : field.fieldType === 'PHONE' ? 'tel' : 'text'}
                  {...register(fieldName, { 
                    required: field.isRequired ? {
                      value: true,
                      message: `${field.label} is required`
                    } : false,
                    pattern: field.fieldType === 'EMAIL' ? {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Please enter a valid email address'
                    } : undefined,
                    validate: (value) => {
                      // Convert to string and trim
                      const stringValue = value ? String(value).trim() : ''
                      
                      // Handle empty values for required fields
                      if (field.isRequired && (!stringValue || stringValue === '')) {
                        return `${field.label} is required`
                      }
                      
                      // Skip validation for empty non-required fields
                      if (!stringValue || stringValue === '') {
                        return true
                      }
                      
                      // Pakistan mobile phone number validation
                      if (field.fieldType === 'PHONE') {
                        // Remove spaces, dashes, plus signs, and parentheses
                        const cleanedValue = stringValue.replace(/[\s\-+()]/g, '')
                        
                        // Must be all digits
                        if (!/^\d+$/.test(cleanedValue)) {
                          return 'Phone number should contain only digits'
                        }
                        
                        // Pakistan mobile number patterns:
                        // 1. 03XXXXXXXXX (11 digits starting with 03) - local format
                        // 2. 923XXXXXXXXX (12 digits starting with 923) - international format
                        // 3. 00923XXXXXXXXX (13 digits starting with 00923) - alternative format
                        
                        // For numbers starting with 03, should be 11 digits total
                        if (cleanedValue.startsWith('03')) {
                          if (cleanedValue.length !== 11) {
                            return 'Pakistan mobile number should be 11 digits (e.g., 03001234567)'
                          }
                          // Check if it's all digits and valid format
                          if (!/^03[0-9]{9}$/.test(cleanedValue)) {
                            return 'Please enter a valid Pakistan mobile number'
                          }
                          return true
                        }
                        
                        // For numbers starting with 923, should be 12 digits (923XXXXXXXXX)
                        if (cleanedValue.startsWith('923')) {
                          if (cleanedValue.length !== 12) {
                            return 'Pakistan mobile number with country code should be 12 digits (e.g., 923001234567)'
                          }
                          // Check if it's all digits - 923 followed by 9 digits
                          if (!/^923[0-9]{9}$/.test(cleanedValue)) {
                            return 'Please enter a valid Pakistan mobile number'
                          }
                          return true
                        }
                        
                        // For numbers starting with 92 but not 923
                        if (cleanedValue.startsWith('92') && !cleanedValue.startsWith('923')) {
                          return 'Pakistan mobile number should start with 923 (e.g., 923001234567)'
                        }
                        
                        // For numbers starting with 0092 (alternative format)
                        if (cleanedValue.startsWith('0092')) {
                          if (cleanedValue.length !== 13) {
                            return 'Invalid Pakistan mobile number format'
                          }
                          if (!cleanedValue.startsWith('00923')) {
                            return 'Pakistan mobile number should start with 00923'
                          }
                          return true
                        }
                        
                        // If it doesn't match any pattern, show helpful error
                        if (cleanedValue.length < 11) {
                          return 'Phone number is too short'
                        }
                        if (cleanedValue.length > 13) {
                          return 'Phone number is too long'
                        }
                        return 'Please enter a valid Pakistan mobile number (e.g., 03001234567 or 923001234567)'
                      }
                      
                      return true
                    }
                  })}
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                  className={`w-full pl-10 pr-3 py-2 border-2 rounded-md focus:outline-none focus:ring-2 bg-white text-gray-900 transition-colors ${
                    hasError
                      ? 'border-red-500 focus:ring-red-500 focus:border-red-500 bg-red-50' 
                      : 'border-gray-300 focus:ring-pink-500 focus:border-pink-500'
                  }`}
                />
              </div>
              {errorMessage && (
                <p className="mt-1 text-red-600 text-sm font-medium flex items-center gap-1.5">
                  <span className="text-red-500">●</span>
                  <span>{errorMessage}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )
    })
  }

  const getFieldIcon = (fieldType) => {
    switch (fieldType) {
      case 'EMAIL': return UserIcon
      case 'PHONE': return PhoneIcon
      case 'ADDRESS': return MapPinIcon
      default: return DocumentTextIcon
    }
  }

  if (loading) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* E-commerce Header/Navigation Bar */}
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo/Brand */}
            <div className="flex items-center space-x-3">
              <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg p-2">
                <ShoppingCartIcon className="h-6 w-6 md:h-8 md:w-8 text-white" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-gray-900">
                  {form.tenant?.businessName || form.name}
                </h1>
                {form.description && (
                  <p className="text-xs md:text-sm text-gray-500 hidden sm:block">
                    {form.description}
                  </p>
                )}
              </div>
            </div>

            {/* Search Bar - Desktop */}
            <div className="hidden md:flex flex-1 max-w-2xl mx-8">
              <div className="relative w-full">
                <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white text-gray-900"
                />
              </div>
            </div>

            {/* Cart Button */}
            <button
              onClick={() => setShowCart(true)}
              className="relative bg-pink-600 hover:bg-pink-700 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg transition-colors flex items-center space-x-2 font-medium shadow-md hover:shadow-lg"
            >
              <ShoppingCartIcon className="h-5 w-5 md:h-6 md:w-6" />
              <span className="hidden sm:inline">Cart</span>
              {getTotalItems() > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 md:h-6 md:w-6 flex items-center justify-center font-bold">
                  {getTotalItems()}
                </span>
              )}
            </button>
          </div>

          {/* Search Bar - Mobile */}
          <div className="md:hidden pb-4">
            <div className="relative w-full">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white text-gray-900"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-pink-500 to-pink-600 rounded-2xl p-6 md:p-12 mb-8 text-center text-white">
          <h2 className="text-2xl md:text-4xl font-bold mb-3">
            Welcome to {form.tenant?.businessName || form.name}
          </h2>
          <p className="text-pink-100 text-base md:text-lg max-w-2xl mx-auto">
            {form.description || 'Discover our amazing collection of premium products'}
          </p>
        </div>

        {/* Products Section */}
        <div>
          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl md:text-2xl font-bold text-gray-900">
              Our Products
            </h3>
            <span className="text-sm text-gray-500">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'product' : 'products'}
            </span>
          </div>

          {/* Products Grid - E-commerce Style */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
            {filteredProducts.map((product) => (
              <div 
                key={product.id} 
                className={`group bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 border border-gray-100 ${(product.currentQuantity || product.quantity || 0) <= 0 ? 'opacity-75' : ''}`}
              >
                {/* Product Image */}
                <div className="relative overflow-hidden bg-gray-100 aspect-square">
                  <img
                    src={getImageUrl('product', product.id, true)}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    onError={(e) => {
                      e.target.style.display = 'none'
                      if (e.target.nextElementSibling) {
                        e.target.nextElementSibling.style.display = 'flex'
                      }
                    }}
                    onLoad={(e) => {
                      if (e.target.nextElementSibling) {
                        e.target.nextElementSibling.style.display = 'none'
                      }
                    }}
                  />
                  <div className="w-full h-full bg-gray-100 flex items-center justify-center absolute inset-0" style={{display: 'none'}}>
                    <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  
                  {/* Sold Out Badge */}
                  {(product.currentQuantity || product.quantity || 0) <= 0 && (
                    <div className="absolute top-3 right-3 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                      Sold Out
                    </div>
                  )}

                  {/* Stock Badge */}
                  {(product.currentQuantity || product.quantity || 0) > 0 && (product.currentQuantity || product.quantity || 0) < 10 && (
                    <div className="absolute top-3 right-3 bg-yellow-500 text-white px-3 py-1 rounded-full text-xs font-semibold">
                      Low Stock
                    </div>
                  )}
                </div>
                
                {/* Product Info */}
                <div className="p-4 md:p-6">
                  <h3 className="text-base md:text-lg font-bold text-gray-900 mb-2 group-hover:text-pink-600 transition-colors line-clamp-2 min-h-[3rem]">
                    {product.name}
                  </h3>
                  
                  {/* Price and Stock */}
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xl md:text-2xl font-bold text-gray-900">
                        Rs.{((product.price !== undefined && product.price !== null) 
                          ? (typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0)
                          : (product.currentRetailPrice ? parseFloat(product.currentRetailPrice) || 0 : 0)
                        ).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      </span>
                      {(product.currentQuantity || product.quantity || 0) > 0 && (
                        <span className="text-xs md:text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {product.currentQuantity || product.quantity || 0} in stock
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Add to Cart Button */}
                  {(product.currentQuantity || product.quantity || 0) > 0 ? (
                    <button
                      onClick={() => addToCart(product)}
                      className="w-full bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 text-white py-3 px-4 rounded-lg transition-all flex items-center justify-center space-x-2 font-semibold text-sm md:text-base shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                    >
                      <PlusIcon className="h-5 w-5" />
                      <span>Add to Cart</span>
                    </button>
                  ) : (
                    <div className="w-full bg-gray-100 text-gray-500 py-3 px-4 text-center font-semibold text-sm md:text-base rounded-lg cursor-not-allowed">
                      Out of Stock
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="text-center py-16 bg-white rounded-xl shadow-md">
              <MagnifyingGlassIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg md:text-xl font-medium">No products found</p>
              <p className="text-gray-400 text-sm md:text-base mt-2">Try adjusting your search terms</p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Company Info */}
            <div className="col-span-1 md:col-span-2">
              <h3 className="text-lg font-bold text-gray-900 mb-4">{form.tenant?.businessName || 'Your Business'}</h3>
              <p className="text-gray-600 mb-4">
                Elevate your shopping experience with our curated collection of premium products.
              </p>
              <div className="flex space-x-4">
                <a href="#" className="text-gray-400 hover:text-gray-600 transition-colors">
                  <span className="sr-only">Facebook</span>
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-gray-600 transition-colors">
                  <span className="sr-only">Instagram</span>
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 6.62 5.367 11.987 11.988 11.987s11.987-5.367 11.987-11.987C24.014 5.367 18.647.001 12.017.001zM8.449 16.988c-1.297 0-2.448-.49-3.323-1.297C4.198 14.895 3.708 13.744 3.708 12.447s.49-2.448 1.297-3.323c.875-.807 2.026-1.297 3.323-1.297s2.448.49 3.323 1.297c.807.875 1.297 2.026 1.297 3.323s-.49 2.448-1.297 3.323c-.875.807-2.026 1.297-3.323 1.297z"/>
                  </svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-gray-600 transition-colors">
                  <span className="sr-only">TikTok</span>
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                  </svg>
                </a>
              </div>
            </div>
            
            {/* Quick Links */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Quick Links</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-600 hover:text-gray-900 transition-colors">Home</a></li>
                <li><a href="#" className="text-gray-600 hover:text-gray-900 transition-colors">New In</a></li>
                <li><a href="#" className="text-gray-600 hover:text-gray-900 transition-colors">Woman</a></li>
                <li><a href="#" className="text-gray-600 hover:text-gray-900 transition-colors">Man</a></li>
                <li><a href="#" className="text-gray-600 hover:text-gray-900 transition-colors">Contact</a></li>
              </ul>
            </div>
            
            {/* Customer Service */}
            <div>
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Customer Service</h4>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-600 hover:text-gray-900 transition-colors">Refund Policy</a></li>
                <li><a href="#" className="text-gray-600 hover:text-gray-900 transition-colors">Shipping Info</a></li>
                <li><a href="#" className="text-gray-600 hover:text-gray-900 transition-colors">Size Guide</a></li>
                <li><a href="#" className="text-gray-600 hover:text-gray-900 transition-colors">FAQ</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-200 mt-8 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <p className="text-gray-500 text-sm">
                © 2025, {form.tenant?.businessName || 'Your Business'} Powered by AsanOrder
              </p>
              <div className="flex space-x-6 mt-4 md:mt-0">
                <a href="#" className="text-gray-500 hover:text-gray-700 text-sm">Privacy Policy</a>
                <a href="#" className="text-gray-500 hover:text-gray-700 text-sm">Terms of Service</a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Cart Button for Mobile */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 lg:hidden">
          <button
            onClick={() => setShowCart(true)}
            className="bg-pink-600 hover:bg-pink-700 text-white p-3 rounded-full shadow-lg transition-colors flex items-center space-x-2 min-w-[120px]"
          >
            <ShoppingCartIcon className="h-5 w-5" />
            <div className="flex flex-col items-start">
              <span className="text-xs font-semibold">{getTotalItems()} items</span>
              <span className="text-xs">Rs.{getTotalPrice().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>
            </div>
          </button>
        </div>
      )}

      {/* Cart Modal */}
      <CartModal
        isOpen={showCart}
        onClose={() => setShowCart(false)}
        cart={cart}
        shippingCharges={shippingCharges}
        loadingShipping={loadingShipping}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeFromCart}
        onCheckout={() => {
          setShowCart(false)
          setShowCustomerForm(true)
        }}
      />

      {/* Customer Form - Slide-in Drawer for Mobile, Modal for Desktop */}
      {showCustomerForm && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity z-40"
            onClick={() => setShowCustomerForm(false)}
          />
          
          {/* Slide-in Drawer - Mobile First Design */}
          <div className="fixed top-0 right-0 h-full w-full sm:w-[32rem] md:w-[36rem] bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out">
            {/* Header - Fixed */}
            <div className="bg-gradient-to-r from-pink-500 to-pink-600 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="bg-white bg-opacity-20 rounded-lg p-2 flex-shrink-0">
                  <UserIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg sm:text-xl font-bold text-white truncate">Customer Information</h2>
                  <p className="text-pink-100 text-xs sm:text-sm">Complete your order</p>
                </div>
              </div>
              <button
                onClick={() => setShowCustomerForm(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors flex-shrink-0 ml-2"
                aria-label="Close form"
              >
                <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
              </button>
            </div>

            {/* Customer Form - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50 min-h-0">
                <form 
                  id="customer-form" 
                  onSubmit={(e) => {
                    // Prevent double submission
                    if (submitting) {
                      e.preventDefault()
                      e.stopPropagation()
                      console.log('⚠️ Form submission blocked - already submitting')
                      return false
                    }
                    return handleSubmit(
                      handleFormSubmit,
                      (errors) => {
                        // This callback runs when validation fails
                        console.log('Form validation errors:', errors)
                        
                        // Show error message for first error
                        const firstErrorField = Object.keys(errors)[0]
                        if (firstErrorField) {
                          const errorMessage = errors[firstErrorField]?.message || `${firstErrorField} is required`
                          toast.error(`Missing required fields: ${firstErrorField}`)
                          
                          // Scroll to first error field
                          const errorElement = document.querySelector(`[name="${firstErrorField}"]`)
                          if (errorElement) {
                            errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            errorElement.focus()
                          }
                        }
                      }
                    )(e)
                  }} 
                  className="space-y-4 sm:space-y-5"
                  noValidate
                >
                  {renderCustomerFields()}
                  
                  {/* City Field - Always Required */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      City <span className="text-red-500">*</span>
                    </label>
                    <CityAutocomplete
                      name="City"
                      value={watch('City') || ''}
                      onChange={(e) => {
                        setValue('City', e.target.value, { shouldValidate: true })
                        trigger('City')
                      }}
                      onBlur={() => {
                        trigger('City')
                      }}
                      required={true}
                      error={errors.City?.message}
                      placeholder="Select or type city name"
                    />
                    <input
                      type="hidden"
                      {...register('City', {
                        required: {
                          value: true,
                          message: 'City is required'
                        },
                        validate: (value) => {
                          if (!value || value.trim() === '') {
                            return 'City is required'
                          }
                          return true
                        }
                      })}
                    />
                  </div>
                </form>
              </div>

            {/* Footer - Fixed at Bottom */}
            <div className="border-t-2 border-gray-200 bg-white p-4 sm:p-6 flex-shrink-0 shadow-lg">
              {/* Order Summary */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-5 mb-5 border border-gray-200">
                <div className="space-y-2 mb-3 pb-3 border-b border-gray-200">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600 font-medium">Subtotal ({getTotalItems()} {getTotalItems() === 1 ? 'item' : 'items'})</span>
                    <span className="font-semibold text-gray-900">
                      Rs.{getSubtotal().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600 font-medium">
                      Shipping {loadingShipping && <span className="text-gray-400">(calculating...)</span>}
                    </span>
                    <span className="font-semibold text-gray-900">
                      {loadingShipping ? (
                        <span className="text-gray-400">...</span>
                      ) : (
                        `Rs.${shippingCharges.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR`
                      )}
                    </span>
                  </div>
                </div>
                
                <div className="border-t-2 border-gray-300 pt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">Total Amount</span>
                    <span className="text-2xl md:text-3xl font-bold text-pink-600">
                      {loadingShipping ? (
                        <span className="text-gray-400">...</span>
                      ) : (
                        `Rs.${getTotalPrice().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR`
                      )}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <button
                  onClick={() => setShowCustomerForm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 sm:py-4 px-4 sm:px-6 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-base sm:text-lg"
                >
                  Back to Cart
                </button>
                <button
                  type="submit"
                  form="customer-form"
                  disabled={submitting}
                  className="flex-1 bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 text-white py-3 sm:py-4 px-4 sm:px-6 rounded-xl disabled:bg-gray-300 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-3 font-bold text-base sm:text-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  {submitting ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <>
                      <CurrencyDollarIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                      <span>Complete Order</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* WhatsApp Confirmation Modal */}
      <WhatsAppConfirmationModal
        isOpen={whatsappModal.isOpen}
        onClose={handleWhatsAppCancel}
        onConfirm={handleWhatsAppConfirm}
        customerPhone={whatsappModal.phone}
      />
    </div>
  )
}

export default ShoppingCartForm
