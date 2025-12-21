import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import ProductDisplay from '../components/ProductDisplay'
import ShoppingCartForm from '../components/ShoppingCartForm'
import CityAutocomplete from '../components/CityAutocomplete'
import WhatsAppConfirmationModal from '../components/WhatsAppConfirmationModal'
import { 
  PhotoIcon, DocumentIcon, UserIcon, PhoneIcon, MapPinIcon, ScaleIcon, 
  CubeTransparentIcon, XMarkIcon, CheckIcon, DocumentTextIcon, TagIcon, 
  CalendarIcon, ClockIcon, HashtagIcon, PlusIcon, MinusIcon, CurrencyDollarIcon
} from '@heroicons/react/24/outline'

const ClientFormDynamic = () => {
  const { formLink } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploadedImages, setUploadedImages] = useState([])
  const [paymentReceipt, setPaymentReceipt] = useState(null)
  const [quantities, setQuantities] = useState({})
  const [selectedProducts, setSelectedProducts] = useState([])
  const [productQuantities, setProductQuantities] = useState({})

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    trigger
  } = useForm()

  useEffect(() => {
    fetchForm()
  }, [formLink])

  // Clear validation errors for quantity fields after form loads
  useEffect(() => {
    if (form && form.fields) {
      form.fields.forEach(field => {
        if (field.fieldType === 'AMOUNT' && field.label.toLowerCase().includes('quantity')) {
          // Trigger validation to clear any initial errors
          setTimeout(() => {
            trigger(field.label)
          }, 100)
        }
      })
    }
  }, [form, trigger])

  const fetchForm = async () => {
    try {
      const response = await api.get(`/form/public/${formLink}`)
      const formData = response.data.form
      
      // Parse selectedProducts for PRODUCT_SELECTOR fields
      const processedFields = formData.fields.map(field => {
        if (field.fieldType === 'PRODUCT_SELECTOR' && field.selectedProducts) {
          try {
            return {
              ...field,
              selectedProducts: typeof field.selectedProducts === 'string' 
                ? JSON.parse(field.selectedProducts) 
                : field.selectedProducts
            }
          } catch (error) {
            console.error('Error parsing selectedProducts:', error)
            return field
          }
        }
        return field
      })
      
      const processedFormData = {
        ...formData,
        fields: processedFields
      }
      
      setForm(processedFormData)
      
      // Initialize quantities for quantity fields
      const initialQuantities = {}
      processedFields.forEach(field => {
        if (field.fieldType === 'AMOUNT' && field.label.toLowerCase().includes('quantity')) {
          initialQuantities[field.label] = 1
          setValue(field.label, 1) // Set default value in react-hook-form
        }
      })
      setQuantities(initialQuantities)
      
      // Initialize selected products from PRODUCT_SELECTOR fields
      const productSelectorFields = processedFields.filter(field => field.fieldType === 'PRODUCT_SELECTOR')
      console.log('Found product selector fields:', productSelectorFields.length)
      if (productSelectorFields.length > 0) {
        const firstField = productSelectorFields[0]
        console.log('First field selectedProducts:', firstField.selectedProducts)
        console.log('Is array?', Array.isArray(firstField.selectedProducts))
        
        // Parse JSON string if needed
        let selectedProducts = firstField.selectedProducts
        if (typeof selectedProducts === 'string') {
          try {
            selectedProducts = JSON.parse(selectedProducts)
            console.log('Parsed selectedProducts:', selectedProducts)
          } catch (error) {
            console.error('Error parsing selectedProducts JSON:', error)
            selectedProducts = []
          }
        }
        
        if (selectedProducts && Array.isArray(selectedProducts)) {
          // Store original selectedProducts with prices for later merging
          const originalSelectedProducts = selectedProducts
          console.log('📦 Original selectedProducts with prices:', JSON.stringify(originalSelectedProducts, null, 2))
          
          // If products only have IDs, we need to fetch full product data
          const productIds = selectedProducts.map(p => p.id)
          console.log('Product IDs to fetch:', productIds)
          if (productIds.length > 0) {
            try {
              console.log('Starting to fetch products by IDs...')
              // Fetch product details using the public endpoint
              const response = await api.post('/products/by-ids', {
                productIds: productIds,
                tenantId: formData.tenantId
              })
              
              console.log('Products API response:', response.data)
              const fullProducts = response.data.products || []
              console.log('Fetched full products:', fullProducts)
              
              // Merge with prices from original selectedProducts if available
              const productsWithPrices = fullProducts.map(product => {
                const originalProduct = originalSelectedProducts.find(p => p.id === product.id)
                // Use price from original selectedProducts if available (even if 0), otherwise use currentRetailPrice
                let price
                if (originalProduct && originalProduct.price !== undefined && originalProduct.price !== null) {
                  price = typeof originalProduct.price === 'number' 
                    ? originalProduct.price 
                    : parseFloat(originalProduct.price) || 0
                } else {
                  price = product.currentRetailPrice ? parseFloat(product.currentRetailPrice) || 0 : 0
                }
                console.log('🛒 Loading product for Simple Cart:', product.name, 'Price from form:', originalProduct?.price, 'Final price:', price)
                return {
                  ...product,
                  price: price
                }
              })
              
              // Update the form field with full product data including prices
              firstField.selectedProducts = productsWithPrices
              console.log('✅ Updated products with prices:', productsWithPrices.map(p => ({ name: p.name, price: p.price })))
              
              // Don't pre-select products - let user choose
              setSelectedProducts([])
            } catch (error) {
              console.error('Error fetching full product data:', error)
              setSelectedProducts([])
            }
          } else {
            console.log('No product IDs to fetch')
            setSelectedProducts([])
          }
        } else {
          console.log('SelectedProducts is not an array or is empty')
        }
      } else {
        console.log('No product selector fields found')
      }
    } catch (error) {
      console.error('Error fetching form:', error)
      toast.error('Form not found or not published')
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = async (files) => {
    if (!files || files.length === 0) return

    const formData = new FormData()
    Array.from(files).forEach(file => {
      formData.append('images', file)
    })

    try {
      const response = await api.post('/upload/images', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      const newImages = response.data.files.map(file => ({
        ...file,
        url: file.url.startsWith('http') ? file.url : `${import.meta.env.VITE_API_URL || 'https://asanorder.onrender.com'}${file.url}`
      }))
      setUploadedImages(prev => [...prev, ...newImages])
      toast.success(`${newImages.length} image(s) uploaded successfully`)
    } catch (error) {
      toast.error('Failed to upload images')
    }
  }

  const handleReceiptUpload = async (file) => {
    if (!file) return

    const formData = new FormData()
    formData.append('image', file)

    try {
      const response = await api.post('/upload/image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      
      const receiptFile = {
        ...response.data.file,
        url: response.data.file.url.startsWith('http') ? response.data.file.url : `${import.meta.env.VITE_API_URL || 'https://asanorder.onrender.com'}${response.data.file.url}`
      }
      setPaymentReceipt(receiptFile)
      toast.success('Payment receipt uploaded successfully')
    } catch (error) {
      toast.error('Failed to upload payment receipt')
    }
  }

  const removeImage = (index) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index))
  }

  const updateQuantity = (fieldLabel, change) => {
    const currentValue = quantities[fieldLabel] || 1
    const newValue = Math.max(1, currentValue + change)
    setQuantities(prev => ({ ...prev, [fieldLabel]: newValue }))
    setValue(fieldLabel, newValue)
    // Trigger validation to clear any errors
    setTimeout(() => {
      trigger(fieldLabel)
    }, 0)
  }

  const renderField = (field) => {
    const isImageField = field.fieldType === 'FILE_UPLOAD' && 
      (field.label.toLowerCase().includes('image') || field.label.toLowerCase().includes('dress'))
    const isReceiptField = field.fieldType === 'FILE_UPLOAD' && 
      (field.label.toLowerCase().includes('payment') || field.label.toLowerCase().includes('receipt'))

    if (isImageField) {
      return (
        <div className="space-y-3">
          <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            uploadedImages.length === 0 
              ? 'bg-red-50 border-red-300 hover:border-red-400' 
              : 'bg-green-50 border-green-300 hover:border-green-400'
          }`}>
            <label className="cursor-pointer block">
              <PhotoIcon className={`w-12 h-12 mx-auto mb-3 ${
                uploadedImages.length === 0 ? 'text-red-400' : 'text-green-400'
              }`} />
              <p className={`font-medium mb-1 ${
                uploadedImages.length === 0 ? 'text-red-600' : 'text-green-600'
              }`}>
                {uploadedImages.length === 0 ? `${field.label} (Required)` : `Upload more ${field.label.toLowerCase()}`}
              </p>
              <p className="text-gray-500 text-sm">{uploadedImages.length}/4 images selected</p>
              <input
                type="file"
                className="hidden"
                multiple
                accept="image/*"
                onChange={(e) => handleImageUpload(e.target.files)}
              />
            </label>
          </div>
          
          {uploadedImages.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {uploadedImages.map((image, index) => (
                <div key={index} className="relative group">
                  <img
                    src={image.url}
                    alt={`${field.label} ${index + 1}`}
                    className="w-full h-24 sm:h-32 object-cover rounded-lg border-2 border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {uploadedImages.length === 0 && field.isRequired && (
            <div className="mt-3 flex items-center justify-center">
              <div className="bg-red-100 border border-red-300 rounded-full px-3 py-1">
                <span className="text-red-600 text-sm font-medium">⚠️ No images selected - Required!</span>
              </div>
            </div>
          )}
        </div>
      )
    }

    if (isReceiptField) {
      return (
        <div className="space-y-3">
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-pink-300 transition-colors">
            <label className="cursor-pointer block">
              <DocumentIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium mb-1">
                {paymentReceipt ? 'Change receipt' : field.label}
              </p>
              <p className="text-gray-500 text-sm">Select an image</p>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => handleReceiptUpload(e.target.files[0])}
              />
            </label>
          </div>
          
          {paymentReceipt && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center">
                <DocumentIcon className="w-5 h-5 text-green-600 mr-2" />
                <span className="text-green-800 text-sm font-medium">{paymentReceipt.originalName}</span>
              </div>
            </div>
          )}
          
          {!paymentReceipt && (
            <div className="mt-3 flex items-center justify-center">
              <div className="bg-gray-100 rounded-full px-3 py-1">
                <span className="text-gray-600 text-sm">No images selected</span>
              </div>
            </div>
          )}
        </div>
      )
    }

    // Regular form fields
    const commonProps = {
      ...register(field.label, {
        required: field.isRequired ? `${field.label} is required` : false,
        validate: field.isRequired ? undefined : () => true // Allow empty values for non-required fields
      }),
      className: "w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white text-gray-900 placeholder-gray-400 text-sm transition-colors duration-200",
      placeholder: field.placeholder || `Enter ${field.label.toLowerCase()}`
    }

    switch (field.fieldType) {
      case 'TEXT':
        return <input type="text" {...commonProps} />
      case 'EMAIL':
        return <input type="email" {...commonProps} />
      case 'PHONE':
        return <input type="tel" {...commonProps} placeholder="+92 300 1234567" />
      case 'ADDRESS':
      case 'TEXTAREA':
        return (
          <textarea
            {...commonProps}
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white text-gray-900 placeholder-gray-400 resize-none text-sm transition-colors duration-200"
          />
        )
      case 'AMOUNT':
        if (field.label.toLowerCase().includes('amount')) {
          return (
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₨</span>
              <input
                type="number"
                step="0.01"
                min={field.isRequired ? "0.01" : "0"}
                {...register(field.label, {
                  required: field.isRequired ? `${field.label} is required` : false,
                  min: field.isRequired ? { value: 0.01, message: `${field.label} must be greater than 0` } : { value: 0, message: `${field.label} cannot be negative` },
                  validate: !field.isRequired ? (value) => value === '' || value === null || value === undefined || parseFloat(value) >= 0 : undefined
                })}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-gray-50 text-gray-900 placeholder-gray-500 text-sm"
                placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              />
            </div>
          )
        } else {
          // Check if this is a quantity field
          if (field.label.toLowerCase().includes('quantity')) {
            return (
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => updateQuantity(field.label, -1)}
                  className="w-8 h-8 rounded-full bg-pink-100 hover:bg-pink-200 flex items-center justify-center transition-colors"
                >
                  <MinusIcon className="h-4 w-4 text-pink-600" />
                </button>
                <input
                  type="number"
                  min="1"
                  {...register(field.label, {
                    required: field.isRequired ? `${field.label} is required` : false,
                    min: { value: 1, message: `${field.label} must be at least 1` },
                    valueAsNumber: true
                  })}
                  value={quantities[field.label] || 1}
                  onChange={(e) => {
                    const value = Math.max(1, parseInt(e.target.value) || 1)
                    setQuantities(prev => ({ ...prev, [field.label]: value }))
                    setValue(field.label, value)
                  }}
                  className="w-16 text-center px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-gray-50 text-gray-900 text-sm"
                />
                <button
                  type="button"
                  onClick={() => updateQuantity(field.label, 1)}
                  className="w-8 h-8 rounded-full bg-pink-100 hover:bg-pink-200 flex items-center justify-center transition-colors"
                >
                  <PlusIcon className="h-4 w-4 text-pink-600" />
                </button>
              </div>
            )
          } else {
            return (
              <input
                type="number"
                min={field.isRequired ? "1" : "0"}
                {...register(field.label, {
                  required: field.isRequired ? `${field.label} is required` : false,
                  min: field.isRequired ? { value: 1, message: `${field.label} must be at least 1` } : { value: 0, message: `${field.label} cannot be negative` },
                  validate: !field.isRequired ? (value) => value === '' || value === null || value === undefined || parseInt(value) >= 0 : undefined
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-gray-50 text-gray-900 placeholder-gray-500 text-sm"
                placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              />
            )
          }
        }
      case 'DROPDOWN':
        let options = []
        if (field.options) {
          try {
            // Parse JSON string if it's a string, otherwise use as is
            options = typeof field.options === 'string' 
              ? JSON.parse(field.options) 
              : field.options
          } catch (error) {
            console.error('Error parsing dropdown options:', error)
            options = []
          }
        }
        // Ensure options is an array
        if (!Array.isArray(options)) {
          options = []
        }
        return (
          <select {...commonProps} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 bg-white text-gray-900 text-sm transition-colors duration-200">
            <option value="" className="text-gray-900 bg-white">Select {field.label.toLowerCase()}</option>
            {options.map((option, index) => (
              <option key={index} value={option} className="text-gray-900 bg-white">
                {option}
              </option>
            ))}
          </select>
        )
      case 'PRODUCT_SELECTOR':
        let products = []
        if (field.selectedProducts) {
          try {
            // Parse JSON string if it's a string, otherwise use as is
            products = typeof field.selectedProducts === 'string' 
              ? JSON.parse(field.selectedProducts) 
              : field.selectedProducts
          } catch (error) {
            console.error('Error parsing selectedProducts:', error)
            products = []
          }
        }
        // Ensure products is an array
        if (!Array.isArray(products)) {
          products = []
        }
        console.log('PRODUCT_SELECTOR field - products:', products)
        console.log('PRODUCT_SELECTOR field - selectedProducts:', selectedProducts)
        return (
          <div className="space-y-4">
            <ProductDisplay
              products={products}
              selectedProducts={selectedProducts}
              onSelectionChange={(products, quantities) => {
                setSelectedProducts(products)
                setProductQuantities(quantities)
              }}
              maxSelections={10}
              showNavigation={true}
            />
            {/* Note: selectedProducts are handled separately, not as form data */}
          </div>
        )
      default:
        return <input type="text" {...commonProps} />
    }
  }

  const getFieldIcon = (field) => {
    if (field.fieldType === 'PHONE') return '📱'
    if (field.fieldType === 'ADDRESS') return '📍'
    if (field.fieldType === 'PRODUCT_SELECTOR') return '🛍️'
    if (field.label.toLowerCase().includes('name')) return '👤'
    if (field.label.toLowerCase().includes('size')) return '📏'
    if (field.label.toLowerCase().includes('quantity')) return '🔢'
    if (field.label.toLowerCase().includes('amount')) return '💰'
    if (field.label.toLowerCase().includes('receipt')) return '📄'
    if (field.fieldType === 'FILE_UPLOAD') return '📸'
    return '📝'
  }

  const onSubmit = async (data) => {
    setSubmitting(true)
    
    try {
      // Validate required images
      const requiredImageFields = form.fields.filter(f => 
        f.fieldType === 'FILE_UPLOAD' && 
        f.isRequired && 
        (f.label.toLowerCase().includes('image') || f.label.toLowerCase().includes('dress'))
      )
      
      if (requiredImageFields.length > 0 && uploadedImages.length === 0) {
        toast.error('Please upload at least one dress image')
        setSubmitting(false)
        return
      }

          // Prepare form data
          const formData = {}
          form.fields.forEach(field => {
            if (field.fieldType !== 'FILE_UPLOAD') {
              const value = data[field.label]
              // Always include required fields (even if empty for validation)
              // For optional fields, only include if they have a value
              if (field.isRequired) {
                formData[field.label] = value || ''
              } else if (value !== undefined && value !== null && value !== '' && value !== 0) {
                // Only include optional fields if they have meaningful values
                formData[field.label] = value
              }
            }
          })

          // Ensure quantities are properly set
          Object.keys(quantities).forEach(fieldLabel => {
            if (quantities[fieldLabel]) {
              formData[fieldLabel] = quantities[fieldLabel]
            }
          })

          // Always include City field (required)
          if (data.City) {
            formData.City = data.City
          }

          // Note: selectedProducts and productQuantities are sent separately in orderData
          // We don't add them to formData to avoid cluttering the order details display

      // Prepare productPrices from selectedProducts
      const productPrices = {}
      selectedProducts.forEach(product => {
        // Use product.price if available (from form's selectedProducts), otherwise use currentRetailPrice
        const price = product.price !== undefined && product.price !== null
          ? (typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0)
          : (product.currentRetailPrice ? parseFloat(product.currentRetailPrice) || 0 : 0)
        productPrices[product.id] = price
      })
      
      // Submit order
      const orderData = {
        formLink,
        formData,
        // Only include paymentAmount if there's a Payment Amount field in the form
        paymentAmount: form.fields.some(f => f.label === 'Payment Amount') && data['Payment Amount'] 
          ? parseFloat(data['Payment Amount']) 
          : null,
        images: uploadedImages.map(img => img.url),
        paymentReceipt: paymentReceipt?.url || null,
        selectedProducts: selectedProducts,
        productQuantities: productQuantities,
        productPrices: productPrices
      }

      console.log('📤 Submitting order data:', orderData)
      console.log('📝 Form data details:', JSON.stringify(orderData.formData, null, 2))
      console.log('🖼️ Images being sent:', orderData.images)
      console.log('📄 Payment receipt:', orderData.paymentReceipt)
      
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
        // Reset form and redirect if no WhatsApp
        setUploadedImages([])
        setPaymentReceipt(null)
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

  if (loading) {
    return <LoadingSpinner className="min-h-screen" />
  }

  if (!form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Form Not Found</h2>
          <p className="text-gray-600">The form you're looking for doesn't exist or has been unpublished.</p>
        </div>
      </div>
    )
  }

  // Group fields by sections - use more precise filtering to avoid duplicates
  const customerFields = form.fields.filter(f => 
    f.label.toLowerCase() === 'customer name' ||
    f.label.toLowerCase() === 'email address' ||
    f.label.toLowerCase() === 'phone number' ||
    f.label.toLowerCase() === 'shipping address'
  )
  const dressFields = form.fields.filter(f => 
    f.label.toLowerCase().includes('size') ||
    f.label.toLowerCase().includes('quantity') ||
    f.label.toLowerCase().includes('image') ||
    f.label.toLowerCase().includes('product') ||
    f.fieldType === 'PRODUCT_SELECTOR'
  )
  const paymentFields = form.fields.filter(f => 
    f.label.toLowerCase().includes('payment') ||
    f.label.toLowerCase().includes('receipt') ||
    (f.label.toLowerCase().includes('amount') && f.label.toLowerCase().includes('payment'))
  )

  // Render different components based on form category
  // Only render ShoppingCartForm if explicitly set to SHOPPING_CART
  if (form.formCategory === 'SHOPPING_CART') {
    return (
      <ShoppingCartForm 
        form={form} 
        onSubmit={onSubmit}
      />
    )
  }
  
  // For all other cases (including undefined/null), use Simple Cart form

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Form Container */}
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          
          {/* Form Header */}
          <div className="bg-gradient-to-r from-pink-500 to-pink-600 px-6 py-6 text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              {form.tenant?.businessName || form.name}
            </h1>
            {form.description && (
              <p className="text-pink-100 text-sm sm:text-base">
                {form.description}
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
            
            {/* Customer Information Section */}
            {customerFields.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <UserIcon className="h-5 w-5 mr-2 text-pink-500" />
                  Customer Information
                </h3>
                
                <div className="space-y-4">
                  {customerFields.map((field) => (
                    <div key={field.id}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label}
                        {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {renderField(field)}
                      {field.placeholder && (
                        <p className="text-xs text-gray-500 mt-1">{field.placeholder}</p>
                      )}
                      {errors[field.label] && (
                        <p className="text-red-500 text-xs mt-1">{errors[field.label].message}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* City Field - Always Required */}
            <div className="bg-gray-50 rounded-lg p-4">
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
                  onBlur={() => trigger('City')}
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
            </div>

            {/* Product Information Section */}
            {dressFields.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <CubeTransparentIcon className="h-5 w-5 mr-2 text-pink-500" />
                  Product Information
                </h3>
                
                <div className="space-y-4">
                  {dressFields.map((field) => (
                    <div key={field.id}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label}
                        {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {renderField(field)}
                      {field.placeholder && (
                        <p className="text-xs text-gray-500 mt-1">{field.placeholder}</p>
                      )}
                      {errors[field.label] && (
                        <p className="text-red-500 text-xs mt-1">{errors[field.label].message}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payment Information Section */}
            {paymentFields.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                  <CurrencyDollarIcon className="h-5 w-5 mr-2 text-pink-500" />
                  Payment Information
                </h3>
                
                <div className="space-y-4">
                  {paymentFields.map((field) => (
                    <div key={field.id}>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {field.label}
                        {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {renderField(field)}
                      {field.placeholder && (
                        <p className="text-xs text-gray-500 mt-1">{field.placeholder}</p>
                      )}
                      {errors[field.label] && (
                        <p className="text-red-500 text-xs mt-1">{errors[field.label].message}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Additional Fields Section - for any fields not categorized above */}
            {(() => {
              const categorizedFields = [...customerFields, ...dressFields, ...paymentFields];
              const remainingFields = form.fields.filter(f => !categorizedFields.includes(f));
              
              if (remainingFields.length > 0) {
                return (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
                      <DocumentTextIcon className="h-5 w-5 mr-2 text-pink-500" />
                      Additional Information
                    </h3>
                    
                    <div className="space-y-4">
                      {remainingFields.map((field) => (
                        <div key={field.id}>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {field.label}
                            {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                          </label>
                          {renderField(field)}
                          {field.placeholder && (
                            <p className="text-xs text-gray-500 mt-1">{field.placeholder}</p>
                          )}
                          {errors[field.label] && (
                            <p className="text-red-500 text-xs mt-1">{errors[field.label].message}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-semibold py-4 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-lg shadow-lg"
              >
                {submitting ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Submitting Order...
                  </>
                ) : (
                  <>
                    <DocumentIcon className="h-5 w-5 mr-2" />
                    Submit Order
                  </>
                )}
              </button>
              
              {/* Help Contact */}
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-600">
                  For help, contact: {form.tenant?.whatsappNumber || 'Contact Support'}
                </p>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8 px-4">
        <p className="text-gray-400 text-sm">
          © 2024 Elegant Dress Orders. Crafted with care.
        </p>
      </div>

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

export default ClientFormDynamic
