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
import api from '../services/api'
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
        price: product.currentRetailPrice || product.price || 0
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{form.name}</h1>
              {form.description && (
                <p className="text-gray-600 mt-1">{form.description}</p>
              )}
            </div>
            
            {/* Cart Button */}
            <button
              onClick={() => setShowCart(true)}
              className="relative bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
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
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Products Section */}
          <div className="lg:col-span-2">
            {/* Search and Filter */}
            <div className="mb-6">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product) => (
                <div key={product.id} className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow ${(product.currentQuantity || product.quantity || 0) <= 0 ? 'opacity-75' : ''}`}>
                  {(product.image || product.imageUrl) && (
                    <div className="aspect-w-16 aspect-h-9">
                      <img
                        src={product.image || product.imageUrl}
                        alt={product.name}
                        className="w-full h-48 object-cover"
                      />
                    </div>
                  )}
                  
                  <div className="p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{product.name}</h3>
                    {product.description && (
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">{product.description}</p>
                    )}
                    
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xl font-bold text-blue-600">
                        ${(product.currentRetailPrice || product.price || 0).toFixed(2)}
                      </span>
                      <span className={`text-sm ${(product.currentQuantity || product.quantity || 0) > 0 ? 'text-gray-500' : 'text-red-500 font-medium'}`}>
                        {(product.currentQuantity || product.quantity || 0) > 0 ? `Stock: ${product.currentQuantity || product.quantity || 0}` : 'Out of Stock'}
                      </span>
                    </div>

                    {(product.currentQuantity || product.quantity || 0) > 0 ? (
                      <button
                        onClick={() => addToCart(product)}
                        className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                      >
                        <PlusIcon className="h-4 w-4" />
                        <span>Add to Cart</span>
                      </button>
                    ) : (
                      <div className="w-full bg-red-100 text-red-800 py-2 px-4 rounded-lg text-center font-medium">
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

          {/* Customer Information Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h3>
              
              <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
                {renderCustomerFields()}
                
                <div className="pt-4 border-t border-gray-200">
                  <button
                    type="submit"
                    disabled={cart.length === 0 || submitting}
                    className="w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2"
                  >
                    {submitting ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <>
                        <CurrencyDollarIcon className="h-5 w-5" />
                        <span>Checkout ({getTotalItems()} items)</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Cart Modal */}
      <CartModal
        isOpen={showCart}
        onClose={() => setShowCart(false)}
        cart={cart}
        onUpdateQuantity={updateQuantity}
        onRemoveItem={removeFromCart}
        onCheckout={() => {
          setShowCart(false)
          // Trigger form submission
          handleSubmit(handleFormSubmit)()
        }}
      />
    </div>
  )
}

export default ShoppingCartForm
