import { XMarkIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'

const WhatsAppConfirmationModal = ({ isOpen, onClose, onConfirm, customerPhone }) => {
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity z-50"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsapp-confirm-title"
      >
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full transform transition-all">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-500 to-green-600 px-6 py-4 rounded-t-xl flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-white bg-opacity-20 rounded-lg p-2">
                <ChatBubbleLeftRightIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 id="whatsapp-confirm-title" className="text-lg font-bold text-white">
                  Send WhatsApp Notification
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-1.5 transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-gray-700 mb-4">
              Order confirmed successfully!
            </p>
            <p className="text-gray-600 mb-6">
              Do you want to send a WhatsApp notification to <span className="font-semibold text-gray-900">{customerPhone}</span>?
            </p>

            {/* Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-medium transition-all shadow-md hover:shadow-lg"
              >
                Send WhatsApp
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default WhatsAppConfirmationModal

