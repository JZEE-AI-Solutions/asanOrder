import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
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

const ShoppingCartForm = ({ form, onSubmit }) => {
  const [products, setProducts] = useState([])
  const [filteredProducts, setFilteredProducts] = useState([])
  const [cart, setCart] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showCart, setShowCart] = useState(false)
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [customerInfo, setCustomerInfo] = useState({})

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm()

  useEffect(() => {
    if (form) {
      fetchProducts()
      loadCustomerInfo()
    }
  }, [form])

  useEffect(() => {
    filterProducts()
  }, [searchTerm])

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
            setProducts(productsData)
            setFilteredProducts(productsData)
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
    if (form.fields) {
      const customerFields = form.fields.filter(field => 
        ['TEXT', 'EMAIL', 'PHONE', 'ADDRESS'].includes(field.fieldType)
      )
      
      const initialCustomerInfo = {}
      customerFields.forEach(field => {
        if (field.fieldType === 'EMAIL') {
          initialCustomerInfo.email = ''
        } else if (field.fieldType === 'PHONE') {
          initialCustomerInfo.phone = ''
        } else if (field.fieldType === 'ADDRESS') {
          initialCustomerInfo.address = ''
        } else {
          initialCustomerInfo[field.label.toLowerCase().replace(/\s+/g, '_')] = ''
        }
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
      setCart([...cart, { 
        ...product, 
        quantity: 1,
        price: product.currentRetailPrice || product.price || 0,
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

  const getTotalPrice = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0)
  }

  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0)
  }

  const handleFormSubmit = (data) => {
    if (cart.length === 0) {
      toast.error('Please add items to your cart')
      return
    }

    const orderData = {
      formData: JSON.stringify({ ...data, ...customerInfo }),
      selectedProducts: JSON.stringify(cart.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity
      }))),
      productQuantities: JSON.stringify(cart.reduce((acc, item) => {
        acc[item.id] = item.quantity
        return acc
      }, {})),
      productPrices: JSON.stringify(cart.reduce((acc, item) => {
        acc[item.id] = item.price
        return acc
      }, {}))
    }

    onSubmit(orderData)
  }

  const renderCustomerFields = () => {
    if (!form.fields) return null

    const customerFields = form.fields.filter(field => 
      ['TEXT', 'EMAIL', 'PHONE', 'ADDRESS', 'TEXTAREA'].includes(field.fieldType)
    )

    return customerFields.map((field, index) => {
      const Icon = getFieldIcon(field.fieldType)
      
      return (
        <div key={index} className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {field.label} {field.isRequired && <span className="text-red-500">*</span>}
          </label>
          {field.fieldType === 'TEXTAREA' ? (
            <textarea
              {...register(field.label, { 
                required: field.isRequired,
                value: customerInfo[field.label.toLowerCase().replace(/\s+/g, '_')] || ''
              })}
              placeholder={field.placeholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          ) : (
            <div className="relative">
              <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type={field.fieldType === 'EMAIL' ? 'email' : field.fieldType === 'PHONE' ? 'tel' : 'text'}
                {...register(field.label, { 
                  required: field.isRequired,
                  value: customerInfo[field.label.toLowerCase().replace(/\s+/g, '_')] || ''
                })}
                placeholder={field.placeholder}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
          {errors[field.label] && (
            <p className="text-red-500 text-sm">{errors[field.label].message}</p>
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
    <div className="min-h-screen bg-white">
      {/* Header - Brand Deals Style */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            {/* Logo/Brand */}
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">{form.tenant?.businessName || form.name}</h1>
            </div>
            
            {/* Navigation */}
            <nav className="hidden md:flex space-x-8">
              <a href="#" className="text-gray-700 hover:text-gray-900 font-medium">HOME</a>
              <a href="#" className="text-gray-700 hover:text-gray-900 font-medium">NEW IN</a>
              <a href="#" className="text-gray-700 hover:text-gray-900 font-medium">WOMAN</a>
              <a href="#" className="text-gray-700 hover:text-gray-900 font-medium">MAN</a>
              <a href="#" className="text-gray-700 hover:text-gray-900 font-medium">LUXE</a>
              <a href="#" className="text-gray-700 hover:text-gray-900 font-medium">HOME DECOR</a>
            </nav>
            
            {/* Cart Button - Brand Deals Style */}
            <button
              onClick={() => setShowCart(true)}
              className="relative bg-black text-white px-6 py-2 rounded-none hover:bg-gray-800 transition-colors flex items-center space-x-2 font-medium"
            >
              <ShoppingCartIcon className="h-5 w-5" />
              <span>Cart ({getTotalItems()})</span>
              {getTotalItems() > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {getTotalItems()}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section - Brand Deals Style */}
      <div className="bg-gray-50 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">UNSTITCHED</h2>
          <p className="text-lg text-gray-600 mb-8">NEW ARRIVALS</p>
          <div className="flex justify-center">
            <button className="bg-black text-white px-8 py-3 rounded-none hover:bg-gray-800 transition-colors font-medium">
              Shop all
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
          {/* Products Section */}
          <div className="lg:col-span-2">
            {/* Search and Filter - Brand Deals Style */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="relative w-full max-w-sm sm:max-w-md">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-none focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Products Grid - Brand Deals Style */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {filteredProducts.map((product) => (
                <div key={product.id} className={`group bg-white overflow-hidden hover:shadow-lg transition-all duration-300 ${(product.currentQuantity || product.quantity || 0) <= 0 ? 'opacity-75' : ''}`}>
                  {/* Product Image */}
                  <div className="relative overflow-hidden">
                    {product.hasImage ? (
                      <img
                        src={getImageUrl('product', product.id, true)}
                        alt={product.name}
                        className="w-full h-80 object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => {
                          e.target.style.display = 'none'
                          e.target.nextElementSibling.style.display = 'flex'
                        }}
                      />
                    ) : null}
                    <div style={{display: product.hasImage ? 'none' : 'flex'}} className="w-full h-80 bg-gray-100 flex items-center justify-center">
                      <span className="text-gray-400 text-sm">No Image</span>
                    </div>
                    
                    {/* Sold Out Overlay */}
                    {(product.currentQuantity || product.quantity || 0) <= 0 && (
                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                        <span className="bg-white text-black px-4 py-2 font-medium">Sold out</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Product Info */}
                  <div className="p-4 sm:p-6">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 group-hover:text-gray-600 transition-colors line-clamp-2">
                      {product.name}
                    </h3>
                    
                    {/* Price */}
                    <div className="mb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="text-lg font-bold text-gray-900">
                          Rs.{(product.currentRetailPrice || product.price || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR
                        </span>
                        {(product.currentQuantity || product.quantity || 0) > 0 && (
                          <span className="text-xs sm:text-sm text-gray-500">
                            Stock: {product.currentQuantity || product.quantity || 0}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Add to Cart Button */}
                    {(product.currentQuantity || product.quantity || 0) > 0 ? (
                      <button
                        onClick={() => addToCart(product)}
                        className="w-full bg-black text-white py-2 sm:py-3 px-3 sm:px-4 rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2 font-medium text-sm sm:text-base"
                      >
                        <PlusIcon className="h-4 w-4" />
                        <span>Add to Cart</span>
                      </button>
                    ) : (
                      <div className="w-full bg-gray-100 text-gray-500 py-2 sm:py-3 px-3 sm:px-4 text-center font-medium text-sm sm:text-base rounded-lg">
                        Out of Stock
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {filteredProducts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No products found</p>
              </div>
            )}
          </div>

          {/* Order Summary Sidebar - Desktop Only */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 sticky top-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
              
              {cart.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCartIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg font-medium">Your cart is empty</p>
                  <p className="text-gray-400 text-sm mt-2">Add some products to get started</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Cart Items */}
                  <div className="space-y-3 sm:space-y-4 max-h-64 sm:max-h-80 overflow-y-auto pr-1 sm:pr-2">
                    {cart.map((item) => (
                      <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4 hover:shadow-sm transition-shadow">
                        <div className="flex items-start space-x-3 sm:space-x-4">
                          {/* Product Image */}
                          <div className="flex-shrink-0">
                            {item.hasImage ? (
                              <img
                                src={getImageUrl('product', item.id, true)}
                                alt={item.name}
                                className="h-12 w-12 sm:h-16 sm:w-16 object-cover rounded-lg border border-gray-200"
                                onError={(e) => {
                                  e.target.style.display = 'none'
                                  e.target.nextElementSibling.style.display = 'flex'
                                }}
                              />
                            ) : null}
                            <div style={{display: item.hasImage ? 'none' : 'flex'}} className="h-12 w-12 sm:h-16 sm:w-16 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center">
                              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          </div>
                          
                          {/* Product Details */}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2">{item.name}</h4>
                            <p className="text-xs text-gray-500 mb-3">
                              Rs.{(item.price || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR each
                            </p>
                            
                            {/* Quantity Controls */}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex items-center space-x-2 sm:space-x-3">
                                <button
                                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                                >
                                  <MinusIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                                </button>
                                
                                <span className="text-sm font-medium text-gray-900 min-w-[1.5rem] sm:min-w-[2rem] text-center">
                                  {item.quantity}
                                </span>
                                
                                <button
                                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                                >
                                  <PlusIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                                </button>
                              </div>
                              
                              <div className="text-left sm:text-right">
                                <div className="text-xs sm:text-sm font-semibold text-gray-900">
                                  Rs.{((item.price || 0) * item.quantity).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Remove Button */}
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            title="Remove item"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Order Summary */}
                  <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Subtotal ({getTotalItems()} {getTotalItems() === 1 ? 'item' : 'items'})</span>
                      <span className="font-medium text-gray-900">
                        Rs.{getTotalPrice().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR
                      </span>
                    </div>
                    
                    <div className="border-t border-gray-200 pt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-bold text-gray-900">Total</span>
                        <span className="text-2xl font-bold text-black">
                          Rs.{getTotalPrice().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Proceed to Checkout Button */}
                  <button
                    onClick={() => setShowCustomerForm(true)}
                    disabled={cart.length === 0}
                    className="w-full bg-black text-white py-3 sm:py-4 px-4 sm:px-6 rounded-xl hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2 sm:space-x-3 font-semibold text-base sm:text-lg shadow-lg hover:shadow-xl"
                  >
                    <CurrencyDollarIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                    <span>Proceed to Checkout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Cart Button for Mobile */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 lg:hidden">
          <button
            onClick={() => setShowCart(true)}
            className="bg-black text-white p-3 rounded-full shadow-lg hover:bg-gray-800 transition-colors flex items-center space-x-2 min-w-[120px]"
          >
            <ShoppingCartIcon className="h-5 w-5" />
            <div className="flex flex-col items-start">
              <span className="text-xs font-semibold">{getTotalItems()} items</span>
              <span className="text-xs">Rs.{getTotalPrice().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>
            </div>
          </button>
        </div>
      )}

      {/* Footer - Brand Deals Style */}
      <footer className="bg-gray-50 border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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

      {/* Cart Modal */}
      <CartModal
        isOpen={showCart}
        onClose={() => setShowCart(false)}
        cart={cart}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeFromCart}
        onCheckout={() => {
          setShowCart(false)
          setShowCustomerForm(true)
        }}
      />

      {/* Customer Form Modal */}
      {showCustomerForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
              onClick={() => setShowCustomerForm(false)}
            />
            
            {/* Modal */}
            <div className="relative bg-white max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden mx-4 sm:mx-0">
              {/* Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <UserIcon className="h-5 w-5 sm:h-6 sm:w-6 text-black" />
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">Customer Information</h2>
                </div>
                <button
                  onClick={() => setShowCustomerForm(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                >
                  <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
              </div>

              {/* Customer Form */}
              <div className="p-4 sm:p-6 max-h-80 sm:max-h-96 overflow-y-auto">
                <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
                  {renderCustomerFields()}
                </form>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 p-4 sm:p-6">
                <div className="bg-gray-50 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-base sm:text-lg font-semibold text-gray-900">Order Total</span>
                    <span className="text-xl sm:text-2xl font-bold text-black">
                      Rs.{getTotalPrice().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR
                    </span>
                  </div>
                  <div className="text-xs sm:text-sm text-gray-500 text-center mt-2">
                    {getTotalItems()} {getTotalItems() === 1 ? 'item' : 'items'} in your order
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <button
                    onClick={() => setShowCustomerForm(false)}
                    className="flex-1 bg-gray-100 text-gray-700 py-2 sm:py-3 px-4 sm:px-6 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-sm sm:text-base"
                  >
                    Back to Cart
                  </button>
                  <button
                    onClick={handleSubmit(handleFormSubmit)}
                    disabled={submitting}
                    className="flex-1 bg-black text-white py-2 sm:py-3 px-4 sm:px-6 rounded-xl hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2 font-semibold text-sm sm:text-base shadow-lg hover:shadow-xl"
                  >
                    {submitting ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <>
                        <CurrencyDollarIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                        <span>Complete Order</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ShoppingCartForm
