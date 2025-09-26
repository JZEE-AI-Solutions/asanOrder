import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  CheckCircleIcon, 
  PhotoIcon, 
  DocumentIcon, 
  ShareIcon,
  ArrowLeftIcon,
  CalendarIcon,
  UserIcon,
  PhoneIcon,
  MapPinIcon,
  CurrencyDollarIcon,
  CubeTransparentIcon
} from '@heroicons/react/24/outline'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'

const OrderReceipt = () => {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (orderId) {
      fetchOrderDetails()
    }
  }, [orderId])

  const fetchOrderDetails = async () => {
    try {
      const response = await api.get(`/order/receipt/${orderId}`)
      setOrder(response.data.order)
    } catch (error) {
      console.error('Error fetching order details:', error)
      toast.error('Failed to load order details')
      navigate('/')
    } finally {
      setLoading(false)
    }
  }


  const handleWhatsAppShare = () => {
    if (!order) return

    const formData = JSON.parse(order.formData)
    const images = order.images ? JSON.parse(order.images) : []
    
    let message = `🎉 *Order Submitted*\n\n`
    message += `📋 *Order ID:* #${order.orderNumber}\n`
    message += `🏪 *Business:* ${order.tenant.businessName}\n`
    message += `📅 *Date:* ${new Date(order.createdAt).toLocaleDateString()}\n\n`
    
    message += `👤 *Customer Details:*\n`
    message += `• Name: ${formData['Customer Name'] || 'N/A'}\n`
    message += `• Phone: ${formData['Mobile Number'] || 'N/A'}\n`
    message += `• Address: ${formData['Shipping Address'] || 'N/A'}\n\n`
    
    if (formData['Dress Size']) {
      message += `👗 *Dress Details:*\n`
      message += `• Size: ${formData['Dress Size']}\n`
    }
    
    if (formData['Dress Quantity']) {
      message += `• Quantity: ${formData['Dress Quantity']}\n`
    }
    
    if (order.paymentAmount) {
      message += `• Amount: Rs. ${order.paymentAmount.toLocaleString()}\n`
    }
    
    message += `\n📸 *Images:* ${images.length} dress image(s) attached\n\n`
    message += `🔗 *View Order Details:*\n`
    message += `${window.location.href}\n\n`
    message += `Thank you for your order! 🙏`

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(whatsappUrl, '_blank')
  }

  const handleBackToForm = () => {
    // Extract form link from the order and go back to the form
    if (order?.form?.formLink) {
      navigate(`/form/${order.form.formLink}`)
    } else {
      navigate('/')
    }
  }

  if (loading) {
    return <LoadingSpinner className="min-h-screen" />
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Not Found</h2>
          <p className="text-gray-600 mb-4">The order you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate('/')}
            className="btn-primary"
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  const formData = JSON.parse(order.formData)
  const images = order.images ? JSON.parse(order.images) : []

  return (
    <div className="page-container">
      {/* Header */}
      <div className="bg-white shadow-2xl border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mr-3">
                <CheckCircleIcon className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 text-gradient">Order Submitted!</h1>
                <p className="text-xs sm:text-sm text-gray-600">Your order has been successfully submitted and is pending confirmation</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <button
                onClick={handleWhatsAppShare}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center text-sm shadow-lg hover:shadow-xl"
              >
                <ShareIcon className="h-4 w-4 mr-2" />
                WhatsApp
              </button>
              <button
                onClick={handleBackToForm}
                className="btn-outline flex items-center justify-center py-2.5 px-4 text-sm"
              >
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                New Order
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-3 sm:py-4">
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl overflow-hidden">
          
          {/* Receipt Header */}
          <div className="header-gradient text-white p-6 text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center mr-3">
                <CubeTransparentIcon className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{order.tenant.businessName}</h2>
                <p className="text-pink-100 text-sm">Order Receipt - Submitted</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white bg-opacity-20 rounded-lg p-3">
                <p className="text-xs opacity-90">Order ID</p>
                <p className="text-sm font-bold">#{order.orderNumber}</p>
              </div>
              <div className="bg-white bg-opacity-20 rounded-lg p-3">
                <p className="text-xs opacity-90">Order Date</p>
                <p className="text-sm font-bold">{new Date(order.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="bg-white bg-opacity-20 rounded-lg p-3">
                <p className="text-xs opacity-90">Status</p>
                <p className="text-sm font-bold capitalize">{order.status}</p>
              </div>
            </div>
          </div>

          {/* Order Details */}
          <div className="p-3 sm:p-6">
            
            {/* Customer Information */}
            <div className="mb-4 sm:mb-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 flex items-center">
                <UserIcon className="h-4 w-4 mr-2 text-blue-500" />
                Customer Information
              </h3>
              <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                <div className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-3">
                  <div>
                    <p className="text-xs font-medium text-gray-600">Full Name</p>
                    <p className="text-sm sm:text-base text-gray-900 break-words">{formData['Customer Name'] || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600">Mobile Number</p>
                    <p className="text-sm sm:text-base text-gray-900 break-all">{formData['Mobile Number'] || 'N/A'}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium text-gray-600">Shipping Address</p>
                    <p className="text-sm sm:text-base text-gray-900 break-words">{formData['Shipping Address'] || 'N/A'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Dress Details */}
            {(formData['Dress Size'] || formData['Dress Quantity']) && (
              <div className="mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 flex items-center">
                  <CubeTransparentIcon className="h-4 w-4 mr-2 text-pink-500" />
                  Dress Details
                </h3>
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                  <div className="space-y-2 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-3">
                    {formData['Dress Size'] && (
                      <div>
                        <p className="text-xs font-medium text-gray-600">Dress Size</p>
                        <p className="text-sm sm:text-base text-gray-900">{formData['Dress Size']}</p>
                      </div>
                    )}
                    {formData['Dress Quantity'] && (
                      <div>
                        <p className="text-xs font-medium text-gray-600">Quantity</p>
                        <p className="text-sm sm:text-base text-gray-900">{formData['Dress Quantity']} piece(s)</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Dress Images */}
            {images && images.length > 0 && (
              <div className="mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 flex items-center">
                  <PhotoIcon className="h-4 w-4 mr-2 text-purple-500" />
                  Dress Images ({images.length})
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
                  {images.map((image, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={image}
                        alt={`Dress ${index + 1}`}
                        className="w-full h-16 sm:h-20 object-cover rounded-lg border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => window.open(image, '_blank')}
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-all flex items-center justify-center">
                        <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <div className="absolute bottom-0.5 left-0.5 sm:bottom-1 sm:left-1 bg-black bg-opacity-70 text-white text-xs px-1 py-0.5 rounded">
                        {index + 1}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Click images to view full size</p>
              </div>
            )}

            {/* Payment Information */}
            {(order.paymentAmount || order.paymentReceipt) && (
              <div className="mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2 sm:mb-3 flex items-center">
                  <CurrencyDollarIcon className="h-4 w-4 mr-2 text-green-500" />
                  Payment Information
                </h3>
                <div className="bg-gray-50 rounded-lg p-3 sm:p-4">
                  {order.paymentAmount && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-600">Payment Amount</p>
                      <p className="text-lg sm:text-xl font-bold text-green-600">Rs. {order.paymentAmount.toLocaleString()}</p>
                    </div>
                  )}
                  {order.paymentReceipt && (
                    <div>
                      <p className="text-xs font-medium text-gray-600 mb-2">Payment Receipt</p>
                      <img
                        src={order.paymentReceipt}
                        alt="Payment Receipt"
                        className="max-w-full h-20 sm:h-24 object-cover rounded-lg border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => window.open(order.paymentReceipt, '_blank')}
                      />
                      <p className="text-xs text-gray-500 mt-1">Click to view full size</p>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-4 sm:mt-6 text-gray-600">
          <p className="text-xs sm:text-sm">Thank you for choosing {order.tenant.businessName}!</p>
          <p className="text-xs mt-1">Your order is pending confirmation. Keep this receipt for your records.</p>
        </div>
      </div>

      {/* Mobile Styles */}
      <style jsx>{`
        /* Mobile-specific improvements */
        @media (max-width: 640px) {
          .mobile-text-sm {
            font-size: 0.875rem;
          }
          .mobile-p-2 {
            padding: 0.5rem;
          }
          .mobile-gap-2 {
            gap: 0.5rem;
          }
        }
      `}</style>
    </div>
  )
}

export default OrderReceipt
