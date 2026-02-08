import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'
import {
  XMarkIcon,
  CalendarIcon,
  DocumentTextIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  PlusIcon,
  MinusIcon,
  CurrencyDollarIcon,
  CubeIcon,
  ClockIcon,
  InformationCircleIcon,
  PhotoIcon,
  CameraIcon
} from '@heroicons/react/24/outline'

const ProductHistoryModal = ({ product, isOpen, onClose }) => {
  const { user } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all') // 'all', 'increase', 'decrease', 'create', 'update'

  useEffect(() => {
    if (isOpen && product) {
      fetchProductHistory()
    }
  }, [isOpen, product])

  const fetchProductHistory = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/product/${product.id}/history`)
      setLogs(response.data.logs)
    } catch (error) {
      console.error('Failed to fetch product history:', error)
      toast.error('Failed to load product history')
    } finally {
      setLoading(false)
    }
  }

  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true
    if (filter === 'image_uploaded') return log.action === 'IMAGE_UPLOADED'
    if (filter === 'image_changed') return log.action === 'IMAGE_CHANGED'
    return log.action.toLowerCase() === filter.toLowerCase()
  })

  const getActionIcon = (action) => {
    switch (action) {
      case 'CREATE':
        return <PlusIcon className="h-5 w-5 text-green-600" />
      case 'INCREASE':
        return <ArrowTrendingUpIcon className="h-5 w-5 text-blue-600" />
      case 'DECREASE':
        return <ArrowTrendingDownIcon className="h-5 w-5 text-red-600" />
      case 'UPDATE_PRICE':
        return <CurrencyDollarIcon className="h-5 w-5 text-yellow-600" />
      case 'IMAGE_UPLOADED':
        return <PhotoIcon className="h-5 w-5 text-purple-600" />
      case 'IMAGE_CHANGED':
        return <CameraIcon className="h-5 w-5 text-indigo-600" />
      default:
        return <InformationCircleIcon className="h-5 w-5 text-gray-600" />
    }
  }

  const getActionColor = (action) => {
    switch (action) {
      case 'CREATE':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'INCREASE':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'DECREASE':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'UPDATE_PRICE':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'IMAGE_UPLOADED':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'IMAGE_CHANGED':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  }

  if (!isOpen || !product) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-pink-600 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <CubeIcon className="h-8 w-8" />
              <div>
                <h2 className="text-2xl font-bold">Product History</h2>
                <p className="text-pink-100">{product.name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-pink-200 transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Product Summary */}
        <div className="p-6 bg-gray-50 border-b">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{product.currentQuantity || 0}</div>
              <div className="text-sm text-gray-600">Current Stock</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">Rs. {(product.lastPurchasePrice || 0).toFixed(2)}</div>
              <div className="text-sm text-gray-600">Last Purchase Price</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">Rs. {(product.currentRetailPrice || 0).toFixed(2)}</div>
              <div className="text-sm text-gray-600">Retail Price</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{logs.length}</div>
              <div className="text-sm text-gray-600">Total Activities</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-6 border-b">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-pink-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All Activities
            </button>
            <button
              onClick={() => setFilter('create')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'create'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Created
            </button>
            <button
              onClick={() => setFilter('increase')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'increase'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Increases
            </button>
            <button
              onClick={() => setFilter('decrease')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'decrease'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Decreases
            </button>
            <button
              onClick={() => setFilter('update')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'update'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Updates
            </button>
            <button
              onClick={() => setFilter('image_uploaded')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'image_uploaded'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Image Uploads
            </button>
            <button
              onClick={() => setFilter('image_changed')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'image_changed'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Image Changes
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-96">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No History Found</h3>
              <p className="text-gray-600">No activity logs found for this product.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLogs.map((log, index) => {
                const { date, time } = formatDate(log.createdAt)
                return (
                  <div key={log.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start space-x-4">
                      {/* Action Icon */}
                      <div className="flex-shrink-0">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getActionColor(log.action)}`}>
                          {getActionIcon(log.action)}
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getActionColor(log.action)}`}>
                              {log.action}
                            </span>
                            {log.quantity && (
                              <span className="text-sm font-semibold text-gray-900">
                                {log.quantity > 0 ? '+' : ''}{log.quantity}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-2 text-sm text-gray-500">
                            <CalendarIcon className="h-4 w-4" />
                            <span>{date}</span>
                            <ClockIcon className="h-4 w-4 ml-2" />
                            <span>{time}</span>
                          </div>
                        </div>

                        <div className="text-sm text-gray-700 mb-2">
                          {log.reason || log.description}
                        </div>

                        {/* Details */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          {log.oldQuantity !== null && log.newQuantity !== null && (
                            <div className="bg-gray-50 rounded-lg p-3">
                              <div className="font-medium text-gray-900 mb-1">Quantity Change</div>
                              <div className="text-gray-600">
                                {log.oldQuantity} → {log.newQuantity}
                              </div>
                            </div>
                          )}
                          
                          {log.oldPrice !== null && log.newPrice !== null && (
                            <div className="bg-gray-50 rounded-lg p-3">
                              <div className="font-medium text-gray-900 mb-1">Price Change</div>
                              <div className="text-gray-600">
                                Rs. {log.oldPrice?.toFixed(2)} → Rs. {log.newPrice?.toFixed(2)}
                              </div>
                            </div>
                          )}

                          {log.productVariant && (
                            <div className="bg-gray-50 rounded-lg p-3">
                              <div className="font-medium text-gray-900 mb-1">Variant</div>
                              <div className="text-gray-600">
                                {[log.productVariant.color, log.productVariant.size].filter(Boolean).join(' · ') || log.productVariant.sku || '—'}
                              </div>
                            </div>
                          )}

                          {log.reference && (
                            <div className="bg-gray-50 rounded-lg p-3">
                              <div className="font-medium text-gray-900 mb-1">Reference</div>
                              <div className="text-gray-600">{log.reference}</div>
                            </div>
                          )}
                        </div>

                        {log.notes && (
                          <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                            <div className="text-sm text-blue-800">
                              <strong>Note:</strong> {log.notes}
                            </div>
                          </div>
                        )}

                        {/* Purchase Item Link */}
                        {log.purchaseItem && (
                          <div className="mt-3 p-3 bg-green-50 rounded-lg">
                            <div className="text-sm text-green-800">
                              <strong>Linked Purchase Item:</strong> {log.purchaseItem.name}
                              {log.purchaseItem.purchaseInvoice && (
                                <span className="ml-2">
                                  (Invoice: {log.purchaseItem.purchaseInvoice.invoiceNumber})
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {filteredLogs.length} of {logs.length} activities
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProductHistoryModal
