import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import { PhotoIcon, DocumentIcon } from '@heroicons/react/24/outline'

const ClientForm = () => {
  const { formLink } = useParams()
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploadedImages, setUploadedImages] = useState([])
  const [paymentReceipt, setPaymentReceipt] = useState(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue
  } = useForm()

  useEffect(() => {
    fetchForm()
  }, [formLink])

  const fetchForm = async () => {
    try {
      const response = await api.get(`/form/public/${formLink}`)
      setForm(response.data.form)
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
      
      const newImages = response.data.files
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
      
      setPaymentReceipt(response.data.file)
      toast.success('Payment receipt uploaded successfully')
    } catch (error) {
      toast.error('Failed to upload payment receipt')
    }
  }

  const removeImage = (index) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index))
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
          formData[field.label] = data[field.label] || ''
        }
      })

      // Submit order
      const orderData = {
        formLink,
        formData,
        paymentAmount: data['Payment Amount'] ? parseFloat(data['Payment Amount']) : null,
        images: uploadedImages.map(img => img.url),
        paymentReceipt: paymentReceipt?.url || null
      }

      console.log('📤 Submitting order data:', orderData)
      console.log('📝 Form data details:', JSON.stringify(orderData.formData, null, 2))
      console.log('🖼️ Images being sent:', orderData.images)
      console.log('📄 Payment receipt:', orderData.paymentReceipt)
      
      // Validate that all required text fields have values
      form.fields.filter(f => f.isRequired && f.fieldType !== 'FILE_UPLOAD').forEach(field => {
        const value = orderData.formData[field.label]
        console.log(`✅ ${field.label}: "${value}" (${typeof value})`)
        if (!value || value.toString().trim() === '') {
          console.error(`🚫 Missing value for required field: ${field.label}`)
        }
      })
      
      const response = await api.post('/order/submit', orderData)
      console.log('✅ Order response:', response.data)
      
      toast.success('Order submitted successfully! 🎉')
      
      // Reset form
      setUploadedImages([])
      setPaymentReceipt(null)
      
      // Show success message and reload
      setTimeout(() => {
        window.location.reload()
      }, 2000)
      
    } catch (error) {
      console.error('Submit error:', error)
      console.error('Error response:', error.response?.data)
      console.error('Missing fields:', error.response?.data?.missingFields)
      
      if (error.response?.data?.missingFields) {
        const missingFields = error.response.data.missingFields
        console.error('🚫 Missing fields details:', missingFields)
        toast.error(`Missing required fields: ${missingFields.join(', ')}`)
      } else if (error.response?.data?.error) {
        const errorMsg = typeof error.response.data.error === 'string'
          ? error.response.data.error
          : error.response.data.error?.message || 'Failed to submit order'
        toast.error(errorMsg)
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" 
         style={{
           backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Ccircle cx='30' cy='30' r='4'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
         }}>
      
      {/* Header */}
      <div className="text-center pt-8 pb-6 px-4">
        <h1 className="text-3xl font-bold text-white mb-2 tracking-wide">
          {form.tenant.businessName}
        </h1>
        <p className="text-gray-300 text-lg">
          Seamless ordering experience for custom dresses
        </p>
      </div>

      {/* Form Container */}
      <div className="max-w-md mx-auto px-4 pb-8">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          
          {/* Form Header */}
          <div className="bg-gradient-to-r from-pink-500 to-pink-600 text-white p-6 text-center relative">
            <div className="absolute inset-0 bg-black opacity-10"></div>
            <div className="relative">
              <div className="w-12 h-12 mx-auto mb-3 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <span className="text-2xl">👗</span>
              </div>
              <h2 className="text-xl font-semibold">New Dress Order</h2>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
            
            {/* Customer Information Section */}
            {form.fields.some(f => ['Customer Name', 'Mobile Number', 'Shipping Address'].includes(f.label)) && (
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center border-b pb-2">
                  <div className="w-6 h-6 bg-pink-100 rounded-full flex items-center justify-center mr-3">
                    <span className="text-pink-600 text-sm">👤</span>
                  </div>
                  Customer Information
                </h3>
              
              {/* Customer Name */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Name *
                </label>
                <input
                  {...register('Customer Name', { required: 'Customer name is required' })}
                  type="text"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-gray-50 text-gray-900 placeholder-gray-500"
                  placeholder="Enter customer name"
                />
                {errors['Customer Name'] && (
                  <p className="text-red-500 text-sm mt-1">{errors['Customer Name'].message}</p>
                )}
              </div>

              {/* Mobile Number */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <span className="inline-flex items-center">
                    <span className="mr-1">📱</span>
                    Mobile Number *
                  </span>
                </label>
                <input
                  {...register('Mobile Number', { required: 'Mobile number is required' })}
                  type="tel"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-gray-50 text-gray-900 placeholder-gray-500"
                  placeholder="Enter mobile number"
                />
                {errors['Mobile Number'] && (
                  <p className="text-red-500 text-sm mt-1">{errors['Mobile Number'].message}</p>
                )}
              </div>

              {/* Shipping Address */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <span className="inline-flex items-center">
                    <span className="mr-1">📍</span>
                    Shipping Address *
                  </span>
                </label>
                <textarea
                  {...register('Shipping Address', { required: 'Shipping address is required' })}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-gray-50 text-gray-900 placeholder-gray-500 resize-none"
                  placeholder="Enter complete shipping address"
                />
                {errors['Shipping Address'] && (
                  <p className="text-red-500 text-sm mt-1">{errors['Shipping Address'].message}</p>
                )}
              </div>

              {/* Dress Size (for old form compatibility) */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <span className="inline-flex items-center">
                    <span className="mr-1">📏</span>
                    Dress Size *
                  </span>
                </label>
                <select
                  {...register('Dress Size', { required: 'Dress size is required' })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-gray-50 text-gray-900"
                >
                  <option value="">Select dress size</option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
                {errors['Dress Size'] && (
                  <p className="text-red-500 text-sm mt-1">{errors['Dress Size'].message}</p>
                )}
              </div>

              {/* Dress Quantity */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <span className="inline-flex items-center">
                    <span className="mr-1">🔢</span>
                    Dress Quantity *
                  </span>
                </label>
                <input
                  {...register('Dress Quantity', { 
                    required: 'Dress quantity is required',
                    min: { value: 1, message: 'Quantity must be at least 1' }
                  })}
                  type="number"
                  min="1"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-gray-50 text-gray-900 placeholder-gray-500"
                  placeholder="Enter number of dresses"
                />
                {errors['Dress Quantity'] && (
                  <p className="text-red-500 text-sm mt-1">{errors['Dress Quantity'].message}</p>
                )}
              </div>
            </div>

            {/* Dress Images & Quantities Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center border-b pb-2">
                <div className="w-6 h-6 bg-pink-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-pink-600 text-sm">👗</span>
                </div>
                Dress Images & Quantities *
              </h3>
              
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
                    {uploadedImages.length === 0 ? 'Upload dress images (Required)' : 'Upload more dress images'}
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
                        alt={`Dress ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg border-2 border-gray-200"
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
              
              {uploadedImages.length === 0 && (
                <div className="mt-3 flex items-center justify-center">
                  <div className="bg-red-100 border border-red-300 rounded-full px-3 py-1">
                    <span className="text-red-600 text-sm font-medium">⚠️ No dress images selected - Required!</span>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Information Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center border-b pb-2">
                <div className="w-6 h-6 bg-pink-100 rounded-full flex items-center justify-center mr-3">
                  <span className="text-pink-600 text-sm">💰</span>
                </div>
                Payment Information
              </h3>
              
              {/* Payment Amount */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <span className="inline-flex items-center">
                    <span className="mr-1">💰</span>
                    Payment Amount *
                  </span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₨</span>
                  <input
                    {...register('Payment Amount', { required: 'Payment amount is required' })}
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-gray-50 text-gray-900 placeholder-gray-500"
                    placeholder="Enter payment amount"
                  />
                </div>
                {errors['Payment Amount'] && (
                  <p className="text-red-500 text-sm mt-1">{errors['Payment Amount'].message}</p>
                )}
              </div>

              {/* Payment Receipt */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <span className="inline-flex items-center">
                    <span className="mr-1">📄</span>
                    Payment Receipt (optional)
                  </span>
                </label>
                
                <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-pink-300 transition-colors">
                  <label className="cursor-pointer block">
                    <DocumentIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium mb-1">
                      {paymentReceipt ? 'Change receipt' : 'Upload payment receipt (optional)'}
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
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-semibold py-4 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-lg shadow-lg"
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-3" />
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

export default ClientForm