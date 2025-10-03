import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api, { getImageUrl } from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import InvoiceUploadModal from '../components/InvoiceUploadModal'
import EnhancedProductModal from '../components/EnhancedProductModal'
import ProductHistoryModal from '../components/ProductHistoryModal'
import ProductImageUpload from '../components/ProductImageUpload'
import {
  PlusIcon,
  CameraIcon,
  DocumentArrowUpIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  PhotoIcon
} from '@heroicons/react/24/outline'

const ProductsDashboard = () => {
  const { user } = useAuth()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showInvoiceUpload, setShowInvoiceUpload] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyProduct, setHistoryProduct] = useState(null)
  const [showImageUpload, setShowImageUpload] = useState(false)
  const [selectedProductForImage, setSelectedProductForImage] = useState(null)

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const response = await api.get('/product')
      setProducts(response.data.products)
    } catch (error) {
      toast.error('Failed to fetch products')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateProduct = () => {
    setSelectedProduct(null)
    setIsEditing(false)
    setShowProductModal(true)
  }

  const handleEditProduct = (product) => {
    setSelectedProduct(product)
    setIsEditing(true)
    setShowProductModal(true)
  }

  const handleProductSaved = () => {
    setShowProductModal(false)
    setSelectedProduct(null)
    setIsEditing(false)
    fetchProducts()
  }

  const handleDeleteProduct = async (productId) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await api.delete(`/product/${productId}`)
        toast.success('Product deleted successfully')
        fetchProducts()
      } catch (error) {
        toast.error('Failed to delete product')
      }
    }
  }

  const handleToggleProductStatus = async (product) => {
    try {
      await api.put(`/product/${product.id}`, {
        isActive: !product.isActive
      })
      toast.success(`Product ${product.isActive ? 'deactivated' : 'activated'} successfully`)
      fetchProducts()
    } catch (error) {
      toast.error('Failed to update product status')
    }
  }

  const handleInvoiceProcessed = (extractedProducts) => {
    setShowInvoiceUpload(false)
    toast.success(`${extractedProducts.length} products extracted from invoice!`)
    fetchProducts()
  }

  const handleViewProductHistory = (product) => {
    setHistoryProduct(product)
    setShowHistoryModal(true)
  }

  const handleImageUpload = (product) => {
    setSelectedProductForImage(product)
    setShowImageUpload(true)
  }

  const handleImageUploaded = () => {
    setShowImageUpload(false)
    setSelectedProductForImage(null)
    fetchProducts() // Refresh products to show new image
  }

  // Filter products based on search and category
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCategory = !categoryFilter || product.category === categoryFilter
    
    return matchesSearch && matchesCategory
  })

  // Get unique categories for filter
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))]

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-pink-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Products Management</h1>
          <p className="text-gray-300">Manage your inventory and import products from invoices</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <button
            onClick={handleCreateProduct}
            className="btn-primary flex items-center justify-center"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Add Product
          </button>
          
          <button
            onClick={() => setShowInvoiceUpload(true)}
            className="btn-secondary flex items-center justify-center"
          >
            <CameraIcon className="h-5 w-5 mr-2" />
            Import from Invoice
          </button>
        </div>

        {/* Search and Filter */}
        <div className="card p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            
            <div className="sm:w-48">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input-field"
              >
                <option value="">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Products Grid */}
        {filteredProducts.length === 0 ? (
          <div className="card p-8 text-center">
            <DocumentArrowUpIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {searchTerm || categoryFilter ? 'No products found' : 'No products yet'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm || categoryFilter 
                ? 'Try adjusting your search or filter criteria'
                : 'Start by adding products manually or importing from an invoice'
              }
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleCreateProduct}
                className="btn-primary"
              >
                Add First Product
              </button>
              <button
                onClick={() => setShowInvoiceUpload(true)}
                className="btn-secondary"
              >
                Import from Invoice
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <div key={product.id} className="card hover:shadow-xl transition-all duration-300 group">
                <div className="p-4 sm:p-6">
                  {/* Product Image */}
                  <div className="w-full h-32 bg-gray-100 rounded-lg mb-4 flex items-center justify-center">
                    <img 
                      src={getImageUrl('product', product.id, true)}
                      alt={product.name}
                      className="w-full h-full object-cover rounded-lg"
                      onError={(e) => {
                        e.target.style.display = 'none'
                        e.target.nextElementSibling.style.display = 'flex'
                      }}
                    />
                    <div style={{display: 'none'}} className="text-center">
                      <DocumentArrowUpIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-xs text-gray-500">No image</p>
                    </div>
                  </div>

                  {/* Product Info */}
                  <div className="mb-4">
                    <h3 className="font-semibold text-gray-900 text-lg mb-1 group-hover:text-pink-600 transition-colors">
                      {product.name}
                    </h3>
                    {product.description && (
                      <p className="text-gray-600 text-sm mb-2 line-clamp-2">
                        {product.description}
                      </p>
                    )}
                    {product.category && (
                      <span className="inline-block bg-pink-100 text-pink-800 text-xs px-2 py-1 rounded-full mb-2">
                        {product.category}
                      </span>
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Purchase Price:</span>
                      <span className="font-semibold">Rs. {product.lastPurchasePrice || 0}</span>
                    </div>
                    {product.currentRetailPrice && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Retail Price:</span>
                        <span className="font-semibold text-green-600">Rs. {product.currentRetailPrice}</span>
                      </div>
                    )}
                    {product.lastSalePrice && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Sale Price:</span>
                        <span className="font-semibold text-blue-600">Rs. {product.lastSalePrice}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">Quantity:</span>
                      <span className={`font-semibold ${product.currentQuantity === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {product.currentQuantity}
                      </span>
                    </div>
                    {product.sku && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">SKU:</span>
                        <span className="font-mono text-xs">{product.sku}</span>
                      </div>
                    )}
                  </div>

                  {/* Status Badge */}
                  <div className="mt-4 mb-4">
                    <span className={`badge ${product.isActive ? 'badge-confirmed' : 'badge-pending'}`}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Recent Activity */}
                  {product.productLogs && product.productLogs.length > 0 && (
                    <div 
                      className="mt-4 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleViewProductHistory(product)}
                      title="Click to view complete history"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-gray-700">Recent Activity</h4>
                        <span className="text-xs text-pink-600 font-medium">View All</span>
                      </div>
                      <div className="space-y-1">
                        {product.productLogs.slice(0, 2).map((log, index) => (
                          <div key={index} className="text-xs text-gray-600">
                            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                              log.action === 'PRICE_UPDATE' ? 'bg-green-500' :
                              log.action === 'PURCHASE_PRICE_UPDATE' ? 'bg-blue-500' :
                              log.action === 'SALE_PRICE_UPDATE' ? 'bg-purple-500' :
                              log.action === 'QUANTITY_ADJUSTMENT' ? 'bg-orange-500' :
                              log.action === 'INFO_UPDATE' ? 'bg-indigo-500' :
                              'bg-gray-500'
                            }`}></span>
                            <span className="font-medium">{log.action.replace(/_/g, ' ')}</span>
                            {log.quantity && (
                              <span className="ml-1">({log.quantity > 0 ? '+' : ''}{log.quantity})</span>
                            )}
                            <span className="ml-1 text-gray-500">
                              {new Date(log.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-between items-center">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleImageUpload(product)}
                        className="flex items-center space-x-1 text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors shadow-md"
                        title="Upload/Change image"
                      >
                        <CameraIcon className="h-4 w-4" />
                        <span className="text-sm font-medium">Image</span>
                      </button>
                      <button
                        onClick={() => handleEditProduct(product)}
                        className="text-primary-600 hover:text-primary-900 p-1"
                        title="Edit product"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleToggleProductStatus(product)}
                        className={`p-1 ${product.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}`}
                        title={product.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {product.isActive ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(product.id)}
                        className="text-red-600 hover:text-red-900 p-1"
                        title="Delete product"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        {products.length > 0 && (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-pink-600">{products.length}</div>
              <div className="text-gray-600">Total Products</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {products.filter(p => p.isActive).length}
              </div>
              <div className="text-gray-600">Active Products</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">
                {products.reduce((sum, p) => sum + (p.currentQuantity || 0), 0)}
              </div>
              <div className="text-gray-600">Total Quantity</div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showInvoiceUpload && (
        <InvoiceUploadModal
          onClose={() => setShowInvoiceUpload(false)}
          onProductsExtracted={handleInvoiceProcessed}
        />
      )}

      {showProductModal && (
        <EnhancedProductModal
          product={selectedProduct}
          isEditing={isEditing}
          onClose={() => {
            setShowProductModal(false)
            setSelectedProduct(null)
            setIsEditing(false)
          }}
          onSaved={handleProductSaved}
        />
      )}

      {showHistoryModal && (
        <ProductHistoryModal
          product={historyProduct}
          isOpen={showHistoryModal}
          onClose={() => {
            setShowHistoryModal(false)
            setHistoryProduct(null)
          }}
        />
      )}

      {showImageUpload && selectedProductForImage && (
        <ProductImageUpload
          product={selectedProductForImage}
          isOpen={showImageUpload}
          onClose={() => {
            setShowImageUpload(false)
            setSelectedProductForImage(null)
          }}
          onImageUploaded={handleImageUploaded}
        />
      )}
    </div>
  )
}

export default ProductsDashboard
