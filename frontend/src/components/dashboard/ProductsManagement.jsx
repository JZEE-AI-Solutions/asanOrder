import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import api, { getImageUrl } from '../../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../LoadingSpinner'
import ProductHistoryModal from '../ProductHistoryModal'
import ProductImageUpload from '../ProductImageUpload'
import VariantImageUpload from '../VariantImageUpload'
import InvoiceUploadModal from '../InvoiceUploadModal'
import {
    PlusIcon,
    CameraIcon,
    MagnifyingGlassIcon,
    Squares2X2Icon,
    ListBulletIcon,
    ArrowPathIcon,
    ClockIcon,
    PencilIcon,
    TrashIcon,
    EyeIcon,
    EyeSlashIcon
} from '@heroicons/react/24/outline'

const ProductsManagement = () => {
    const { user } = useAuth()
    const navigate = useNavigate()
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [displayMode, setDisplayMode] = useState('card') // 'card' or 'list'

    // Modals state
    const [showProductHistory, setShowProductHistory] = useState(false)
    const [showProductImageUpload, setShowProductImageUpload] = useState(false)
    const [showInvoiceUpload, setShowInvoiceUpload] = useState(false)

    // Selected items
    const [selectedProduct, setSelectedProduct] = useState(null) // For history modal
    const [selectedProductForImage, setSelectedProductForImage] = useState(null)
    const [imageRefreshVersion, setImageRefreshVersion] = useState(Date.now())
    const [showVariantImageUpload, setShowVariantImageUpload] = useState(false)
    const [selectedVariantForImage, setSelectedVariantForImage] = useState(null)

    useEffect(() => {
        fetchProducts()
    }, [])

    // Refetch products when user returns to this page (e.g. from Edit Product after setting primary media)
    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') fetchProducts()
        }
        document.addEventListener('visibilitychange', onVisibilityChange)
        return () => document.removeEventListener('visibilitychange', onVisibilityChange)
    }, [])

    const fetchProducts = async () => {
        try {
            setLoading(true)
            const response = await api.get('/product')
            setProducts(response.data.products)
        } catch (error) {
            console.error('Failed to fetch products:', error)
            toast.error('Failed to fetch products')
        } finally {
            setLoading(false)
        }
    }

    const handleCreateProduct = () => {
        navigate('/business/products/new')
    }

    const handleEditProduct = (product) => {
        navigate(`/business/products/${product.id}/edit`)
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

    const handleViewProductHistory = (product) => {
        setSelectedProduct(product)
        setShowProductHistory(true)
    }

    const handleProductImageUpload = (product) => {
        setSelectedProductForImage(product)
        setShowProductImageUpload(true)
    }

    const handleProductImageUploaded = async (result) => {
        try {
            await fetchProducts()
            setImageRefreshVersion(Date.now())
            toast.success('Product image uploaded successfully!')
        } catch (error) {
            console.error('Error refreshing data after product image upload:', error)
            toast.error('Image uploaded but failed to refresh data')
        }
    }

    const handleInvoiceProcessed = async (extractedProducts) => {
        setShowInvoiceUpload(false)
        toast.success(`${extractedProducts.length} products imported successfully!`)
        fetchProducts()
    }

    const handleVariantImageUpload = (variant) => {
        setSelectedVariantForImage(variant)
        setShowVariantImageUpload(true)
    }

    const handleVariantImageUploaded = async () => {
        setShowVariantImageUpload(false)
        setSelectedVariantForImage(null)
        try {
            await fetchProducts()
            setImageRefreshVersion(Date.now())
        } catch (error) {
            console.error('Error refreshing after variant image upload:', error)
            toast.error('Image uploaded but failed to refresh')
        }
    }

    // Filter products
    const filteredProducts = products.filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            product.sku?.toLowerCase().includes(searchTerm.toLowerCase())

        const matchesCategory = !categoryFilter || product.category === categoryFilter

        return matchesSearch && matchesCategory
    })

    // Get unique categories
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))]

    if (loading) {
        return <LoadingSpinner className="min-h-screen" />
    }

    return (
        <div className="space-y-6">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex gap-2">
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
                        Import Stock
                    </button>
                </div>

                <button
                    onClick={fetchProducts}
                    className="p-2 text-gray-500 hover:text-brand-600 transition-colors"
                    title="Refresh"
                >
                    <ArrowPathIcon className="h-5 w-5" />
                </button>
            </div>

            {/* Filters */}
            <div className="card p-4">
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
                            className="input-field bg-white text-gray-900"
                        >
                            <option value="" className="text-gray-900 bg-white">All Categories</option>
                            {categories.map(category => (
                                <option key={category} value={category} className="text-gray-900 bg-white">{category}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex space-x-2">
                        <button
                            onClick={() => setDisplayMode('card')}
                            className={`p-2 rounded-lg transition-colors ${displayMode === 'card'
                                ? 'bg-brand-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            <Squares2X2Icon className="h-5 w-5" />
                        </button>
                        <button
                            onClick={() => setDisplayMode('list')}
                            className={`p-2 rounded-lg transition-colors ${displayMode === 'list'
                                ? 'bg-brand-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                        >
                            <ListBulletIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Products Grid/List */}
            {filteredProducts.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Squares2X2Icon className="h-8 w-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No Products Found</h3>
                    <p className="text-gray-500">Try adjusting your search or add a new product.</p>
                </div>
            ) : displayMode === 'card' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredProducts.map(product => (
                        <div key={product.id} className="card group hover:shadow-lg transition-all duration-200">
                            <div className="relative aspect-square bg-gray-100 rounded-t-xl overflow-hidden">
                                {(product.productImages?.[0]?.mediaType?.startsWith('video/')) ? (
                                    <video
                                        src={`${getImageUrl('product', product.id)}?t=${imageRefreshVersion}`}
                                        className="w-full h-full object-cover"
                                        muted
                                        playsInline
                                        autoPlay
                                        loop
                                        preload="metadata"
                                    />
                                ) : (
                                    <img
                                        src={`${getImageUrl('product', product.id)}?t=${imageRefreshVersion}`}
                                        alt={product.name}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            e.target.onerror = null
                                            e.target.style.display = 'none'
                                            const fallback = e.target.nextElementSibling
                                            if (fallback) {
                                                fallback.classList.remove('hidden')
                                                fallback.classList.add('flex')
                                            }
                                        }}
                                    />
                                )}
                                <div className="hidden w-full h-full items-center justify-center text-gray-400 absolute inset-0 bg-gray-100">
                                    <Squares2X2Icon className="h-12 w-12" />
                                </div>

                                {/* Overlay Actions - Only Image Upload */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button
                                        onClick={() => handleProductImageUpload(product)}
                                        className="p-2 bg-white rounded-full text-gray-900 hover:text-brand-600 transition-colors"
                                        title="Upload Image"
                                    >
                                        <CameraIcon className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-gray-900 line-clamp-1">{product.name}</h3>
                                        {(((product.hasVariants || product.isStitched) && product.variantCount > 0) || (product.variants && product.variants.length > 0)) ? (
                                            <span className="inline-flex items-center mt-1 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-medium">
                                                {(product.variantCount ?? product.variants?.length ?? 0)} {(product.variantCount ?? product.variants?.length ?? 0) === 1 ? 'variant' : 'variants'}
                                            </span>
                                        ) : null}
                                    </div>
                                    <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ml-2 ${product.isActive
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                        }`}>
                                        {product.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>

                                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{product.description}</p>

                                {/* Prices */}
                                <div className="space-y-1.5 mb-3 text-sm">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600">Purchase:</span>
                                        <span className="font-semibold text-gray-900 whitespace-nowrap">Rs. {parseFloat(product.lastPurchasePrice || 0).toFixed(2)}</span>
                                    </div>
                                    {product.currentRetailPrice && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600">Retail:</span>
                                            <span className="font-semibold text-green-600 whitespace-nowrap">Rs. {parseFloat(product.currentRetailPrice).toFixed(2)}</span>
                                        </div>
                                    )}
                                    {product.lastSalePrice && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-600">Sale:</span>
                                            <span className="font-semibold text-blue-600 whitespace-nowrap">Rs. {parseFloat(product.lastSalePrice).toFixed(2)}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between text-sm font-medium pt-2 border-t border-gray-100">
                                    <span className="text-gray-600">Qty:</span>
                                    <span className={`font-semibold ${(product.hasVariants && product.totalVariantStock !== null) 
                                      ? (product.totalVariantStock === 0 ? 'text-red-600' : 'text-gray-900')
                                      : ((product.currentQuantity || 0) === 0 ? 'text-red-600' : 'text-gray-900')
                                    }`}>
                                        {product.hasVariants && product.totalVariantStock !== null 
                                          ? product.totalVariantStock 
                                          : (product.currentQuantity || 0)}
                                    </span>
                                </div>
                                {product.hasVariants && product.totalVariantStock !== null && (
                                    <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                                        <span>Variant Stock:</span>
                                        <span>{product.totalVariantStock} total</span>
                                    </div>
                                )}

                                {/* Variants List */}
                                {product.hasVariants && product.variants && product.variants.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-gray-100">
                                        <p className="text-xs font-semibold text-gray-700 mb-2">Variants:</p>
                                        <div className="space-y-1.5">
                                            {product.variants.map((variant) => (
                                                <div key={variant.id} className="flex items-center gap-2 p-1.5 bg-gray-50 rounded">
                                                    {/* Variant Image + Upload */}
                                                    <div className="relative w-10 h-10 flex-shrink-0 group">
                                                        <div className="w-10 h-10 bg-gray-200 rounded overflow-hidden">
                                                            {(variant.images?.[0]?.imageType?.startsWith('video/')) ? (
                                                                <video
                                                                    src={`${getImageUrl('product-variant', variant.id)}?t=${imageRefreshVersion}`}
                                                                    className="w-full h-full object-cover"
                                                                    muted
                                                                    playsInline
                                                                    autoPlay
                                                                    loop
                                                                    preload="metadata"
                                                                />
                                                            ) : (
                                                                <img
                                                                    src={`${getImageUrl('product-variant', variant.id)}?t=${imageRefreshVersion}`}
                                                                    alt={`${variant.color}${variant.size ? `, ${variant.size}` : ''}`}
                                                                    className="w-full h-full object-cover"
                                                                    onError={(e) => {
                                                                        e.target.style.display = 'none'
                                                                        const fallback = e.target.nextElementSibling
                                                                        if (fallback) {
                                                                            fallback.style.display = 'flex'
                                                                        }
                                                                    }}
                                                                />
                                                            )}
                                                            <div style={{display: 'none'}} className="w-full h-full flex items-center justify-center text-gray-400 text-xs bg-gray-200">
                                                                <span>{variant.color?.[0] || 'V'}</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleVariantImageUpload(variant)}
                                                            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 rounded transition-opacity"
                                                            title="Upload variant image"
                                                        >
                                                            <CameraIcon className="h-4 w-4 text-white" />
                                                        </button>
                                                    </div>

                                                    {/* Variant Details */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-xs font-medium text-gray-900">
                                                                {variant.color}
                                                                {variant.size && <span className="text-gray-600">, {variant.size}</span>}
                                                            </span>
                                                            {variant.sku && (
                                                                <span className="text-xs text-gray-500 font-mono bg-gray-200 px-1 py-0.5 rounded">
                                                                    {variant.sku}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center justify-between mt-0.5">
                                                            <span className="text-xs text-gray-500">Qty:</span>
                                                            <span className={`text-xs font-semibold ${variant.currentQuantity === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                                                {variant.currentQuantity || 0}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end gap-2">
                                    <button
                                        onClick={() => handleViewProductHistory(product)}
                                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                        title="View History"
                                    >
                                        <ClockIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleToggleProductStatus(product)}
                                        className={`p-2 rounded-lg transition-colors ${product.isActive
                                            ? 'text-red-600 hover:bg-red-50'
                                            : 'text-green-600 hover:bg-green-50'
                                            }`}
                                        title={product.isActive ? 'Deactivate' : 'Activate'}
                                    >
                                        {product.isActive ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                                    </button>
                                    <button
                                        onClick={() => handleEditProduct(product)}
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Edit"
                                    >
                                        <PencilIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteProduct(product.id)}
                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Delete"
                                    >
                                        <TrashIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredProducts.map((product) => (
                                    <tr key={product.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="h-10 w-10 flex-shrink-0 relative">
                                                    {(product.productImages?.[0]?.mediaType?.startsWith('video/')) ? (
                                                        <video
                                                            src={`${getImageUrl('product', product.id)}?t=${imageRefreshVersion}`}
                                                            className="h-10 w-10 rounded-lg object-cover"
                                                            muted
                                                            playsInline
                                                            autoPlay
                                                            loop
                                                            preload="metadata"
                                                        />
                                                    ) : (
                                                        <img
                                                            className="h-10 w-10 rounded-lg object-cover"
                                                            src={`${getImageUrl('product', product.id)}?t=${imageRefreshVersion}`}
                                                            alt=""
                                                            onError={(e) => {
                                                                e.target.onerror = null
                                                                e.target.style.display = 'none'
                                                                e.target.nextSibling.style.display = 'flex'
                                                            }}
                                                        />
                                                    )}
                                                    <div className="hidden h-10 w-10 rounded-lg bg-gray-100 items-center justify-center absolute inset-0">
                                                        <Squares2X2Icon className="h-5 w-5 text-gray-400" />
                                                    </div>
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-gray-900">{product.name}</div>
                                                    <div className="text-sm text-gray-500">{product.sku}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.category}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Rs. {product.price}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.hasVariants && product.totalVariantStock != null ? product.totalVariantStock : (product.currentQuantity || 0)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${product.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {product.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex justify-end space-x-2">
                                                <button
                                                    onClick={() => handleProductImageUpload(product)}
                                                    className="text-gray-400 hover:text-brand-600"
                                                    title="Upload Image"
                                                >
                                                    <CameraIcon className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleViewProductHistory(product)}
                                                    className="text-purple-600 hover:text-purple-900"
                                                    title="View History"
                                                >
                                                    <ClockIcon className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleEditProduct(product)}
                                                    className="text-blue-600 hover:text-blue-900"
                                                    title="Edit"
                                                >
                                                    <PencilIcon className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteProduct(product.id)}
                                                    className="text-red-600 hover:text-red-900"
                                                    title="Delete"
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
            )}

            {/* Modals */}
            {
                showProductHistory && selectedProduct && (
                    <ProductHistoryModal
                        isOpen={showProductHistory}
                        onClose={() => {
                            setShowProductHistory(false)
                            setSelectedProduct(null)
                        }}
                        product={selectedProduct}
                    />
                )
            }

            {
                showProductImageUpload && selectedProductForImage && (
                    <ProductImageUpload
                        isOpen={showProductImageUpload}
                        onClose={() => {
                            setShowProductImageUpload(false)
                            setSelectedProductForImage(null)
                        }}
                        product={selectedProductForImage}
                        onImageUploaded={handleProductImageUploaded}
                    />
                )
            }

            {
                showVariantImageUpload && selectedVariantForImage && (
                    <VariantImageUpload
                        isOpen={showVariantImageUpload}
                        onClose={() => {
                            setShowVariantImageUpload(false)
                            setSelectedVariantForImage(null)
                        }}
                        variant={selectedVariantForImage}
                        onImageUploaded={handleVariantImageUploaded}
                    />
                )
            }

            {
                showInvoiceUpload && (
                    <InvoiceUploadModal
                        onClose={() => setShowInvoiceUpload(false)}
                        onProductsExtracted={handleInvoiceProcessed}
                    />
                )
            }
        </div >
    )
}

export default ProductsManagement
