import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import api, { getImageUrl } from '../../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../LoadingSpinner'
import InvoiceUploadModal from '../InvoiceUploadModal'
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
    const navigate = useNavigate()
    const [invoices, setInvoices] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [displayMode, setDisplayMode] = useState('card')

    // Modals state
    const [showInvoiceUpload, setShowInvoiceUpload] = useState(false)
    const [selectedInvoice, setSelectedInvoice] = useState(null)

    // Purchase Items View state
    const [viewingItems, setViewingItems] = useState(false)
    const [purchaseItems, setPurchaseItems] = useState([])
    const [showImageUpload, setShowImageUpload] = useState(false)
    const [selectedPurchaseItem, setSelectedPurchaseItem] = useState(null)
    const [imageRefreshVersion, setImageRefreshVersion] = useState(Date.now())
    const [invoiceProfit, setInvoiceProfit] = useState(null)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState(null)
    const [paymentFormData, setPaymentFormData] = useState({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      paymentAccountId: ''
    })
    const [processingPayment, setProcessingPayment] = useState(false)
    const [supplierBalance, setSupplierBalance] = useState(null)
    const [loadingSupplierBalance, setLoadingSupplierBalance] = useState(false)
    const [useAdvanceBalance, setUseAdvanceBalance] = useState(false)
    const [advanceAmountUsed, setAdvanceAmountUsed] = useState('')

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

    const handleViewInvoice = (invoice) => {
        navigate(`/business/purchases/${invoice.id}`)
    }

    const handleEditInvoice = (invoice) => {
        navigate(`/business/purchases/${invoice.id}/edit`)
    }

    const calculatePendingAmount = (invoice) => {
        if (!invoice) return 0
        
        // Calculate total paid from Payment records linked to this purchase invoice
        // Prefer payments linked directly to invoice, fall back to supplier payments (backward compatibility)
        const invoicePayments = invoice.payments || []
        const supplierPayments = invoice.supplier?.payments || []
        
        // Use invoice payments if available, otherwise use supplier payments
        const paymentsToUse = invoicePayments.length > 0 ? invoicePayments : supplierPayments
        const paymentsTotal = paymentsToUse.reduce((sum, p) => sum + p.amount, 0)
        
        // Backward compatibility: if no payments and paymentAmount exists, use it
        // This handles old invoices created before we started linking payments
        const totalPaid = paymentsTotal > 0 
            ? paymentsTotal 
            : (invoice.paymentAmount || 0)
        
        return Math.max(0, invoice.totalAmount - totalPaid)
    }

    const handleMakePayment = async (invoice) => {
        const pending = calculatePendingAmount(invoice)
        setSelectedInvoiceForPayment(invoice)
        setPaymentFormData({
            date: new Date().toISOString().split('T')[0],
            amount: pending > 0 ? pending.toString() : '',
            paymentAccountId: ''
        })
        setUseAdvanceBalance(false)
        setAdvanceAmountUsed('')
        setShowPaymentModal(true)
        
        // Fetch supplier balance if supplier exists
        if (invoice.supplierId || invoice.supplier?.id) {
            const supplierId = invoice.supplierId || invoice.supplier.id
            setLoadingSupplierBalance(true)
            try {
                const response = await api.get(`/accounting/suppliers/${supplierId}`)
                const balance = response.data.supplier.balance
                // Calculate available advance (negative pending means advance)
                const availableAdvance = balance && balance.pending < 0 ? Math.abs(balance.pending) : 0
                setSupplierBalance({ ...balance, availableAdvance })
                
                // Auto-use advance if available and pending amount matches
                if (availableAdvance > 0 && pending > 0) {
                    const amountToUse = Math.min(availableAdvance, pending)
                    setUseAdvanceBalance(true)
                    setAdvanceAmountUsed(amountToUse.toString())
                    setPaymentFormData(prev => ({
                        ...prev,
                        amount: Math.max(0, pending - amountToUse).toString()
                    }))
                }
            } catch (error) {
                console.error('Failed to fetch supplier balance:', error)
                setSupplierBalance(null)
            } finally {
                setLoadingSupplierBalance(false)
            }
        } else {
            setSupplierBalance(null)
        }
    }

    const handlePaymentSubmit = async (e) => {
        e.preventDefault()
        
        if (!selectedInvoiceForPayment?.supplier?.id && !selectedInvoiceForPayment?.supplierId) {
            toast.error('Supplier information not available')
            return
        }

        const cashPayment = parseFloat(paymentFormData.amount) || 0
        const advanceUsed = useAdvanceBalance ? parseFloat(advanceAmountUsed || 0) : 0
        const totalPayment = cashPayment + advanceUsed
        const pending = calculatePendingAmount(selectedInvoiceForPayment)

        if (totalPayment <= 0) {
            toast.error('Please enter a valid payment amount')
            return
        }

        if (totalPayment > pending) {
            toast.error(`Total payment (Rs. ${totalPayment.toFixed(2)}) cannot exceed pending amount (Rs. ${pending.toFixed(2)})`)
            return
        }

        setProcessingPayment(true)
        try {
            const payload = {
                date: paymentFormData.date,
                type: 'SUPPLIER_PAYMENT',
                amount: cashPayment, // Only cash/bank payment amount
                paymentAccountId: cashPayment > 0 ? paymentFormData.paymentAccountId : null,
                supplierId: selectedInvoiceForPayment.supplierId || selectedInvoiceForPayment.supplier?.id,
                purchaseInvoiceId: selectedInvoiceForPayment.id,
                useAdvanceBalance: useAdvanceBalance && advanceUsed > 0,
                advanceAmountUsed: useAdvanceBalance ? advanceUsed : undefined
            }

            await api.post('/accounting/payments', payload)
            
            toast.success('Payment recorded successfully')
            setShowPaymentModal(false)
            setSelectedInvoiceForPayment(null)
            setSupplierBalance(null)
            setUseAdvanceBalance(false)
            setAdvanceAmountUsed('')
            
            // Refresh invoices to get updated payment info
            await fetchInvoices()
        } catch (error) {
            console.error('Error recording payment:', error)
            const errorMessage = error.response?.data?.error?.message || 'Failed to record payment'
            toast.error(errorMessage)
        } finally {
            setProcessingPayment(false)
        }
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
                        onClick={() => navigate('/business/purchases/add')}
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
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pending</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredInvoices.map((invoice) => {
                                const pendingAmount = calculatePendingAmount(invoice)
                                return (
                                    <tr key={invoice.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            <button
                                                onClick={() => handleViewInvoice(invoice)}
                                                className="text-blue-600 hover:text-blue-900 hover:underline"
                                            >
                                                {invoice.invoiceNumber}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.supplierName || invoice.supplier?.name || 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Rs. {invoice.totalAmount.toFixed(2)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            {pendingAmount > 0 ? (
                                                <span className="text-red-600 font-semibold">Rs. {pendingAmount.toFixed(2)}</span>
                                            ) : (
                                                <span className="text-green-600 font-semibold">Paid</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex justify-end items-center space-x-2">
                                                {(invoice.supplierId || invoice.supplier) && pendingAmount > 0 && (
                                                    <button
                                                        onClick={() => handleMakePayment(invoice)}
                                                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs font-semibold flex items-center min-h-[32px]"
                                                        title="Make Payment"
                                                    >
                                                        <CurrencyDollarIcon className="h-3 w-3 mr-1" />
                                                        Pay
                                                    </button>
                                                )}
                                                <button onClick={() => handleViewInvoice(invoice)} className="text-brand-600 hover:text-brand-900" title="View Invoice Details">
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
                                )
                            })}
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
                                        <button
                                            onClick={() => handleViewInvoice(invoice)}
                                            className="text-lg font-semibold text-gray-900 hover:text-blue-600 hover:underline"
                                        >
                                            {invoice.invoiceNumber}
                                        </button>
                                        <p className="text-sm text-gray-500 flex items-center mt-1">
                                            <BuildingStorefrontIcon className="h-4 w-4 mr-1" />
                                            {invoice.supplierName || 'Unknown Supplier'}
                                        </p>
                                    </div>
                                    <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                        {new Date(invoice.invoiceDate).toLocaleDateString()}
                                    </span>
                                </div>

                                <div className="mt-4 space-y-3">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Amount</p>
                                            <p className="text-sm font-bold text-gray-900">Rs. {invoice.totalAmount.toFixed(2)}</p>
                                        </div>
                                        {(() => {
                                            // Calculate total paid from Payment records linked to this purchase invoice
                                            // Prefer payments linked directly to invoice, fall back to supplier payments (backward compatibility)
                                            const invoicePayments = invoice.payments || []
                                            const supplierPayments = invoice.supplier?.payments || []
                                            
                                            // Use invoice payments if available, otherwise use supplier payments
                                            const paymentsToUse = invoicePayments.length > 0 ? invoicePayments : supplierPayments
                                            const paymentsTotal = paymentsToUse.reduce((sum, p) => sum + p.amount, 0)
                                            
                                            // Backward compatibility: if no payments and paymentAmount exists, use it
                                            // This handles old invoices created before we started linking payments
                                            const totalPaid = paymentsTotal > 0 
                                                ? paymentsTotal 
                                                : (invoice.paymentAmount || 0)
                                            
                                            const pending = Math.max(0, invoice.totalAmount - totalPaid)
                                            
                                            return (
                                                <>
                                                    {totalPaid > 0 && (
                                                        <div className="flex justify-between items-center">
                                                            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Paid</p>
                                                            <p className="text-sm font-bold text-green-600">Rs. {totalPaid.toFixed(2)}</p>
                                                        </div>
                                                    )}
                                                    {pending > 0 ? (
                                                        <div className="flex justify-between items-center">
                                                            <p className="text-xs text-gray-500 uppercase tracking-wide">Pending</p>
                                                            <p className="text-sm font-bold text-red-600">Rs. {pending.toFixed(2)}</p>
                                                        </div>
                                                    ) : totalPaid > 0 && (
                                                        <div className="flex justify-between items-center">
                                                            <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
                                                            <p className="text-sm font-bold text-green-600">Paid</p>
                                                        </div>
                                                    )}
                                                </>
                                            )
                                        })()}
                                    </div>
                                    <div className="flex space-x-2">
                                        {(invoice.supplierId || invoice.supplier) && calculatePendingAmount(invoice) > 0 && (
                                            <button
                                                onClick={() => handleMakePayment(invoice)}
                                                className="flex-1 flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold min-h-[44px]"
                                            >
                                                <CurrencyDollarIcon className="h-4 w-4 mr-1" />
                                                Pay
                                            </button>
                                        )}
                                        <button onClick={() => handleViewInvoice(invoice)} className="p-2 text-gray-400 hover:text-brand-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center" title="View Invoice Details">
                                            <EyeIcon className="h-5 w-5" />
                                        </button>
                                        <button onClick={() => handleEditInvoice(invoice)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
                                            <PencilIcon className="h-5 w-5" />
                                        </button>
                                        <button onClick={() => handleDeleteInvoice(invoice.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center">
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
            {showInvoiceUpload && (
                <InvoiceUploadModal
                    onClose={() => setShowInvoiceUpload(false)}
                    onProductsExtracted={handleInvoiceProcessed}
                />
            )}

            {/* Payment Modal */}
            {showPaymentModal && selectedInvoiceForPayment && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-gray-900">Make Payment</h2>
                                <button
                                    onClick={() => {
                                        setShowPaymentModal(false)
                                        setSelectedInvoiceForPayment(null)
                                    }}
                                    className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                >
                                    ✕
                                </button>
                            </div>

                            <form onSubmit={handlePaymentSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Invoice
                                    </label>
                                    <input
                                        type="text"
                                        value={`${selectedInvoiceForPayment.invoiceNumber} - ${selectedInvoiceForPayment.supplierName || selectedInvoiceForPayment.supplier?.name || 'N/A'}`}
                                        disabled
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 min-h-[44px]"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Date <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={paymentFormData.date}
                                        onChange={(e) => setPaymentFormData(prev => ({ ...prev, date: e.target.value }))}
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                                    />
                                </div>

                                {/* Payment Summary - Moved to top */}
                                {(() => {
                                    const invoiceTotal = selectedInvoiceForPayment.totalAmount || 0
                                    const pending = calculatePendingAmount(selectedInvoiceForPayment)
                                    const cashPayment = parseFloat(paymentFormData.amount || 0)
                                    const advanceUsed = useAdvanceBalance ? parseFloat(advanceAmountUsed || 0) : 0
                                    const totalPayment = cashPayment + advanceUsed
                                    const remaining = pending - totalPayment
                                    
                                    return (
                                        <div className={`p-4 rounded-lg border-2 ${
                                            remaining <= 0 
                                                ? 'bg-green-50 border-green-300' 
                                                : 'bg-yellow-50 border-yellow-300'
                                        }`}>
                                            <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment Summary</h3>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-600">Invoice Total:</span>
                                                    <span className="font-semibold text-gray-900">Rs. {invoiceTotal.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-600">Pending Before Payment:</span>
                                                    <span className="font-semibold text-gray-900">Rs. {pending.toLocaleString()}</span>
                                                </div>
                                                {advanceUsed > 0 && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-gray-600">From Advance:</span>
                                                        <span className="font-semibold text-green-600">- Rs. {advanceUsed.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {cashPayment > 0 && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-gray-600">Cash/Bank Payment:</span>
                                                        <span className="font-semibold text-blue-600">- Rs. {cashPayment.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                <div className="pt-2 border-t border-gray-300">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-gray-600 font-medium">
                                                            {remaining > 0 ? 'Remaining After Payment:' : 'Status:'}
                                                        </span>
                                                        <span className={`text-lg font-bold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                            {remaining > 0 ? `Rs. ${remaining.toLocaleString()}` : '✓ Fully Paid'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })()}

                                {/* Supplier Advance Balance Section */}
                                {supplierBalance && supplierBalance.availableAdvance > 0 && (
                                    <div className="p-4 bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <p className="text-xs text-gray-600 mb-1">Available Advance</p>
                                                <p className="text-xl font-bold text-green-600">
                                                    Rs. {supplierBalance.availableAdvance.toLocaleString()}
                                                </p>
                                            </div>
                                            <label className="flex items-center cursor-pointer bg-white px-3 py-2 rounded-lg border-2 border-blue-300 hover:border-blue-500 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    checked={useAdvanceBalance}
                                                    onChange={(e) => {
                                                        setUseAdvanceBalance(e.target.checked)
                                                        if (e.target.checked) {
                                                            const pending = calculatePendingAmount(selectedInvoiceForPayment)
                                                            const amountToUse = Math.min(supplierBalance.availableAdvance, pending)
                                                            setAdvanceAmountUsed(amountToUse.toString())
                                                            setPaymentFormData(prev => ({
                                                                ...prev,
                                                                amount: Math.max(0, pending - amountToUse).toString()
                                                            }))
                                                        } else {
                                                            setAdvanceAmountUsed('')
                                                            const pending = calculatePendingAmount(selectedInvoiceForPayment)
                                                            setPaymentFormData(prev => ({
                                                                ...prev,
                                                                amount: pending.toString()
                                                            }))
                                                        }
                                                    }}
                                                    className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                                />
                                                <span className="text-sm font-medium text-gray-700">Use Advance</span>
                                            </label>
                                        </div>
                                        
                                        {useAdvanceBalance && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Amount to Use (Rs.)
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    max={Math.min(supplierBalance.availableAdvance, calculatePendingAmount(selectedInvoiceForPayment))}
                                                    value={advanceAmountUsed}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value) || 0
                                                        const pending = calculatePendingAmount(selectedInvoiceForPayment)
                                                        const maxAdvance = Math.min(supplierBalance.availableAdvance, pending)
                                                        if (val >= 0 && val <= maxAdvance) {
                                                            setAdvanceAmountUsed(e.target.value)
                                                            setPaymentFormData(prev => ({
                                                                ...prev,
                                                                amount: Math.max(0, pending - val).toString()
                                                            }))
                                                        }
                                                    }}
                                                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Cash Payment Amount - Only show if not fully covered by advance */}
                                {(() => {
                                    const pending = calculatePendingAmount(selectedInvoiceForPayment)
                                    const advanceUsed = useAdvanceBalance ? parseFloat(advanceAmountUsed || 0) : 0
                                    const remaining = pending - advanceUsed
                                    
                                    if (remaining <= 0) {
                                        return (
                                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                                <p className="text-sm text-green-700">
                                                    ✓ Fully paid using advance balance. No additional payment required.
                                                </p>
                                            </div>
                                        )
                                    }
                                    
                                    return (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Cash/Bank Payment (Rs.)
                                                {remaining > 0 && <span className="text-red-500">*</span>}
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max={remaining}
                                                value={paymentFormData.amount}
                                                onChange={(e) => setPaymentFormData(prev => ({ ...prev, amount: e.target.value }))}
                                                required={remaining > 0}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                                                placeholder={`Max: Rs. ${remaining.toFixed(2)}`}
                                            />
                                        </div>
                                    )
                                })()}

                                {/* Payment Account - Only show if cash payment > 0 */}
                                {parseFloat(paymentFormData.amount || 0) > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Payment Account <span className="text-red-500">*</span>
                                        </label>
                                        <PaymentAccountSelector
                                            value={paymentFormData.paymentAccountId || ''}
                                            onChange={(value) => setPaymentFormData(prev => ({ ...prev, paymentAccountId: value }))}
                                            showQuickAdd={true}
                                            required={true}
                                        />
                                    </div>
                                )}

                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowPaymentModal(false)
                                            setSelectedInvoiceForPayment(null)
                                            setSupplierBalance(null)
                                            setUseAdvanceBalance(false)
                                            setAdvanceAmountUsed('')
                                        }}
                                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={processingPayment}
                                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                                    >
                                        {processingPayment ? 'Processing...' : 'Record Payment'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default PurchasesManagement
