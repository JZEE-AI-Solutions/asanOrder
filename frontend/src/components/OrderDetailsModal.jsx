import { XMarkIcon, CheckIcon } from '@heroicons/react/24/outline'

const OrderDetailsModal = ({ order, onClose, onConfirm }) => {
  const formData = JSON.parse(order.formData)
  const images = order.images ? JSON.parse(order.images) : []
  
  console.log('Order images:', images) // Debug log
  console.log('Payment receipt:', order.paymentReceipt) // Debug log

  const getStatusBadge = (status) => {
    const badges = {
      PENDING: 'badge badge-pending',
      CONFIRMED: 'badge badge-confirmed',
      DISPATCHED: 'badge badge-dispatched',
      CANCELLED: 'badge badge-cancelled'
    }
    return badges[status] || 'badge'
  }

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 overflow-y-auto h-full w-full z-50">
      <div className="relative top-2 mx-auto p-3 sm:p-5 border w-full max-w-4xl shadow-2xl rounded-2xl bg-white max-h-screen overflow-y-auto sm:top-10 sm:w-11/12">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold text-gray-900 text-gradient">
              Order #{order.orderNumber}
            </h3>
            <span className={`badge ${getStatusBadge(order.status)} mt-2`}>
              {order.status}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg p-2 transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-4 sm:space-y-6">
          {/* Order Info */}
          <div className="card-compact">
            <h4 className="font-semibold text-gray-900 mb-4 text-base">Order Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600 font-semibold">Order ID</p>
                <p className="font-mono text-xs text-gray-900">{order.id}</p>
              </div>
              <div>
                <p className="text-gray-600 font-semibold">Date</p>
                <p className="font-semibold text-gray-900">{new Date(order.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-gray-600 font-semibold">Form</p>
                <p className="font-semibold text-gray-900">{order.form?.name}</p>
              </div>
              <div>
                <p className="text-gray-600 font-semibold">Status</p>
                <p className="font-semibold text-gray-900">{order.status}</p>
              </div>
            </div>
          </div>

          {/* Customer Details */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3 text-sm sm:text-base">Customer Details</h4>
            <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                {Object.entries(formData).map(([key, value]) => {
                  if (!value || typeof value === 'object') return null
                  return (
                    <div key={key} className="break-words">
                      <p className="text-gray-600 font-medium">{key}</p>
                      <p className="text-gray-900 mt-1">{value}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Images */}
          {images && images.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3 text-sm sm:text-base">Dress Images ({images.length})</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
                {images.map((image, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={image}
                      alt={`Dress ${index + 1}`}
                      className="w-full h-24 sm:h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => window.open(image, '_blank')}
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-all flex items-center justify-center">
                      <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div className="absolute bottom-1 left-1 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                      {index + 1}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">Tap image to view full size</p>
            </div>
          )}

          {/* Payment Receipt */}
          {order.paymentReceipt && (
            <div>
              <h4 className="font-medium text-gray-900 mb-3 text-sm sm:text-base">Payment Receipt</h4>
              <div className="border border-gray-200 rounded-lg p-2 sm:p-4 bg-green-50">
                <img
                  src={order.paymentReceipt}
                  alt="Payment Receipt"
                  className="max-w-full h-auto rounded cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => window.open(order.paymentReceipt, '_blank')}
                />
                <p className="text-xs text-gray-500 mt-2 text-center">Tap to view full size</p>
              </div>
            </div>
          )}

          {/* Payment Amount */}
          {order.paymentAmount && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4">
              <h4 className="font-medium text-green-900 mb-2 text-sm sm:text-base">Payment Information</h4>
              <p className="text-xl sm:text-2xl font-bold text-green-700">
                Rs. {parseFloat(order.paymentAmount).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4 sm:pt-6 border-t mt-4 sm:mt-6">
          <button
            onClick={onClose}
            className="w-full sm:w-auto btn-secondary text-center py-3 sm:py-2"
          >
            Close
          </button>
          {order.status === 'PENDING' && onConfirm && (
            <button
              onClick={() => {
                onConfirm(order.id)
                onClose()
              }}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-medium py-3 sm:py-2 px-4 rounded-lg flex items-center justify-center"
            >
              <CheckIcon className="h-4 w-4 mr-2" />
              Confirm Order
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default OrderDetailsModal
