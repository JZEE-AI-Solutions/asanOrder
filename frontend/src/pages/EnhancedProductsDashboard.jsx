import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api, { getImageUrl } from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import InvoiceUploadModal from '../components/InvoiceUploadModal'
import EnhancedProductModal from '../components/EnhancedProductModal'
import PurchaseInvoiceModal from '../components/PurchaseInvoiceModal'
import ProductHistoryModal from '../components/ProductHistoryModal'
import ProductImageUpload from '../components/ProductImageUpload'
import ReturnsManagement from '../components/ReturnsManagement'
import {
  PlusIcon,
  CameraIcon,
  PhotoIcon,
  DocumentArrowUpIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ListBulletIcon,
  Squares2X2Icon,
  DocumentTextIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  BuildingStorefrontIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'

const EnhancedProductsDashboard = () => {
  const { user } = useAuth()
  const [tenant, setTenant] = useState(null)
  const [products, setProducts] = useState([])
  const [purchaseInvoices, setPurchaseInvoices] = useState([])
  const [deletedInvoices, setDeletedInvoices] = useState([])
  const [purchaseItems, setPurchaseItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [currentView, setCurrentView] = useState('invoices') // 'invoices', 'products', 'purchase-items', 'returns', or 'deleted-invoices'
  const [displayMode, setDisplayMode] = useState('card') // 'card' or 'list'
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [showInvoiceUpload, setShowInvoiceUpload] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showProductHistory, setShowProductHistory] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showImageUpload, setShowImageUpload] = useState(false)
  const [selectedPurchaseItem, setSelectedPurchaseItem] = useState(null)
  const [showProductImageUpload, setShowProductImageUpload] = useState(false)
  const [selectedProductForImage, setSelectedProductForImage] = useState(null)
  const [imageRefreshKey, setImageRefreshKey] = useState(0)

  useEffect(() => {
    fetchTenantData()
  }, [])

  useEffect(() => {
    if (tenant) {
      fetchData()
    }
  }, [tenant])

  useEffect(() => {
    // Fetch purchase items when switching to purchase-items view
    if (currentView === 'purchase-items' && !selectedInvoice) {
      fetchAllPurchaseItems()
    }
  }, [currentView, selectedInvoice])

  const fetchTenantData = async () => {
    try {
      const tenantRes = await api.get('/tenant/owner/me')
      setTenant(tenantRes.data.tenant)
    } catch (error) {
      console.error('Failed to fetch tenant data:', error)
      toast.error('Failed to fetch tenant data')
    }
  }

  const fetchData = async () => {
    if (!tenant) return
    
    try {
      setLoading(true)
      const [productsRes, invoicesRes, deletedInvoicesRes] = await Promise.all([
        api.get('/product'),
        api.get('/purchase-invoice'),
        api.get('/purchase-invoice?includeDeleted=true')
      ])
      setProducts(productsRes.data.products)
      setPurchaseInvoices(invoicesRes.data.purchaseInvoices)
      setDeletedInvoices(deletedInvoicesRes.data.purchaseInvoices.filter(invoice => invoice.isDeleted))
      
      // If viewing purchase items, fetch all purchase items from all invoices
      if (currentView === 'purchase-items' && !selectedInvoice) {
        await fetchAllPurchaseItems()
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
      toast.error('Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  const fetchAllPurchaseItems = async () => {
    try {
      const response = await api.get('/purchase-invoice')
      const allPurchaseItems = []
      
      // Extract purchase items from all invoices
      response.data.purchaseInvoices.forEach(invoice => {
        if (invoice.purchaseItems) {
          allPurchaseItems.push(...invoice.purchaseItems)
        }
      })
      
      setPurchaseItems(allPurchaseItems)
    } catch (error) {
      console.error('Failed to fetch all purchase items:', error)
      toast.error('Failed to fetch purchase items')
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
    fetchData()
  }

  const handleDeleteProduct = async (productId) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await api.delete(`/product/${productId}`)
        toast.success('Product deleted successfully')
        fetchData()
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
      fetchData()
    } catch (error) {
      toast.error('Failed to update product status')
    }
  }

  const handleViewProductHistory = (product) => {
    setSelectedProduct(product)
    setShowProductHistory(true)
  }

  const handleRestoreInvoice = async (invoiceId) => {
    const confirmed = window.confirm(
      'Are you sure you want to restore this invoice?\n\n' +
      'This will:\n' +
      '• Restore all inventory changes\n' +
      '• Restore purchase items\n' +
      '• Create audit logs for the restoration\n\n' +
      'The invoice will become active again.'
    )
    
    if (confirmed) {
      try {
        const response = await api.post(`/purchase-invoice/${invoiceId}/restore`)
        const results = response.data.results
        
        // Show detailed success message
        let message = 'Invoice restored successfully!'
        if (results) {
          message += `\n• ${results.inventoryRestored} inventory items restored`
          message += `\n• ${results.logsCreated} audit logs created`
          if (results.errors.length > 0) {
            message += `\n• ${results.errors.length} warnings occurred`
          }
        }
        
        toast.success(message)
        fetchData()
      } catch (error) {
        console.error('Restore invoice error:', error)
        toast.error('Failed to restore invoice')
      }
    }
  }

  const handleInvoiceProcessed = async (extractedProducts, invoiceData) => {
    setShowInvoiceUpload(false)
    try {
      // The invoice and products are already created by the InvoiceUploadModal
      toast.success(`${extractedProducts.length} products imported successfully!`)
      fetchData()
    } catch (error) {
      toast.error('Failed to save products')
    }
  }

  const handleViewInvoiceProducts = async (invoice) => {
    setSelectedInvoice(invoice)
    setCurrentView('purchase-items')
    setSearchTerm('')
    setCategoryFilter('')
    
    // Fetch purchase items for this specific invoice
    try {
      const response = await api.get(`/purchase-invoice/${invoice.id}`)
      setPurchaseItems(response.data.purchaseInvoice.purchaseItems || [])
    } catch (error) {
      console.error('Failed to fetch purchase items:', error)
      toast.error('Failed to fetch purchase items')
    }
  }

  const handleImageUpload = (purchaseItem) => {
    setSelectedPurchaseItem(purchaseItem)
    setShowImageUpload(true)
  }

  const handleImageUploaded = async (result) => {
    console.log('Image upload result:', result)
    
    // Refresh data to get the updated image data
    try {
      // Always refresh all data to get updated images in all views
      await fetchData()
      
      // If viewing a specific invoice, also refresh that invoice's purchase items
      if (selectedInvoice) {
        const response = await api.get(`/purchase-invoice/${selectedInvoice.id}`)
        setPurchaseItems(response.data.purchaseInvoice.purchaseItems || [])
      } else if (currentView === 'purchase-items') {
        // If viewing all purchase items, fetch all purchase items
        await fetchAllPurchaseItems()
      }
      
      // Force refresh images by adding a cache-busting parameter
      // This will trigger a re-render with new image URLs
      setImageRefreshKey(Date.now())
      
      toast.success('Image uploaded successfully!')
    } catch (error) {
      console.error('Failed to refresh data after image upload:', error)
      toast.error('Image uploaded but failed to refresh view')
    }
  }

  const handleProductImageUpload = (product) => {
    setSelectedProductForImage(product)
    setShowProductImageUpload(true)
  }

  const handleProductImageUploaded = async (result) => {
    console.log('Product image upload result:', result)
    
    // Refresh data to get the updated image data
    try {
      await fetchData()
      setImageRefreshKey(Date.now())
      toast.success('Product image uploaded successfully!')
    } catch (error) {
      console.error('Error refreshing data after product image upload:', error)
      toast.error('Image uploaded but failed to refresh data')
    }
  }


  const handleEditInvoice = (invoice) => {
    setSelectedInvoice(invoice)
    setShowInvoiceModal(true)
  }

  const handleDeleteInvoice = async (invoiceId) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this invoice?\n\n' +
      'This will:\n' +
      '• Reverse all inventory changes\n' +
      '• Remove purchase items\n' +
      '• Update any linked returns\n' +
      '• Create audit logs for the deletion\n\n' +
      'This action cannot be undone.'
    )
    
    if (confirmed) {
      try {
        const response = await api.delete(`/purchase-invoice/${invoiceId}`)
        const results = response.data.results
        
        // Show detailed success message
        let message = 'Invoice deleted successfully!'
        if (results) {
          message += `\n• ${results.inventoryReversed} inventory items reversed`
          message += `\n• ${results.purchaseItemsDeleted} purchase items removed`
          if (results.returnsUpdated > 0) {
            message += `\n• ${results.returnsUpdated} returns updated`
          }
          if (results.errors.length > 0) {
            message += `\n• ${results.errors.length} warnings occurred`
          }
        }
        
        toast.success(message)
        fetchData()
      } catch (error) {
        console.error('Delete invoice error:', error)
        toast.error('Failed to delete invoice')
      }
    }
  }

  // Filter products based on search, category, and selected invoice
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCategory = !categoryFilter || product.category === categoryFilter
    
    return matchesSearch && matchesCategory
  })

  // Filter purchase items based on search and category
  const filteredPurchaseItems = purchaseItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesCategory = !categoryFilter || item.category === categoryFilter
    
    return matchesSearch && matchesCategory
  })

  // Get unique categories for filter
  const allCategories = [
    ...products.map(p => p.category),
    ...purchaseItems.map(p => p.category)
  ].filter(Boolean)
  const categories = [...new Set(allCategories)]

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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Products Management</h1>
              <p className="text-gray-300">Manage your inventory and import products from invoices</p>
            </div>
            
            {/* View Toggle */}
            <div className="mt-4 sm:mt-0 flex space-x-2">
              <button
                onClick={fetchData}
                disabled={loading}
                className="px-4 py-2 rounded-lg font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh all data"
              >
                <ArrowPathIcon className={`h-5 w-5 inline mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => setCurrentView('invoices')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentView === 'invoices'
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <DocumentTextIcon className="h-5 w-5 inline mr-2" />
                Invoices
              </button>
              <button
                onClick={() => setCurrentView('products')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentView === 'products'
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Squares2X2Icon className="h-5 w-5 inline mr-2" />
                Products
              </button>
              <button
                onClick={() => setCurrentView('returns')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentView === 'returns'
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <ArrowPathIcon className="h-5 w-5 inline mr-2" />
                Returns
              </button>
              <button
                onClick={() => setCurrentView('deleted-invoices')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  currentView === 'deleted-invoices'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <TrashIcon className="h-5 w-5 inline mr-2" />
                Deleted Invoices
              </button>
            </div>
          </div>
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
                placeholder={
                  currentView === 'invoices' ? 'Search invoices...' : 
                  currentView === 'products' ? 'Search products...' : 
                  currentView === 'purchase-items' ? 'Search purchase items...' :
                  'Search returns...'
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>
            
            {(currentView === 'products' || currentView === 'purchase-items') && (
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
            )}

            {/* Display Mode Toggle and Refresh */}
            <div className="flex space-x-2">
              <button
                onClick={() => setDisplayMode('card')}
                className={`p-2 rounded-lg transition-colors ${
                  displayMode === 'card'
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
                title="Card View"
              >
                <Squares2X2Icon className="h-5 w-5" />
              </button>
              <button
                onClick={() => setDisplayMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  displayMode === 'list'
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                }`}
                title="List View"
              >
                <ListBulletIcon className="h-5 w-5" />
              </button>
              {(currentView === 'products' || currentView === 'purchase-items') && (
                <button
                  onClick={fetchData}
                  disabled={loading}
                  className="p-2 rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={`Refresh ${currentView === 'products' ? 'Products' : 'Purchase Items'}`}
                >
                  <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Breadcrumb for selected invoice */}
        {selectedInvoice && (currentView === 'products' || currentView === 'purchase-items') && (
          <div className="mb-6">
            <nav className="flex items-center space-x-2 text-sm">
              <button
                onClick={() => {
                  setSelectedInvoice(null)
                  setCurrentView('invoices')
                }}
                className="text-pink-400 hover:text-pink-300"
              >
                Invoices
              </button>
              <span className="text-gray-400">/</span>
              <span className="text-gray-300">
                {selectedInvoice.invoiceNumber} - {selectedInvoice.supplierName || 'Unknown Supplier'}
              </span>
            </nav>
          </div>
        )}

        {/* Content */}
        {currentView === 'invoices' ? (
          <PurchaseInvoicesView
            invoices={purchaseInvoices}
            displayMode={displayMode}
            onViewProducts={handleViewInvoiceProducts}
            onEditInvoice={handleEditInvoice}
            onDeleteInvoice={handleDeleteInvoice}
          />
        ) : currentView === 'products' ? (
          <ProductsView
            products={filteredProducts}
            displayMode={displayMode}
            selectedInvoice={selectedInvoice}
            onEditProduct={handleEditProduct}
            onDeleteProduct={handleDeleteProduct}
            onToggleStatus={handleToggleProductStatus}
            onViewProductHistory={handleViewProductHistory}
            onProductImageUpload={handleProductImageUpload}
          />
        ) : currentView === 'purchase-items' ? (
          <PurchaseItemsView
            purchaseItems={filteredPurchaseItems}
            displayMode={displayMode}
            selectedInvoice={selectedInvoice}
            onImageUpload={handleImageUpload}
          />
        ) : currentView === 'returns' ? (
          <ReturnsManagement />
        ) : currentView === 'deleted-invoices' ? (
          <DeletedInvoicesView
            deletedInvoices={deletedInvoices}
            displayMode={displayMode}
            onRestoreInvoice={handleRestoreInvoice}
          />
        ) : null}

        {/* Stats */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-pink-600">{purchaseInvoices.length}</div>
            <div className="text-gray-600">Total Invoices</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{products.length}</div>
            <div className="text-gray-600">Total Products</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {products.filter(p => p.isActive).length}
            </div>
            <div className="text-gray-600">Active Products</div>
          </div>
          <div className="card p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {products.reduce((sum, p) => sum + (p.currentQuantity || 0), 0)}
            </div>
            <div className="text-gray-600">Total Quantity</div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showInvoiceUpload && (
        <InvoiceUploadModal
          onClose={() => setShowInvoiceUpload(false)}
          onProductsExtracted={handleInvoiceProcessed}
        />
      )}

      {showProductHistory && (
        <ProductHistoryModal
          isOpen={showProductHistory}
          onClose={() => {
            setShowProductHistory(false)
            setSelectedProduct(null)
          }}
          product={selectedProduct}
        />
      )}

      {showImageUpload && selectedPurchaseItem && (
        <ProductImageUpload
          isOpen={showImageUpload}
          onClose={() => {
            setShowImageUpload(false)
            setSelectedPurchaseItem(null)
          }}
          purchaseItem={selectedPurchaseItem}
          onImageUploaded={handleImageUploaded}
        />
      )}

      {showProductImageUpload && selectedProductForImage && (
        <ProductImageUpload
          isOpen={showProductImageUpload}
          onClose={() => {
            setShowProductImageUpload(false)
            setSelectedProductForImage(null)
          }}
          product={selectedProductForImage}
          onImageUploaded={handleProductImageUploaded}
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

      {showInvoiceModal && selectedInvoice && (
        <PurchaseInvoiceModal
          invoice={selectedInvoice}
          onClose={() => {
            setShowInvoiceModal(false)
            setSelectedInvoice(null)
          }}
          onSaved={() => {
            setShowInvoiceModal(false)
            setSelectedInvoice(null)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

// Purchase Invoices View Component
const PurchaseInvoicesView = ({ invoices, displayMode, onViewProducts, onEditInvoice, onDeleteInvoice }) => {
  if (invoices.length === 0) {
    return (
      <div className="card p-8 text-center">
        <DocumentArrowUpIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Purchase Invoices</h3>
        <p className="text-gray-600">Import products from invoices to get started</p>
      </div>
    )
  }

  if (displayMode === 'list') {
    return (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Supplier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Products
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {invoice.invoiceNumber}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {invoice.supplierName || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(invoice.invoiceDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    Rs. {invoice.totalAmount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {invoice._count.purchaseItems} items
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => onViewProducts(invoice)}
                        className="text-pink-600 hover:text-pink-900"
                        title="View Products"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onEditInvoice(invoice)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit Invoice"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDeleteInvoice(invoice.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete Invoice"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {invoices.map((invoice) => (
        <div key={invoice.id} className="card hover:shadow-xl transition-all duration-300 group">
          <div className="p-4 sm:p-6">
            {/* Invoice Header */}
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900 text-lg mb-1 group-hover:text-pink-600 transition-colors">
                {invoice.invoiceNumber}
              </h3>
              {invoice.supplierName && (
                <p className="text-gray-600 text-sm mb-2">
                  <BuildingStorefrontIcon className="h-4 w-4 inline mr-1" />
                  {invoice.supplierName}
                </p>
              )}
            </div>

            {/* Invoice Details */}
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Date:</span>
                <span className="font-semibold">
                  {new Date(invoice.invoiceDate).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Amount:</span>
                <span className="font-semibold text-green-600">
                  Rs. {invoice.totalAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Items:</span>
                <span className="font-semibold">
                  {invoice._count.purchaseItems} items
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center">
              <button
                onClick={() => onViewProducts(invoice)}
                className="btn-primary text-sm"
              >
                View Products
              </button>
              <div className="flex space-x-2">
                <button
                  onClick={() => onEditInvoice(invoice)}
                  className="text-blue-600 hover:text-blue-900 p-1"
                  title="Edit Invoice"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onDeleteInvoice(invoice.id)}
                  className="text-red-600 hover:text-red-900 p-1"
                  title="Delete Invoice"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Products View Component
const ProductsView = ({ products, displayMode, selectedInvoice, onEditProduct, onDeleteProduct, onToggleStatus, onViewProductHistory, onProductImageUpload }) => {
  if (products.length === 0) {
    return (
      <div className="card p-8 text-center">
        <DocumentArrowUpIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {selectedInvoice ? 'No products in this invoice' : 'No products found'}
        </h3>
        <p className="text-gray-600">
          {selectedInvoice 
            ? 'This invoice has no products associated with it'
            : 'Add products manually or import from an invoice'
          }
        </p>
      </div>
    )
  }

  if (displayMode === 'list') {
    return (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Purchase Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Retail Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                {!selectedInvoice && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice
                  </th>
                )}
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{product.name}</div>
                      {product.description && (
                        <div className="text-sm text-gray-500">{product.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.category || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    Rs. {(product.lastPurchasePrice || 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.currentQuantity || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    Rs. {(product.currentRetailPrice || 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`badge ${product.isActive ? 'badge-confirmed' : 'badge-pending'}`}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {!selectedInvoice && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      N/A
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => onEditProduct(product)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit Product"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onToggleStatus(product)}
                        className={`${product.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}`}
                        title={product.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {product.isActive ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => onDeleteProduct(product.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete Product"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {products.map((product) => (
        <div key={product.id} className="card hover:shadow-xl transition-all duration-300 group">
          <div className="p-4 sm:p-6">
            {/* Product Image */}
            <div className="w-full h-32 bg-gray-100 rounded-lg mb-4 flex items-center justify-center relative group">
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
              
              {/* Image Upload Overlay */}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-200 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => onProductImageUpload(product)}
                  className="bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-700 hover:text-gray-900 p-3 rounded-full shadow-lg transition-all duration-200 transform hover:scale-110"
                  title="Upload/Change image"
                >
                  <CameraIcon className="h-6 w-6" />
                </button>
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
                <span className="text-gray-600">Last Purchase Price:</span>
                <span className="font-semibold">Rs. {(product.lastPurchasePrice || 0).toFixed(2)}</span>
              </div>
              {product.currentRetailPrice && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Retail Price:</span>
                  <span className="font-semibold text-green-600">Rs. {product.currentRetailPrice.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Current Quantity:</span>
                <span className={`font-semibold ${(product.currentQuantity || 0) === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {product.currentQuantity || 0}
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
                onClick={() => onViewProductHistory(product)}
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
                        log.action === 'CREATE' ? 'bg-green-500' :
                        log.action === 'INCREASE' ? 'bg-blue-500' :
                        log.action === 'DECREASE' ? 'bg-red-500' :
                        log.action === 'IMAGE_UPLOADED' ? 'bg-purple-500' :
                        log.action === 'IMAGE_CHANGED' ? 'bg-indigo-500' :
                        'bg-gray-500'
                      }`}></span>
                      <span className="font-medium">{log.action}</span>
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
            <div className="flex justify-between items-center mt-4">
              <div className="flex space-x-2">
                <button
                  onClick={() => onEditProduct(product)}
                  className="text-primary-600 hover:text-primary-900 p-1"
                  title="Edit product"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onToggleStatus(product)}
                  className={`p-1 ${product.isActive ? 'text-orange-600 hover:text-orange-900' : 'text-green-600 hover:text-green-900'}`}
                  title={product.isActive ? 'Deactivate' : 'Activate'}
                >
                  {product.isActive ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => onDeleteProduct(product.id)}
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
  )
}

// Purchase Items View Component
const PurchaseItemsView = ({ purchaseItems, displayMode, selectedInvoice, onImageUpload }) => {
  if (purchaseItems.length === 0) {
    return (
      <div className="card p-8 text-center">
        <DocumentArrowUpIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Purchase Items</h3>
        <p className="text-gray-600">This invoice has no purchase items</p>
      </div>
    )
  }

  if (displayMode === 'list') {
    return (
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Purchase Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {purchaseItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      {item.description && (
                        <div className="text-sm text-gray-500">{item.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.category || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    Rs. {item.purchasePrice.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.quantity}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                    Rs. {(item.purchasePrice * item.quantity).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {purchaseItems.map((item) => (
          <div key={item.id} className="card hover:shadow-xl transition-all duration-300 group">
          <div className="p-4 sm:p-6">
            {/* Product Image */}
            <div className="w-full h-32 bg-gray-100 rounded-lg mb-4 flex items-center justify-center relative group">
              <img 
                src={getImageUrl('purchase-item', item.id, true)}
                alt={item.name}
                className="w-full h-full object-cover rounded-lg"
                onError={(e) => {
                  e.target.style.display = 'none'
                  e.target.nextElementSibling.style.display = 'flex'
                }}
              />
              <div style={{display: 'none'}} className="text-center">
                <PhotoIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-xs text-gray-500">No image</p>
              </div>
              
              {/* Upload Button Overlay */}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => onImageUpload(item)}
                  className="bg-white bg-opacity-90 hover:bg-opacity-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium flex items-center space-x-2 transition-all duration-200"
                >
                  <CameraIcon className="h-4 w-4" />
                  <span>{(item.imageData || item.image) ? 'Change' : 'Upload'}</span>
                </button>
              </div>
            </div>

            {/* Product Info */}
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900 text-lg mb-1 group-hover:text-pink-600 transition-colors">
                {item.name}
              </h3>
              {item.description && (
                <p className="text-gray-600 text-sm mb-2 line-clamp-2">
                  {item.description}
                </p>
              )}
              {item.category && (
                <span className="inline-block bg-pink-100 text-pink-800 text-xs px-2 py-1 rounded-full mb-2">
                  {item.category}
                </span>
              )}
            </div>

            {/* Purchase Item Details */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Purchase Price:</span>
                <span className="font-semibold">Rs. {item.purchasePrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Quantity:</span>
                <span className="font-semibold">{item.quantity}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="text-gray-600 font-semibold">Total:</span>
                <span className="font-bold text-green-600">Rs. {(item.purchasePrice * item.quantity).toFixed(2)}</span>
              </div>
              {item.sku && (
                <div className="flex justify-between">
                  <span className="text-gray-600">SKU:</span>
                  <span className="font-mono text-xs">{item.sku}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Deleted Invoices View Component
const DeletedInvoicesView = ({ deletedInvoices, displayMode, onRestoreInvoice }) => {
  if (deletedInvoices.length === 0) {
    return (
      <div className="card p-8 text-center">
        <TrashIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Deleted Invoices</h3>
        <p className="text-gray-600">There are no deleted invoices to display.</p>
      </div>
    )
  }

  if (displayMode === 'list') {
    return (
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Deleted Invoices</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Supplier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Deleted
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {deletedInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{invoice.invoiceNumber}</div>
                      {invoice.notes && (
                        <div className="text-sm text-gray-500">{invoice.notes}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {invoice.supplierName || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {new Date(invoice.invoiceDate).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                    Rs. {invoice.totalAmount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {invoice._count?.purchaseItems || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>
                      <div>{new Date(invoice.deletedAt).toLocaleDateString()}</div>
                      <div className="text-xs">{invoice.deleteReason}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => onRestoreInvoice(invoice.id)}
                      className="text-green-600 hover:text-green-900 mr-3"
                      title="Restore Invoice"
                    >
                      <ArrowPathIcon className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {deletedInvoices.map((invoice) => (
        <div key={invoice.id} className="card hover:shadow-xl transition-all duration-300 group border-l-4 border-red-500">
          <div className="p-4 sm:p-6">
            {/* Invoice Header */}
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900 text-lg mb-1 group-hover:text-red-600 transition-colors">
                {invoice.invoiceNumber}
              </h3>
              {invoice.supplierName && (
                <p className="text-gray-600 text-sm mb-2">{invoice.supplierName}</p>
              )}
              {invoice.notes && (
                <p className="text-gray-500 text-xs line-clamp-2">{invoice.notes}</p>
              )}
            </div>

            {/* Invoice Details */}
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-gray-600">Date:</span>
                <span className="font-semibold">{new Date(invoice.invoiceDate).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Amount:</span>
                <span className="font-semibold text-green-600">Rs. {invoice.totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Items:</span>
                <span className="font-semibold">{invoice._count?.purchaseItems || 0}</span>
              </div>
            </div>

            {/* Deletion Info */}
            <div className="mb-4 p-3 bg-red-50 rounded-lg">
              <div className="text-xs text-red-800">
                <div className="font-semibold mb-1">Deleted Information:</div>
                <div>Date: {new Date(invoice.deletedAt).toLocaleDateString()}</div>
                {invoice.deleteReason && (
                  <div className="mt-1">Reason: {invoice.deleteReason}</div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-center">
              <button
                onClick={() => onRestoreInvoice(invoice.id)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                title="Restore Invoice"
              >
                <ArrowPathIcon className="h-4 w-4" />
                <span>Restore</span>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default EnhancedProductsDashboard
