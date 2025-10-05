import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { 
  XMarkIcon, 
  CheckIcon, 
  PencilIcon, 
  PhotoIcon, 
  DocumentIcon, 
  UserIcon, 
  PhoneIcon, 
  MapPinIcon, 
  ScaleIcon, 
  CubeTransparentIcon, 
  TagIcon, 
  CalendarIcon, 
  ClockIcon, 
  HashtagIcon, 
  PlusIcon, 
  MinusIcon, 
  CurrencyDollarIcon,
  ArrowPathIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import { Button } from './ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card'
import { Badge } from './ui/Badge'
import { Input, Textarea, Select } from './ui/Input'
import ProductSelector from './ProductSelector'
import OrderProductSelector from './OrderProductSelector'
import api from '../services/api'
import toast from 'react-hot-toast'

const EnhancedOrderDetailsModal = ({ order, onClose, onConfirm, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState(null)
  const [uploadedImages, setUploadedImages] = useState([])
  const [paymentReceipt, setPaymentReceipt] = useState(null)
  const [quantities, setQuantities] = useState({})
  const [selectedProducts, setSelectedProducts] = useState([])
  const [productQuantities, setProductQuantities] = useState({})
  const [productPrices, setProductPrices] = useState({})

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset
  } = useForm()

  const formData = order.formData ? JSON.parse(order.formData) : {}
  const images = order.images ? JSON.parse(order.images) : []
  const paymentAmount = order.paymentAmount || 0

  useEffect(() => {
    if (order.formId) {
      fetchFormDetails()
    }
    initializeFormData()
  }, [order])

  const fetchFormDetails = async () => {
    try {
      const response = await api.get(`/form/${order.formId}`)
      setForm(response.data.form)
    } catch (error) {
      console.error('Failed to fetch form details:', error)
    }
  }

  const initializeFormData = () => {
    // Initialize form values
    Object.entries(formData).forEach(([key, value]) => {
      setValue(key, value)
    })

    // Initialize images
    setUploadedImages(images)

    // Initialize payment receipt
    if (order.paymentReceipt) {
      setPaymentReceipt(order.paymentReceipt)
    }

    // Initialize product quantities
    if (order.productQuantities) {
      const productQty = JSON.parse(order.productQuantities)
      setProductQuantities(productQty)
    }

    // Initialize product prices
    if (order.productPrices) {
      const productPrices = JSON.parse(order.productPrices)
      setProductPrices(productPrices)
    }

    // Initialize selected products
    if (order.selectedProducts) {
      const products = JSON.parse(order.selectedProducts)
      setSelectedProducts(products)
    }
  }

  const getStatusBadge = (status) => {
    const badges = {
      PENDING: 'pending',
      CONFIRMED: 'confirmed',
      DISPATCHED: 'dispatched',
      CANCELLED: 'cancelled'
    }
    return badges[status] || 'pending'
  }

  const getFieldIcon = (fieldType) => {
    const icons = {
      TEXT: UserIcon,
      EMAIL: UserIcon,
      PHONE: PhoneIcon,
      ADDRESS: MapPinIcon,
      AMOUNT: CurrencyDollarIcon,
      QUANTITY: ScaleIcon,
      PRODUCT_SELECTOR: CubeTransparentIcon,
      TEXTAREA: DocumentIcon,
      SELECT: TagIcon,
      DATE: CalendarIcon,
      TIME: ClockIcon,
      NUMBER: HashtagIcon
    }
    return icons[fieldType] || DocumentIcon
  }

  const handleImageUpload = (event) => {
    const files = Array.from(event.target.files)
    const newImages = files.map(file => URL.createObjectURL(file))
    setUploadedImages(prev => [...prev, ...newImages])
  }

  const handlePaymentReceiptUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
      const imageUrl = URL.createObjectURL(file)
      setPaymentReceipt(imageUrl)
    }
  }

  const removeImage = (index) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleProductQuantityChange = (productId, quantity) => {
    setProductQuantities(prev => ({
      ...prev,
      [productId]: Math.max(0, quantity)
    }))
  }

  const handleProductPriceChange = (productId, price) => {
    setProductPrices(prev => ({
      ...prev,
      [productId]: Math.max(0, parseFloat(price) || 0)
    }))
  }

  const handleProductsChange = (newSelectedProducts) => {
    setSelectedProducts(newSelectedProducts)
    
    // Clean up quantities and prices for removed products
    const newQuantities = { ...productQuantities }
    const newPrices = { ...productPrices }
    
    Object.keys(newQuantities).forEach(productId => {
      if (!newSelectedProducts.some(p => p.id === productId)) {
        delete newQuantities[productId]
      }
    })
    
    Object.keys(newPrices).forEach(productId => {
      if (!newSelectedProducts.some(p => p.id === productId)) {
        delete newPrices[productId]
      }
    })
    
    setProductQuantities(newQuantities)
    setProductPrices(newPrices)
  }

  const onSubmit = async (data) => {
    if (!isEditing) return

    try {
      setLoading(true)
      
      const updatedOrder = {
        formData: JSON.stringify(data),
        images: JSON.stringify(uploadedImages),
        paymentReceipt: paymentReceipt,
        productQuantities: JSON.stringify(productQuantities),
        productPrices: JSON.stringify(productPrices),
        selectedProducts: JSON.stringify(selectedProducts),
        paymentAmount: data['Payment Amount'] || paymentAmount
      }

      await api.put(`/order/${order.id}`, updatedOrder)
      
      toast.success('Order updated successfully!')
      setIsEditing(false)
      
      if (onUpdate) {
        onUpdate()
      }
    } catch (error) {
      console.error('Failed to update order:', error)
      toast.error('Failed to update order')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmOrder = async () => {
    try {
      setLoading(true)
      await onConfirm(order.id)
      toast.success('Order confirmed successfully!')
      onClose()
    } catch (error) {
      console.error('Failed to confirm order:', error)
      toast.error('Failed to confirm order')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelEdit = () => {
    reset()
    initializeFormData()
    setIsEditing(false)
  }

  // Calculate total order amount
  const calculateTotalAmount = () => {
    let total = 0
    selectedProducts.forEach(product => {
      const quantity = productQuantities[product.id] || 1
      const price = productPrices[product.id] || 0
      total += quantity * price
    })
    return total
  }

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 overflow-y-auto h-full w-full z-50">
      <div className="relative top-0 mx-auto p-2 sm:p-5 border w-full max-w-7xl shadow-2xl rounded-none sm:rounded-2xl bg-white min-h-screen sm:min-h-0 sm:max-h-screen overflow-y-auto sm:top-10 sm:w-11/12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 space-y-3 sm:space-y-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 text-gradient truncate">
              Order #{order.orderNumber}
            </h3>
            <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2 mt-1">
              <Badge variant={getStatusBadge(order.status)}>
                {order.status}
              </Badge>
              <span className="text-xs sm:text-sm text-gray-500">
                {new Date(order.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            {!isEditing ? (
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
                size="sm"
                className="flex items-center flex-1 sm:flex-none"
              >
                <PencilIcon className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Edit Order</span>
                <span className="sm:hidden">Edit</span>
              </Button>
            ) : (
              <div className="flex space-x-2 w-full sm:w-auto">
                <Button
                  onClick={handleCancelEdit}
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit(onSubmit)}
                  loading={loading}
                  size="sm"
                  className="flex-1 sm:flex-none"
                >
                  <CheckIcon className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Save Changes</span>
                  <span className="sm:hidden">Save</span>
                </Button>
              </div>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-2 transition-colors flex-shrink-0"
            >
              <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
            {/* Left Column - Form Fields */}
            <div className="space-y-4 sm:space-y-6">
              {/* Order Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <DocumentIcon className="h-5 w-5 mr-2" />
                    Order Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Order ID
                      </label>
                      <Input
                        value={order.id}
                        disabled
                        className="bg-gray-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Form
                      </label>
                      <Input
                        value={order.form?.name || 'N/A'}
                        disabled
                        className="bg-gray-50"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Form Fields */}
              {form && form.fields && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <UserIcon className="h-5 w-5 mr-2" />
                      Customer Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {form.fields.map((field, index) => {
                        const Icon = getFieldIcon(field.fieldType)
                        const fieldValue = formData[field.label] || ''

                        if (field.fieldType === 'PRODUCT_SELECTOR') {
                          return (
                            <div key={index} className="space-y-2">
                              <label className="block text-sm font-medium text-gray-700">
                                {field.label} {field.isRequired && <span className="text-red-500">*</span>}
                              </label>
                              {isEditing ? (
                                <OrderProductSelector
                                  tenantId={order.tenantId}
                                  selectedProducts={selectedProducts}
                                  productQuantities={productQuantities}
                                  productPrices={productPrices}
                                  onProductsChange={setSelectedProducts}
                                  onQuantityChange={handleProductQuantityChange}
                                  onPriceChange={handleProductPriceChange}
                                  maxProducts={20}
                                  showSearch={true}
                                />
                              ) : (
                                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                  <p className="text-sm text-gray-600 mb-3">
                                    Selected Products ({selectedProducts.length})
                                  </p>
                                  {selectedProducts.length > 0 ? (
                                    <div className="space-y-2">
                                      {selectedProducts.map((product, idx) => (
                                        <div key={idx} className="p-3 bg-white rounded border">
                                          <div className="flex items-center space-x-3 mb-2">
                                            <img
                                              src={product.image || '/placeholder-product.png'}
                                              alt={product.name}
                                              className="w-10 h-10 rounded object-cover flex-shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                              <span className="text-sm font-medium truncate block">{product.name}</span>
                                              <span className="text-xs text-gray-500">
                                                {product.category && `${product.category} • `}
                                                {product.color && `${product.color} • `}
                                                {product.size && `Size: ${product.size}`}
                                              </span>
                                            </div>
                                          </div>
                                          
                                          <div className="grid grid-cols-2 gap-3">
                                            {/* Quantity */}
                                            <div>
                                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                                Quantity
                                              </label>
                                              {isEditing ? (
                                                <div className="flex items-center space-x-1">
                                                  <button
                                                    type="button"
                                                    onClick={() => handleProductQuantityChange(product.id, (productQuantities[product.id] || 1) - 1)}
                                                    className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600"
                                                  >
                                                    <MinusIcon className="h-3 w-3" />
                                                  </button>
                                                  <span className="text-sm font-medium w-8 text-center">
                                                    {productQuantities[product.id] || 1}
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleProductQuantityChange(product.id, (productQuantities[product.id] || 1) + 1)}
                                                    className="w-6 h-6 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600"
                                                  >
                                                    <PlusIcon className="h-3 w-3" />
                                                  </button>
                                                </div>
                                              ) : (
                                                <span className="text-sm text-gray-700 font-medium">
                                                  {productQuantities[product.id] || 1}
                                                </span>
                                              )}
                                            </div>
                                            
                                            {/* Price */}
                                            <div>
                                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                                Sale Price (Rs.)
                                              </label>
                                              {isEditing ? (
                                                <input
                                                  type="number"
                                                  step="0.01"
                                                  min="0"
                                                  value={productPrices[product.id] || 0}
                                                  onChange={(e) => handleProductPriceChange(product.id, e.target.value)}
                                                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                                />
                                              ) : (
                                                <span className="text-sm text-gray-700 font-medium">
                                                  Rs. {parseFloat(productPrices[product.id] || 0).toLocaleString()}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          
                                          {/* Total */}
                                          <div className="mt-2 pt-2 border-t border-gray-100">
                                            <div className="flex justify-between items-center">
                                              <span className="text-sm font-medium text-gray-700">Total:</span>
                                              <span className="text-sm font-bold text-primary-600">
                                                Rs. {((productQuantities[product.id] || 1) * (productPrices[product.id] || 0)).toLocaleString()}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-400">No products selected</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        }

                        if (field.fieldType === 'TEXTAREA') {
                          return (
                            <div key={index} className="space-y-2">
                              <label className="block text-sm font-medium text-gray-700">
                                {field.label} {field.isRequired && <span className="text-red-500">*</span>}
                              </label>
                              <Textarea
                                {...register(field.label, {
                                  required: field.isRequired && 'This field is required'
                                })}
                                disabled={!isEditing}
                                className={!isEditing ? 'bg-gray-50' : ''}
                                placeholder={field.placeholder}
                              />
                              {errors[field.label] && (
                                <p className="text-red-500 text-sm">{errors[field.label].message}</p>
                              )}
                            </div>
                          )
                        }

                        if (field.fieldType === 'SELECT' && field.options) {
                          return (
                            <div key={index} className="space-y-2">
                              <label className="block text-sm font-medium text-gray-700">
                                {field.label} {field.isRequired && <span className="text-red-500">*</span>}
                              </label>
                              <Select
                                {...register(field.label, {
                                  required: field.isRequired && 'This field is required'
                                })}
                                disabled={!isEditing}
                                className={!isEditing ? 'bg-gray-50' : ''}
                              >
                                <option value="">Select {field.label}</option>
                                {field.options.map((option, optIndex) => (
                                  <option key={optIndex} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </Select>
                              {errors[field.label] && (
                                <p className="text-red-500 text-sm">{errors[field.label].message}</p>
                              )}
                            </div>
                          )
                        }

                        return (
                          <div key={index} className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">
                              <Icon className="h-4 w-4 inline mr-1" />
                              {field.label} {field.isRequired && <span className="text-red-500">*</span>}
                            </label>
                            <Input
                              {...register(field.label, {
                                required: field.isRequired && 'This field is required'
                              })}
                              disabled={!isEditing}
                              className={!isEditing ? 'bg-gray-50' : ''}
                              placeholder={field.placeholder}
                              type={field.fieldType === 'EMAIL' ? 'email' : 
                                    field.fieldType === 'PHONE' ? 'tel' : 
                                    field.fieldType === 'NUMBER' ? 'number' : 'text'}
                            />
                            {errors[field.label] && (
                              <p className="text-red-500 text-sm">{errors[field.label].message}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payment Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <CurrencyDollarIcon className="h-5 w-5 mr-2" />
                    Payment Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Order Total */}
                    {selectedProducts.length > 0 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-blue-900">Order Total (Products):</span>
                          <span className="text-lg font-bold text-blue-700">
                            Rs. {calculateTotalAmount().toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Payment Amount
                      </label>
                      <Input
                        {...register('Payment Amount', {
                          required: 'Payment amount is required'
                        })}
                        disabled={!isEditing}
                        className={!isEditing ? 'bg-gray-50' : ''}
                        type="number"
                        step="0.01"
                      />
                      {errors['Payment Amount'] && (
                        <p className="text-red-500 text-sm">{errors['Payment Amount'].message}</p>
                      )}
                    </div>
                    
                    {isEditing && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Payment Receipt
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePaymentReceiptUpload}
                          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100"
                        />
                      </div>
                    )}

                    {paymentReceipt && (
                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Current Payment Receipt
                        </label>
                        <div className="border border-gray-200 rounded-lg p-4 bg-green-50">
                          <img
                            src={paymentReceipt}
                            alt="Payment Receipt"
                            className="max-w-full h-auto rounded cursor-pointer hover:shadow-lg transition-shadow"
                            onClick={() => window.open(paymentReceipt, '_blank')}
                          />
                          <p className="text-xs text-gray-500 mt-2 text-center">Click to view full size</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Images and Actions */}
            <div className="space-y-4 sm:space-y-6">
              {/* Images */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <PhotoIcon className="h-5 w-5 mr-2" />
                    Order Images ({uploadedImages.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isEditing && (
                    <div className="mb-4">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageUpload}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100"
                      />
                    </div>
                  )}
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                    {uploadedImages.map((image, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={image}
                          alt={`Order Image ${index + 1}`}
                          className="w-full h-24 sm:h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
                          onClick={() => window.open(image, '_blank')}
                        />
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1 right-1 sm:top-2 sm:right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <TrashIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                          </button>
                        )}
                        <div className="absolute bottom-1 left-1 bg-black bg-opacity-70 text-white text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded">
                          {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {uploadedImages.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <PhotoIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                      <p>No images uploaded</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Order Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Order Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 sm:space-y-3">
                    {order.status === 'PENDING' && (
                      <Button
                        onClick={handleConfirmOrder}
                        loading={loading}
                        className="w-full"
                        variant="success"
                        size="sm"
                      >
                        <CheckIcon className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Confirm Order</span>
                        <span className="sm:hidden">Confirm</span>
                      </Button>
                    )}
                    
                    <Button
                      onClick={onClose}
                      variant="outline"
                      className="w-full"
                      size="sm"
                    >
                      Close
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EnhancedOrderDetailsModal
