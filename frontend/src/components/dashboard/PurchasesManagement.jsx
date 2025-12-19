import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import api, { getImageUrl } from '../../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../LoadingSpinner'
import PurchaseInvoiceModal from '../PurchaseInvoiceModal'
import InvoiceUploadModal from '../InvoiceUploadModal'
import AddPurchaseModal from '../AddPurchaseModal'
import ProductImageUpload from '../ProductImageUpload'
import {
    PlusIcon,
    CameraIcon,
    MagnifyingGlassIcon,
    Squares2X2Icon,
    ListBulletIcon,
    ArrowPathIcon,
    PencilIcon,
    TrashIcon,
    EyeIcon,
    DocumentArrowUpIcon,
    BuildingStorefrontIcon,
    CurrencyDollarIcon,
    ChartBarIcon
} from '@heroicons/react/24/outline'

const PurchasesManagement = () => {
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [displayMode, setDisplayMode] = useState('card')

    // Modals state
    const [showInvoiceModal, setShowInvoiceModal] = useState(false)
    const [showInvoiceUpload, setShowInvoiceUpload] = useState(false)
    const [showAddPurchase, setShowAddPurchase] = useState(false)
    const [selectedInvoice, setSelectedInvoice] = useState(null)

    // Purchase Items View state
    const [viewingItems, setViewingItems] = useState(false)
    const [purchaseItems, setPurchaseItems] = useState([])
    const [showImageUpload, setShowImageUpload] = useState(false)
    const [selectedPurchaseItem, setSelectedPurchaseItem] = useState(null)
    const [imageRefreshVersion, setImageRefreshVersion] = useState(Date.now())
    const [invoiceProfit, setInvoiceProfit] = useState(null)

    useEffect(() => {
        fetchInvoices()
    }, [])

    const fetchInvoices = async () => {
        try {
            setLoading(true)
            const response = await api.get('/purchase-invoice')
            setInvoices(response.data.purchaseInvoices)
        } catch (error) {
            console.error('Failed to fetch invoices:', error)
            toast.error('Failed to fetch invoices')
        } finally {
            setLoading(false)
        }
    }

    const handleEditInvoice = (invoice) => {
        setSelectedInvoice(invoice)
        setShowInvoiceModal(true)
    }

    const handleDeleteInvoice = async (invoiceId) => {
        if (window.confirm('Are you sure you want to delete this invoice? This will reverse inventory changes.')) {
            try {
                await api.delete(`/purchase-invoice/${invoiceId}`)
                toast.success('Invoice deleted successfully')
                fetchInvoices()
            } catch (error) {
                toast.error('Failed to delete invoice')
            }
        }
    }

    const handleViewProducts = async (invoice) => {
        setSelectedInvoice(invoice)
        setViewingItems(true)
        try {
            const response = await api.get(`/purchase-invoice/${invoice.id}`)
            setPurchaseItems(response.data.purchaseInvoice.purchaseItems || [])
            setInvoiceProfit(response.data.profit || null)
        } catch (error) {
            toast.error('Failed to fetch invoice items')
        }
    }

    const handleInvoiceProcessed = () => {
        setShowInvoiceUpload(false)
        toast.success('Invoice imported successfully!')
        fetchInvoices()
    }

    const handleImageUpload = (item) => {
        setSelectedPurchaseItem(item)
        setShowImageUpload(true)
    }

    const handleImageUploaded = async () => {
        toast.success('Image uploaded successfully')
        setImageRefreshVersion(Date.now())
        if (selectedInvoice) {
            handleViewProducts(selectedInvoice) // Refresh items
        }
    }

    // Filter invoices
    const filteredInvoices = invoices.filter(invoice =>
        invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        invoice.supplierName?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    if (loading) return <LoadingSpinner className="min-h-screen" />

    if (viewingItems && selectedInvoice) {
        // Find profit data for each item
        const getItemProfit = (itemId) => {
            if (!invoiceProfit || !invoiceProfit.items) return null
            return invoiceProfit.items.find(p => p.purchaseItemId === itemId)
        }

        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => {
                            setViewingItems(false)
                            setSelectedInvoice(null)
                            setInvoiceProfit(null)
                        }}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        ← Back to Invoices
                    </button>
                    <h2 className="text-xl font-bold text-gray-900">
                        Items in {selectedInvoice.invoiceNumber}
                    </h2>
                </div>

                {/* Profit Summary Card */}
                {invoiceProfit && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="card p-4 bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Purchase Cost</p>
                                    <p className="text-2xl font-bold text-red-900">Rs. {invoiceProfit.totalCost.toFixed(2)}</p>
                                    {invoiceProfit.totalSoldItemsCost !== undefined && (
                                        <p className="text-xs text-gray-600 mt-1">Sold: Rs. {invoiceProfit.totalSoldItemsCost.toFixed(2)}</p>
                                    )}
                                </div>
                                <CurrencyDollarIcon className="h-8 w-8 text-red-600 opacity-50" />
                            </div>
                        </div>
                        <div className="card p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Total Revenue</p>
                                    <p className="text-2xl font-bold text-blue-900">Rs. {invoiceProfit.totalRevenue.toFixed(2)}</p>
                                </div>
                                <ChartBarIcon className="h-8 w-8 text-blue-600 opacity-50" />
                            </div>
                        </div>
                        <div className={`card p-4 bg-gradient-to-br ${invoiceProfit.totalProfit >= 0 ? 'from-green-50 to-green-100 border-2 border-green-200' : 'from-gray-50 to-gray-100 border-2 border-gray-200'}`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: invoiceProfit.totalProfit >= 0 ? '#059669' : invoiceProfit.totalProfit < 0 ? '#dc2626' : '#6b7280' }}>
                                        Net Profit
                                    </p>
                                    <p className={`text-2xl font-bold ${invoiceProfit.totalProfit > 0 ? 'text-green-900' : invoiceProfit.totalProfit < 0 ? 'text-red-900' : 'text-gray-700'}`}>
                                        Rs. {invoiceProfit.totalProfit.toFixed(2)}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1">On sold items only</p>
                                </div>
                                <CurrencyDollarIcon className={`h-8 w-8 opacity-50 ${invoiceProfit.totalProfit > 0 ? 'text-green-600' : invoiceProfit.totalProfit < 0 ? 'text-red-600' : 'text-gray-600'}`} />
                            </div>
                        </div>
                        <div className="card p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1">Profit Margin</p>
                                    <p className={`text-2xl font-bold ${invoiceProfit.profitMargin > 0 ? 'text-green-900' : invoiceProfit.profitMargin < 0 ? 'text-red-900' : 'text-gray-700'}`}>
                                        {invoiceProfit.profitMargin.toFixed(2)}%
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1">On sold items only</p>
                                </div>
                                <ChartBarIcon className="h-8 w-8 text-purple-600 opacity-50" />
                            </div>
                        </div>
                    </div>
                )}

                <div className="card overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Image</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purchase Price</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Cost</th>
                                {invoiceProfit && (
                                    <>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sold Qty</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Revenue</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Profit</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Margin</th>
                                    </>
                                )}
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {purchaseItems.map((item) => {
                                const itemProfit = getItemProfit(item.id)
                                const purchasePrice = item.purchasePrice || item.unitCost || 0
                                return (
                                    <tr key={item.id}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="h-10 w-10 flex-shrink-0 relative">
                                                <img
                                                    className="h-10 w-10 rounded-lg object-cover"
                                                    src={`${getImageUrl('purchase-item', item.id)}?t=${imageRefreshVersion}`}
                                                    alt=""
                                                    onError={(e) => {
                                                        e.target.onerror = null
                                                        e.target.style.display = 'none'
                                                        e.target.nextSibling.style.display = 'flex'
                                                    }}
                                                />
                                                <div className="hidden h-10 w-10 rounded-lg bg-gray-100 items-center justify-center absolute inset-0">
                                                    <Squares2X2Icon className="h-5 w-5 text-gray-400" />
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.sku || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.quantity}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Rs. {purchasePrice.toFixed(2)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600">
                                            Rs. {(purchasePrice * item.quantity).toFixed(2)}
                                        </td>
                                        {invoiceProfit && itemProfit && (
                                            <>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {itemProfit.soldQuantity} / {item.quantity}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-blue-600">
                                                    Rs. {itemProfit.revenue.toFixed(2)}
                                                </td>
                                                <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold ${itemProfit.profit > 0 ? 'text-green-600' : itemProfit.profit < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                                    {itemProfit.soldQuantity > 0 ? `Rs. ${itemProfit.profit.toFixed(2)}` : 'Rs. 0.00'}
                                                </td>
                                                <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${itemProfit.profitMargin > 0 ? 'text-green-600' : itemProfit.profitMargin < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                                    {itemProfit.soldQuantity > 0 ? `${itemProfit.profitMargin.toFixed(2)}%` : '0.00%'}
                                                </td>
                                            </>
                                        )}
                                        {invoiceProfit && !itemProfit && (
                                            <>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">-</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">-</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">-</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">-</td>
                                            </>
                                        )}
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                onClick={() => handleImageUpload(item)}
                                                className="text-brand-600 hover:text-brand-900"
                                            >
                                                <CameraIcon className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

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
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowAddPurchase(true)}
                        className="btn-primary flex items-center justify-center"
                    >
                        <PlusIcon className="h-5 w-5 mr-2" />
                        Add Purchase
                    </button>
                    <button
                        onClick={() => setShowInvoiceUpload(true)}
                        className="btn-secondary flex items-center justify-center"
                    >
                        <CameraIcon className="h-5 w-5 mr-2" />
                        Scan Invoice
                    </button>
                </div>

                <button
                    onClick={fetchInvoices}
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
                            placeholder="Search invoices..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="input-field pl-10"
                        />
                    </div>

                    <div className="flex space-x-2">
                        <button
                            onClick={() => setDisplayMode('card')}
                            className={`p-2 rounded-lg transition-colors ${displayMode === 'card' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
                                }`}
                        >
                            <Squares2X2Icon className="h-5 w-5" />
                        </button>
                        <button
                            onClick={() => setDisplayMode('list')}
                            className={`p-2 rounded-lg transition-colors ${displayMode === 'list' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
                                }`}
                        >
                            <ListBulletIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Invoices Grid/List */}
            {filteredInvoices.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                    <DocumentArrowUpIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900">No Invoices Found</h3>
                    <p className="text-gray-500">Scan or upload an invoice to get started.</p>
                </div>
            ) : displayMode === 'list' ? (
                <div className="card overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredInvoices.map((invoice) => (
                                <tr key={invoice.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{invoice.invoiceNumber}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.supplierName || 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Rs. {invoice.totalAmount.toFixed(2)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end space-x-2">
                                            <button onClick={() => handleViewProducts(invoice)} className="text-brand-600 hover:text-brand-900" title="View Items">
                                                <EyeIcon className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => handleEditInvoice(invoice)} className="text-blue-600 hover:text-blue-900" title="Edit">
                                                <PencilIcon className="h-4 w-4" />
                                            </button>
                                            <button onClick={() => handleDeleteInvoice(invoice.id)} className="text-red-600 hover:text-red-900" title="Delete">
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredInvoices.map((invoice) => (
                        <div key={invoice.id} className="card hover:shadow-lg transition-all duration-200">
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">{invoice.invoiceNumber}</h3>
                                        <p className="text-sm text-gray-500 flex items-center mt-1">
                                            <BuildingStorefrontIcon className="h-4 w-4 mr-1" />
                                            {invoice.supplierName || 'Unknown Supplier'}
                                        </p>
                                    </div>
                                    <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                        {new Date(invoice.invoiceDate).toLocaleDateString()}
                                    </span>
                                </div>

                                <div className="flex justify-between items-end mt-4">
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wide">Total Amount</p>
                                        <p className="text-xl font-bold text-brand-600">Rs. {invoice.totalAmount.toFixed(2)}</p>
                                    </div>
                                    <div className="flex space-x-2">
                                        <button onClick={() => handleViewProducts(invoice)} className="p-2 text-gray-400 hover:text-brand-600 transition-colors">
                                            <EyeIcon className="h-5 w-5" />
                                        </button>
                                        <button onClick={() => handleEditInvoice(invoice)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors">
                                            <PencilIcon className="h-5 w-5" />
                                        </button>
                                        <button onClick={() => handleDeleteInvoice(invoice.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors">
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modals */}
            {showAddPurchase && (
                <AddPurchaseModal
                    onClose={() => setShowAddPurchase(false)}
                    onSaved={() => {
                        setShowAddPurchase(false)
                        fetchInvoices()
                    }}
                />
            )}

            {showInvoiceUpload && (
                <InvoiceUploadModal
                    onClose={() => setShowInvoiceUpload(false)}
                    onProductsExtracted={handleInvoiceProcessed}
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
                        fetchInvoices()
                    }}
                />
            )}
        </div>
    )
}

export default PurchasesManagement
