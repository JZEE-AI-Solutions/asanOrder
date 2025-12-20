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
  shippingCharges = 0,
  loadingShipping = false,
  onUpdateQuantity, 
  onRemoveItem, 
  onCheckout 
}) => {
  const [isCheckingOut, setIsCheckingOut] = useState(false)

  const getSubtotal = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0)
  }

  const getTotalPrice = () => {
    return getSubtotal() + shippingCharges
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
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black transition-opacity duration-300 z-40 ${
          isOpen ? 'opacity-50' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Slide-in Drawer - Mobile First Design */}
      <div 
        className={`fixed top-0 right-0 h-full w-full sm:w-96 md:w-[28rem] lg:w-[32rem] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
      >
        {/* Header - Fixed */}
        <div className="bg-gradient-to-r from-pink-500 to-pink-600 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className="bg-white bg-opacity-20 rounded-lg p-2 flex-shrink-0">
              <ShoppingBagIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="cart-title" className="text-lg sm:text-xl font-bold text-white truncate">Shopping Cart</h2>
              <p className="text-pink-100 text-xs sm:text-sm">
                {getTotalItems()} {getTotalItems() === 1 ? 'item' : 'items'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors flex-shrink-0 ml-2"
            aria-label="Close cart"
          >
            <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        {/* Cart Items - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50 min-h-0">
            {cart.length === 0 ? (
              <div className="text-center py-16 sm:py-20">
                <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-full w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <ShoppingBagIcon className="h-12 w-12 sm:h-14 sm:w-14 text-gray-400" />
                </div>
                <p className="text-gray-800 text-xl sm:text-2xl font-bold mb-2">Your cart is empty</p>
                <p className="text-gray-500 text-sm sm:text-base">Add some products to get started shopping</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {cart.map((item) => (
                  <div key={item.id} className="bg-white rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-lg transition-all duration-200 border border-gray-200 hover:border-pink-200">
                    <div className="flex items-start gap-3 sm:gap-4">
                      {/* Product Image */}
                      <div className="flex-shrink-0">
                        <div className="relative group">
                          <div className="absolute inset-0 bg-pink-100 rounded-lg opacity-0 group-hover:opacity-20 transition-opacity"></div>
                          <img
                            src={getImageUrl('product', item.id, true)}
                            alt={item.name}
                            className="h-20 w-20 sm:h-24 sm:w-24 object-cover rounded-lg border-2 border-gray-200 shadow-sm"
                            onError={(e) => {
                              e.target.style.display = 'none'
                              if (e.target.nextElementSibling) {
                                e.target.nextElementSibling.style.display = 'flex'
                              }
                            }}
                            onLoad={(e) => {
                              if (e.target.nextElementSibling) {
                                e.target.nextElementSibling.style.display = 'none'
                              }
                            }}
                          />
                          <div className="h-20 w-20 sm:h-24 sm:w-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg border-2 border-gray-200 flex items-center justify-center absolute inset-0" style={{display: 'none'}}>
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        </div>
                      </div>
                      
                      {/* Product Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-gray-900 line-clamp-2 leading-tight flex-1">
                            {item.name}
                          </h3>
                          <button
                            onClick={() => onRemoveItem(item.id)}
                            className="flex-shrink-0 p-1.5 sm:p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 active:scale-95"
                            title="Remove item"
                            aria-label="Remove item"
                          >
                            <TrashIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                          </button>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-500 mb-3 font-medium">
                          Rs.{(item.price || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR each
                        </p>
                        
                        {/* Quantity Controls */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
                            <button
                              onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                              className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-white border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-pink-50 hover:border-pink-300 hover:text-pink-600 transition-all duration-200 active:scale-95 shadow-sm"
                              aria-label="Decrease quantity"
                            >
                              <MinusIcon className="h-4 w-4" />
                            </button>
                            
                            <span className="text-sm sm:text-base font-bold text-gray-900 min-w-[2.5rem] text-center px-2">
                              {item.quantity}
                            </span>
                            
                            <button
                              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                              className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-white border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-pink-50 hover:border-pink-300 hover:text-pink-600 transition-all duration-200 active:scale-95 shadow-sm"
                              aria-label="Increase quantity"
                            >
                              <PlusIcon className="h-4 w-4" />
                            </button>
                          </div>
                          
                          <div className="text-right">
                            <div className="text-base sm:text-lg font-bold text-gray-900">
                              Rs.{((item.price || 0) * item.quantity).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>

        {/* Footer - Fixed at Bottom */}
        {cart.length > 0 && (
          <div className="border-t-2 border-gray-200 bg-white p-4 sm:p-6 flex-shrink-0 shadow-lg">
              {/* Order Summary */}
              <div className="bg-gradient-to-br from-gray-50 via-gray-50 to-pink-50 rounded-xl p-4 sm:p-5 mb-4 sm:mb-5 border border-gray-200 shadow-sm">
                <div className="space-y-2 mb-3 pb-3 border-b border-gray-200">
                  <div className="flex justify-between items-center text-xs sm:text-sm">
                    <span className="text-gray-600 font-medium">Subtotal ({getTotalItems()} {getTotalItems() === 1 ? 'item' : 'items'})</span>
                    <span className="font-semibold text-gray-900">
                      Rs.{getSubtotal().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs sm:text-sm">
                    <span className="text-gray-600 font-medium">
                      Shipping {loadingShipping && <span className="text-gray-400">(calculating...)</span>}
                    </span>
                    <span className="font-semibold text-gray-900">
                      {loadingShipping ? (
                        <span className="text-gray-400">...</span>
                      ) : (
                        `Rs.${shippingCharges.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR`
                      )}
                    </span>
                  </div>
                </div>
                
                <div className="pt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-base sm:text-lg font-bold text-gray-900">Total Amount</span>
                    <span className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-pink-600 to-pink-700 bg-clip-text text-transparent">
                      {loadingShipping ? (
                        <span className="text-gray-400">...</span>
                      ) : (
                        `Rs.${getTotalPrice().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} PKR`
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Checkout Button - E-commerce Style */}
              <button
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="w-full bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 active:from-pink-800 active:to-pink-900 text-white py-3.5 sm:py-4 px-6 rounded-xl disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-3 font-bold text-base sm:text-lg shadow-lg hover:shadow-2xl transform hover:-translate-y-0.5 active:translate-y-0 disabled:transform-none"
              >
                {isCheckingOut ? (
                  <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-2 border-white border-t-transparent" />
                ) : (
                  <>
                    <CurrencyDollarIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                    <span>Proceed to Checkout</span>
                  </>
                )}
              </button>
            </div>
          )}
      </div>
    </>
  )
}

export default CartModal
