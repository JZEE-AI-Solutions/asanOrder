import { useState } from 'react'
import { 
  XMarkIcon, 
  PlusIcon, 
  MinusIcon, 
  TrashIcon,
  CurrencyDollarIcon,
  ShoppingBagIcon
} from '@heroicons/react/24/outline'
import { getImageUrl } from '../services/api'

const CartModal = ({ 
  isOpen, 
  onClose, 
  cart, 
  onUpdateQuantity, 
  onRemoveItem, 
  onCheckout 
}) => {
  const [isCheckingOut, setIsCheckingOut] = useState(false)

  if (!isOpen) return null

  const getTotalPrice = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0)
  }

  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0)
  }

  const handleCheckout = async () => {
    setIsCheckingOut(true)
    try {
      await onCheckout()
    } finally {
      setIsCheckingOut(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />
        
        {/* Modal - Brand Deals Style */}
        <div className="relative bg-white max-w-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden mx-4 sm:mx-0">
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <ShoppingBagIcon className="h-5 w-5 sm:h-6 sm:w-6 text-black" />
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">Shopping Cart</h2>
              <span className="bg-black text-white text-xs sm:text-sm font-medium px-2 sm:px-3 py-1 rounded-full">
                {getTotalItems()} items
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>

          {/* Cart Items */}
          <div className="p-4 sm:p-6 max-h-80 sm:max-h-96 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingBagIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">Your cart is empty</p>
                <p className="text-gray-400 text-sm mt-2">Add some products to get started</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
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
                          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      </div>
                      
                      {/* Product Details */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2">
                          {item.name}
                        </h3>
                        <p className="text-xs text-gray-500 mb-3">
                          Rs.{(item.price || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR each
                        </p>
                        
                        {/* Quantity Controls */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex items-center space-x-2 sm:space-x-3">
                            <button
                              onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors"
                            >
                              <MinusIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                            </button>
                            
                            <span className="text-sm font-medium text-gray-900 min-w-[1.5rem] sm:min-w-[2rem] text-center">
                              {item.quantity}
                            </span>
                            
                            <button
                              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
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
                        onClick={() => onRemoveItem(item.id)}
                        className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                        title="Remove item"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {cart.length > 0 && (
            <div className="border-t border-gray-200 p-4 sm:p-6">
              {/* Order Summary */}
              <div className="bg-gray-50 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                <div className="flex justify-between items-center text-sm mb-2">
                  <span className="text-gray-600">Subtotal ({getTotalItems()} {getTotalItems() === 1 ? 'item' : 'items'})</span>
                  <span className="font-medium text-gray-900">
                    Rs.{getTotalPrice().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR
                  </span>
                </div>
                
                <div className="border-t border-gray-200 pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">Total</span>
                    <span className="text-xl sm:text-2xl font-bold text-black">
                      Rs.{getTotalPrice().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR
                    </span>
                  </div>
                </div>
              </div>

              {/* Checkout Button - Brand Deals Style */}
              <button
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="w-full bg-black text-white py-3 sm:py-4 px-4 sm:px-6 rounded-xl hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-2 sm:space-x-3 font-semibold text-base sm:text-lg shadow-lg hover:shadow-xl"
              >
                {isCheckingOut ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                ) : (
                  <>
                    <CurrencyDollarIcon className="h-5 w-5" />
                    <span>Proceed to Checkout</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CartModal
