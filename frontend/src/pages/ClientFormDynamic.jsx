import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import ProductDisplay from '../components/ProductDisplay'
import { 
  PhotoIcon, DocumentIcon, UserIcon, PhoneIcon, MapPinIcon, ScaleIcon, 
  CubeTransparentIcon, XMarkIcon, CheckIcon, DocumentTextIcon, TagIcon, 
  CalendarIcon, ClockIcon, HashtagIcon, PlusIcon, MinusIcon 
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
      setForm(formData)
      
      // Initialize quantities for quantity fields
      const initialQuantities = {}
      formData.fields.forEach(field => {
        if (field.fieldType === 'AMOUNT' && field.label.toLowerCase().includes('quantity')) {
          initialQuantities[field.label] = 1
          setValue(field.label, 1) // Set default value in react-hook-form
        }
      })
      setQuantities(initialQuantities)
    } catch (error) {
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
      className: "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-gray-50 text-gray-900 placeholder-gray-500 text-sm",
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
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-gray-50 text-gray-900 placeholder-gray-500 resize-none text-sm"
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
        const options = field.options ? JSON.parse(field.options) : []
        return (
          <select {...commonProps}>
            <option value="">Select {field.label.toLowerCase()}</option>
            {options.map((option, index) => (
              <option key={index} value={option}>
                {option}
              </option>
            ))}
          </select>
        )
      case 'PRODUCT_SELECTOR':
        return (
          <div className="space-y-4">
            <ProductDisplay
              products={field.selectedProducts || []}
              selectedProducts={selectedProducts}
              onSelectionChange={setSelectedProducts}
              maxSelections={10}
              showNavigation={true}
            />
            {/* Hidden input to store selected products */}
            <input
              type="hidden"
              {...register(field.label, {
                required: field.isRequired ? `${field.label} is required` : false,
                validate: () => {
                  if (field.isRequired && selectedProducts.length === 0) {
                    return 'Please select at least one product'
                  }
                  return true
                }
              })}
              value={JSON.stringify(selectedProducts)}
            />
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
        selectedProducts: selectedProducts
      }

      console.log('📤 Submitting order data:', orderData)
      console.log('📝 Form data details:', JSON.stringify(orderData.formData, null, 2))
      console.log('🖼️ Images being sent:', orderData.images)
      console.log('📄 Payment receipt:', orderData.paymentReceipt)
      
      const response = await api.post('/order/submit', orderData)
      console.log('✅ Order response:', response.data)
      
      toast.success('Order submitted successfully! 🎉')
      
      // Reset form
      setUploadedImages([])
      setPaymentReceipt(null)
      
      // Redirect to order receipt page
      setTimeout(() => {
        navigate(`/order/${response.data.order.id}`)
      }, 1500)
      
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

  // Group fields by sections
  const customerFields = form.fields.filter(f => 
    ['Customer Name', 'Mobile Number', 'Shipping Address'].includes(f.label)
  )
  const dressFields = form.fields.filter(f => 
    ['Dress Size', 'Dress Quantity', 'Dress Images'].includes(f.label)
  )
  const paymentFields = form.fields.filter(f => 
    ['Payment Amount', 'Payment Receipt'].includes(f.label)
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Header */}
      <div className="bg-gray-800 text-white py-1.5 px-4 text-center">
        <p className="text-xs text-gray-300">Custom Dress Ordering System</p>
      </div>
      
      {/* Form Container */}
      <div className="max-w-md mx-auto px-4 py-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          
          {/* Form Header - Now contains business name instead of form name */}
          <div className="bg-gradient-to-r from-pink-500 to-pink-600 text-white p-4 text-center">
            <div className="bg-white bg-opacity-20 rounded-full p-2 mb-2 inline-block">
              <span className="text-xl">👗</span>
            </div>
            <h2 className="text-lg font-bold text-white mb-1">
              {form.tenant?.businessName || 'Business'}
            </h2>
            <p className="text-xs text-pink-100">
              Seamless ordering experience for custom dresses
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
            
            {/* Customer Information Section */}
            {customerFields.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center border-b pb-1">
                  <div className="w-5 h-5 bg-pink-100 rounded-full flex items-center justify-center mr-2">
                    <span className="text-pink-600 text-xs">👤</span>
                  </div>
                  Customer Information
                </h3>
                
                {customerFields.map((field) => (
                  <div key={field.id} className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <span className="inline-flex items-center">
                        <span className="mr-1">{getFieldIcon(field)}</span>
                        {field.label}
                        {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                      </span>
                    </label>
                    {renderField(field)}
                    {errors[field.label] && (
                      <p className="text-red-500 text-xs mt-1">{errors[field.label].message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Dress Information Section */}
            {dressFields.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center border-b pb-1">
                  <div className="w-5 h-5 bg-pink-100 rounded-full flex items-center justify-center mr-2">
                    <span className="text-pink-600 text-xs">👗</span>
                  </div>
                  Dress Information
                </h3>
                
                {dressFields.map((field) => (
                  <div key={field.id} className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <span className="inline-flex items-center">
                        <span className="mr-1">{getFieldIcon(field)}</span>
                        {field.label}
                        {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                      </span>
                    </label>
                    {renderField(field)}
                    {errors[field.label] && (
                      <p className="text-red-500 text-xs mt-1">{errors[field.label].message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Payment Information Section */}
            {paymentFields.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center border-b pb-1">
                  <div className="w-5 h-5 bg-pink-100 rounded-full flex items-center justify-center mr-2">
                    <span className="text-pink-600 text-xs">💰</span>
                  </div>
                  Payment Information
                </h3>
                
                {paymentFields.map((field) => (
                  <div key={field.id} className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <span className="inline-flex items-center">
                        <span className="mr-1">{getFieldIcon(field)}</span>
                        {field.label}
                        {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                      </span>
                    </label>
                    {renderField(field)}
                    {errors[field.label] && (
                      <p className="text-red-500 text-xs mt-1">{errors[field.label].message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-base shadow-lg"
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Submitting Order...
                </>
              ) : (
                'Submit Order'
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8 px-4">
        <p className="text-gray-400 text-sm">
          © 2024 Elegant Dress Orders. Crafted with care.
        </p>
      </div>
    </div>
  )
}

export default ClientFormDynamic
