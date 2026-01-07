import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { StatsCard } from '../ui/StatsCard'
import PaymentAccountSelector from '../accounting/PaymentAccountSelector'
import api from '../../services/api'
import toast from 'react-hot-toast'
import {
    BuildingOfficeIcon,
    CurrencyDollarIcon,
    ChartBarIcon,
    ClockIcon,
    PlusIcon,
    Squares2X2Icon,
    ListBulletIcon,
    FunnelIcon,
    PencilIcon,
    DocumentTextIcon
} from '@heroicons/react/24/outline'

const SuppliersSection = ({
    suppliers,
    supplierStats,
    supplierLoading,
    supplierSearch,
    onSearchChange,
    onAddSupplier,
    onRefreshSuppliers,
    onSupplierClick,
    filterPendingPayments,
    onFilterChange
}) => {
    const navigate = useNavigate()
    const [displayMode, setDisplayMode] = useState('list')
    
    // Payment modal state
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [selectedSupplier, setSelectedSupplier] = useState(null)
    const [unpaidInvoices, setUnpaidInvoices] = useState([])
    const [loadingInvoices, setLoadingInvoices] = useState(false)
    const [selectedInvoices, setSelectedInvoices] = useState({}) // { invoiceId: { selected: boolean, amount: string } }
    const [paymentFormData, setPaymentFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        paymentAccountId: ''
    })
    const [processingPayment, setProcessingPayment] = useState(false)
    const [supplierBalance, setSupplierBalance] = useState(null)
    const [useAdvanceBalance, setUseAdvanceBalance] = useState(false)
    const [advanceAmountUsed, setAdvanceAmountUsed] = useState('')

    const handleAddClick = () => {
        navigate('/business/suppliers/new')
    }

    const calculatePendingAmount = (invoice) => {
        if (!invoice) return 0
        const invoicePayments = invoice.payments || []
        const paymentsTotal = invoicePayments.reduce((sum, p) => sum + p.amount, 0)
        const totalPaid = paymentsTotal > 0 ? paymentsTotal : (invoice.paymentAmount || 0)
        return Math.max(0, invoice.totalAmount - totalPaid)
    }

    const handleMakePayment = async (supplier) => {
        setSelectedSupplier(supplier)
        setPaymentFormData({
            date: new Date().toISOString().split('T')[0],
            paymentAccountId: ''
        })
        setSelectedInvoices({})
        setUseAdvanceBalance(false)
        setAdvanceAmountUsed('')
        setShowPaymentModal(true)
        setLoadingInvoices(true)

        try {
            // Fetch unpaid invoices for this supplier
            const response = await api.get(`/purchase-invoice?supplierId=${supplier.id}`)
            const invoices = response.data.purchaseInvoices || []
            
            // Filter to only unpaid invoices
            const unpaid = invoices.filter(inv => {
                const pending = calculatePendingAmount(inv)
                return pending > 0
            })
            
            setUnpaidInvoices(unpaid)
            
            // Fetch supplier balance
            try {
                const balanceResponse = await api.get(`/accounting/suppliers/${supplier.id}`)
                const balance = balanceResponse.data.supplier.balance
                const availableAdvance = balance && balance.pending < 0 ? Math.abs(balance.pending) : 0
                setSupplierBalance({ ...balance, availableAdvance })
            } catch (error) {
                console.error('Failed to fetch supplier balance:', error)
                setSupplierBalance(null)
            }
        } catch (error) {
            console.error('Failed to fetch invoices:', error)
            toast.error('Failed to fetch unpaid invoices')
        } finally {
            setLoadingInvoices(false)
        }
    }

    const handleInvoiceToggle = (invoice) => {
        const pending = calculatePendingAmount(invoice)
        setSelectedInvoices(prev => {
            const isSelected = prev[invoice.id]?.selected || false
            if (isSelected) {
                // Deselect
                const newState = { ...prev }
                delete newState[invoice.id]
                return newState
            } else {
                // Select with pending amount as default
                return {
                    ...prev,
                    [invoice.id]: {
                        selected: true,
                        amount: pending.toString()
                    }
                }
            }
        })
    }

    const handleInvoiceAmountChange = (invoiceId, amount) => {
        setSelectedInvoices(prev => ({
            ...prev,
            [invoiceId]: {
                ...prev[invoiceId],
                amount
            }
        }))
    }

    const handlePaymentSubmit = async (e) => {
        e.preventDefault()
        
        if (!selectedSupplier) {
            toast.error('Supplier information not available')
            return
        }

        const selectedInvoiceIds = Object.keys(selectedInvoices).filter(id => selectedInvoices[id].selected)
        if (selectedInvoiceIds.length === 0) {
            toast.error('Please select at least one invoice to pay')
            return
        }

        // Validate and calculate total payment amounts
        let totalCashPayment = 0
        const invoicePayments = {}
        
        for (const invoiceId of selectedInvoiceIds) {
            const invoice = unpaidInvoices.find(inv => inv.id === invoiceId)
            if (!invoice) {
                toast.error(`Invoice not found`)
                return
            }
            
            const pending = calculatePendingAmount(invoice)
            const paymentAmount = parseFloat(selectedInvoices[invoiceId].amount || 0)
            
            if (paymentAmount <= 0) {
                toast.error(`Payment amount for ${invoice.invoiceNumber} must be greater than 0`)
                return
            }
            
            if (paymentAmount > pending) {
                toast.error(`Payment amount for ${invoice.invoiceNumber} (Rs. ${paymentAmount.toFixed(2)}) cannot exceed pending amount (Rs. ${pending.toFixed(2)})`)
                return
            }
            
            invoicePayments[invoiceId] = paymentAmount
            totalCashPayment += paymentAmount
        }

        const advanceUsed = useAdvanceBalance ? parseFloat(advanceAmountUsed || 0) : 0
        const totalPayment = totalCashPayment + advanceUsed

        if (totalPayment <= 0) {
            toast.error('Please enter a valid payment amount')
            return
        }

        // Validate payment account if cash payment > 0
        if (totalCashPayment > 0 && !paymentFormData.paymentAccountId) {
            toast.error('Please select a payment account')
            return
        }

        setProcessingPayment(true)
        try {
            // Create payment for each selected invoice
            const paymentPromises = selectedInvoiceIds.map(async (invoiceId) => {
                const invoice = unpaidInvoices.find(inv => inv.id === invoiceId)
                const paymentAmount = invoicePayments[invoiceId]
                
                // Calculate how much of this invoice payment comes from advance vs cash
                let cashAmount = paymentAmount
                let advanceAmount = 0
                
                if (useAdvanceBalance && advanceUsed > 0) {
                    // Distribute advance proportionally across invoices
                    const totalPending = selectedInvoiceIds.reduce((sum, id) => {
                        const inv = unpaidInvoices.find(i => i.id === id)
                        return sum + calculatePendingAmount(inv)
                    }, 0)
                    
                    const invoicePending = calculatePendingAmount(invoice)
                    const invoiceAdvanceShare = (invoicePending / totalPending) * advanceUsed
                    const invoiceAdvanceUsed = Math.min(invoiceAdvanceShare, paymentAmount)
                    
                    advanceAmount = invoiceAdvanceUsed
                    cashAmount = paymentAmount - invoiceAdvanceUsed
                }
                
                const payload = {
                    date: paymentFormData.date,
                    type: 'SUPPLIER_PAYMENT',
                    amount: cashAmount, // Only cash/bank payment amount
                    paymentAccountId: cashAmount > 0 ? paymentFormData.paymentAccountId : null,
                    supplierId: selectedSupplier.id,
                    purchaseInvoiceId: invoiceId,
                    useAdvanceBalance: useAdvanceBalance && advanceAmount > 0,
                    advanceAmountUsed: advanceAmount > 0 ? advanceAmount : undefined
                }

                return api.post('/accounting/payments', payload)
            })

            await Promise.all(paymentPromises)
            
            toast.success('Payments recorded successfully')
            setShowPaymentModal(false)
            setSelectedSupplier(null)
            setUnpaidInvoices([])
            setSelectedInvoices({})
            setSupplierBalance(null)
            setUseAdvanceBalance(false)
            setAdvanceAmountUsed('')
            
            // Refresh suppliers to get updated balance
            if (onRefreshSuppliers) {
                onRefreshSuppliers()
            }
        } catch (error) {
            console.error('Error recording payment:', error)
            const errorMessage = error.response?.data?.error?.message || 'Failed to record payment'
            toast.error(errorMessage)
        } finally {
            setProcessingPayment(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Supplier Stats */}
            {supplierStats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <StatsCard
                        title="Total Suppliers"
                        value={supplierStats.totalSuppliers}
                        icon={BuildingOfficeIcon}
                    />
                    <StatsCard
                        title="Total Purchases"
                        value={`Rs. ${supplierStats.totalPurchases?.toLocaleString() || 0}`}
                        icon={CurrencyDollarIcon}
                    />
                    {(() => {
                        const totalPending = supplierStats.totalPending || 0;
                        const isAdvance = totalPending < 0;
                        return (
                            <StatsCard
                                title={isAdvance ? "Advance Balance" : "Total Pending"}
                                value={isAdvance 
                                    ? `Rs. ${Math.abs(totalPending).toLocaleString()}` 
                                    : `Rs. ${totalPending.toLocaleString()}`
                                }
                                icon={ChartBarIcon}
                                className={isAdvance ? "border-green-200" : ""}
                                iconClassName={isAdvance ? "bg-green-100 text-green-600" : "bg-pink-100 text-pink-600"}
                                valueClassName={isAdvance ? "text-green-600" : "text-gray-900"}
                            />
                        );
                    })()}
                    <StatsCard
                        title="With Pending"
                        value={supplierStats.suppliersWithPending}
                        icon={ClockIcon}
                    />
                </div>
            )}

            {/* Search and Filters */}
            <Card>
                <CardContent>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <Input
                                type="text"
                                placeholder="Search suppliers by name, contact, email, or phone..."
                                value={supplierSearch}
                                onChange={(e) => onSearchChange(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-3">
                            {/* Pending Payments Filter */}
                            <button
                                onClick={() => onFilterChange && onFilterChange(!filterPendingPayments)}
                                className={`flex items-center px-4 py-2 rounded-lg transition-colors text-sm font-medium ${filterPendingPayments
                                    ? 'bg-red-600 text-white hover:bg-red-700'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                <FunnelIcon className="h-4 w-4 mr-2" />
                                {filterPendingPayments ? 'Pending Payments' : 'All Suppliers'}
                            </button>
                            <Button
                                onClick={handleAddClick}
                                variant="success"
                                className="flex items-center"
                            >
                                <PlusIcon className="h-4 w-4 mr-2" />
                                Add Supplier
                            </Button>
                            <Button
                                onClick={onRefreshSuppliers}
                                variant="primary"
                            >
                                Refresh
                            </Button>
                            <div className="flex space-x-1 border-l border-gray-200 pl-3 ml-1">
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
                </CardContent>
            </Card>

            {/* Supplier List/Grid */}
            {supplierLoading ? (
                <div className="p-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">Loading suppliers...</p>
                </div>
            ) : suppliers.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-xl border border-gray-200">
                    <BuildingOfficeIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No suppliers found</p>
                </div>
            ) : displayMode === 'list' ? (
                <Card>
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900">Suppliers</h3>
                    </div>
                    <div className="divide-y divide-gray-200">
                        {suppliers.map((supplier) => (
                            <div
                                key={supplier.id}
                                onClick={() => onSupplierClick(supplier)}
                                className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-3">
                                            <div className="flex-shrink-0">
                                                <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                                                    <span className="text-blue-600 font-semibold text-sm">
                                                        {supplier.name ? supplier.name.charAt(0).toUpperCase() : 'S'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                    {supplier.name || 'Unknown Supplier'}
                                                </p>
                                                <p className="text-sm text-gray-500 truncate">
                                                    {supplier.contact || supplier.phone || 'No contact'}
                                                </p>
                                                {supplier.email && (
                                                    <p className="text-sm text-gray-500 truncate">
                                                        {supplier.email}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-4">
                                        <div className="text-right">
                                            <p className="text-sm font-medium text-gray-900">
                                                {supplier._count?.purchaseInvoices || 0} invoices
                                            </p>
                                            {(() => {
                                                const pending = supplier.balance?.pending ?? (typeof supplier.balance === 'number' ? supplier.balance : 0);
                                                if (pending < 0) {
                                                    // Negative pending means supplier has advance
                                                    return (
                                                        <p className="text-sm font-semibold text-green-600 mt-1">
                                                            Advance: Rs. {Math.abs(pending).toLocaleString()}
                                                        </p>
                                                    );
                                                } else if (pending > 0) {
                                                    // Positive pending means we owe supplier
                                                    return (
                                                        <p className="text-sm font-semibold text-red-600 mt-1">
                                                            Pending: Rs. {pending.toLocaleString()}
                                                        </p>
                                                    );
                                                } else {
                                                    return (
                                                        <p className="text-sm text-gray-500 mt-1">
                                                            Balance: Rs. 0
                                                        </p>
                                                    );
                                                }
                                            })()}
                                        </div>

                                        {(() => {
                                            const pending = supplier.balance?.pending ?? (typeof supplier.balance === 'number' ? supplier.balance : 0);
                                            return pending > 0 ? (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleMakePayment(supplier)
                                                    }}
                                                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs font-semibold flex items-center min-h-[32px]"
                                                    title="Make Payment"
                                                >
                                                    <CurrencyDollarIcon className="h-3 w-3 mr-1" />
                                                    Pay
                                                </button>
                                            ) : null
                                        })()}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                navigate(`/business/suppliers/${supplier.id}/ledger`)
                                            }}
                                            className="p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-lg transition-colors"
                                            title="View Ledger"
                                        >
                                            <DocumentTextIcon className="h-5 w-5" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                navigate(`/business/suppliers/${supplier.id}/edit`)
                                            }}
                                            className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Edit Supplier"
                                        >
                                            <PencilIcon className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {suppliers.map((supplier) => (
                        <div
                            key={supplier.id}
                            className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 p-6 cursor-pointer"
                            onClick={() => onSupplierClick(supplier)}
                        >
                            <div className="flex items-center space-x-4 mb-4">
                                <div className="h-12 w-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
                                    {supplier.name ? supplier.name.charAt(0).toUpperCase() : 'S'}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">{supplier.name || 'Unknown'}</h3>
                                    <p className="text-sm text-gray-500">{supplier.contact || supplier.phone || 'No contact'}</p>
                                </div>
                            </div>

                            <div className="mb-4 py-4 border-t border-b border-gray-50">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase tracking-wide">Invoices</p>
                                        <p className="font-semibold text-gray-900 mt-1">{supplier._count?.purchaseInvoices || 0}</p>
                                    </div>
                                </div>
                            </div>
                            {(() => {
                                const pending = supplier.balance?.pending ?? (typeof supplier.balance === 'number' ? supplier.balance : 0);
                                if (pending < 0) {
                                    // Negative pending means supplier has advance
                                    return (
                                        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                            <p className="text-xs text-green-600 uppercase tracking-wide font-semibold mb-1">Advance Balance</p>
                                            <p className="text-lg font-bold text-green-700">Rs. {Math.abs(pending).toLocaleString()}</p>
                                        </div>
                                    );
                                } else if (pending > 0) {
                                    // Positive pending means we owe supplier
                                    return (
                                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                            <p className="text-xs text-red-600 uppercase tracking-wide font-semibold mb-1">Pending Payment</p>
                                            <p className="text-lg font-bold text-red-700">Rs. {pending.toLocaleString()}</p>
                                        </div>
                                    );
                                } else {
                                    return (
                                        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                            <p className="text-xs text-gray-600 uppercase tracking-wide font-semibold mb-1">Balance</p>
                                            <p className="text-lg font-bold text-gray-700">Rs. 0</p>
                                        </div>
                                    );
                                }
                            })()}

                            <div className="flex flex-col gap-3">
                                {(() => {
                                    const pending = supplier.balance?.pending ?? (typeof supplier.balance === 'number' ? supplier.balance : 0);
                                    return pending > 0 ? (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleMakePayment(supplier)
                                            }}
                                            className="w-full flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold min-h-[44px]"
                                        >
                                            <CurrencyDollarIcon className="h-4 w-4 mr-1" />
                                            Make Payment
                                        </button>
                                    ) : null
                                })()}
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-gray-500">
                                        {supplier.email || 'No email'}
                                    </span>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                navigate(`/business/suppliers/${supplier.id}/ledger`)
                                            }}
                                            className="p-2 text-green-600 hover:text-green-900 hover:bg-green-50 rounded-lg transition-colors"
                                            title="View Ledger"
                                        >
                                            <DocumentTextIcon className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                navigate(`/business/suppliers/${supplier.id}/edit`)
                                            }}
                                            className="p-2 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="Edit Supplier"
                                        >
                                            <PencilIcon className="h-4 w-4" />
                                        </button>
                                        <span className="text-sm font-medium text-brand-600 group-hover:text-brand-700">
                                            View Details
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Payment Modal */}
            {showPaymentModal && selectedSupplier && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-gray-900">Make Payment - {selectedSupplier.name}</h2>
                                <button
                                    onClick={() => {
                                        setShowPaymentModal(false)
                                        setSelectedSupplier(null)
                                        setUnpaidInvoices([])
                                        setSelectedInvoices({})
                                    }}
                                    className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                >
                                    ✕
                                </button>
                            </div>

                            <form onSubmit={handlePaymentSubmit} className="space-y-4">
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

                                {/* Unpaid Invoices Selection */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Select Unpaid Invoices <span className="text-red-500">*</span>
                                    </label>
                                    {loadingInvoices ? (
                                        <div className="p-4 text-center">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                                            <p className="mt-2 text-sm text-gray-600">Loading invoices...</p>
                                        </div>
                                    ) : unpaidInvoices.length === 0 ? (
                                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
                                            <p className="text-sm text-gray-600">No unpaid invoices found for this supplier</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3">
                                            {unpaidInvoices.map((invoice) => {
                                                const pending = calculatePendingAmount(invoice)
                                                const isSelected = selectedInvoices[invoice.id]?.selected || false
                                                const paymentAmount = parseFloat(selectedInvoices[invoice.id]?.amount || 0)
                                                
                                                return (
                                                    <div
                                                        key={invoice.id}
                                                        className={`p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                                                            isSelected
                                                                ? 'border-blue-500 bg-blue-50'
                                                                : 'border-gray-200 hover:border-gray-300'
                                                        }`}
                                                        onClick={() => handleInvoiceToggle(invoice)}
                                                    >
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex-1">
                                                                <div className="flex items-center space-x-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => handleInvoiceToggle(invoice)}
                                                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                                                    />
                                                                    <div>
                                                                        <p className="font-medium text-gray-900">{invoice.invoiceNumber}</p>
                                                                        <p className="text-xs text-gray-500">
                                                                            Total: Rs. {invoice.totalAmount.toLocaleString()} | 
                                                                            Pending: Rs. {pending.toLocaleString()}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {isSelected && (
                                                                    <div className="mt-2 ml-6">
                                                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                                                            Payment Amount (Rs.)
                                                                        </label>
                                                                        <input
                                                                            type="number"
                                                                            step="0.01"
                                                                            min="0"
                                                                            max={pending}
                                                                            value={selectedInvoices[invoice.id]?.amount || ''}
                                                                            onChange={(e) => handleInvoiceAmountChange(invoice.id, e.target.value)}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                                            placeholder={`Max: Rs. ${pending.toFixed(2)}`}
                                                                        />
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

                                {/* Payment Summary */}
                                {(() => {
                                    const selectedInvoiceIds = Object.keys(selectedInvoices).filter(id => selectedInvoices[id].selected)
                                    if (selectedInvoiceIds.length === 0) return null
                                    
                                    let totalCashPayment = 0
                                    selectedInvoiceIds.forEach(invoiceId => {
                                        const amount = parseFloat(selectedInvoices[invoiceId].amount || 0)
                                        totalCashPayment += amount
                                    })
                                    
                                    const advanceUsed = useAdvanceBalance ? parseFloat(advanceAmountUsed || 0) : 0
                                    const totalPayment = totalCashPayment + advanceUsed
                                    
                                    return (
                                        <div className="p-4 rounded-lg border-2 bg-yellow-50 border-yellow-300">
                                            <h3 className="text-sm font-semibold text-gray-900 mb-3">Payment Summary</h3>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-gray-600">Total Cash/Bank Payment:</span>
                                                    <span className="font-semibold text-gray-900">Rs. {totalCashPayment.toLocaleString()}</span>
                                                </div>
                                                {advanceUsed > 0 && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-gray-600">From Advance:</span>
                                                        <span className="font-semibold text-green-600">- Rs. {advanceUsed.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                <div className="pt-2 border-t border-gray-300">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-gray-600 font-medium">Total Payment:</span>
                                                        <span className="text-lg font-bold text-blue-600">Rs. {totalPayment.toLocaleString()}</span>
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
                                                        if (!e.target.checked) {
                                                            setAdvanceAmountUsed('')
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
                                                    max={supplierBalance.availableAdvance}
                                                    value={advanceAmountUsed}
                                                    onChange={(e) => setAdvanceAmountUsed(e.target.value)}
                                                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Payment Account */}
                                {(() => {
                                    const selectedInvoiceIds = Object.keys(selectedInvoices).filter(id => selectedInvoices[id].selected)
                                    let totalCashPayment = 0
                                    selectedInvoiceIds.forEach(invoiceId => {
                                        const amount = parseFloat(selectedInvoices[invoiceId].amount || 0)
                                        totalCashPayment += amount
                                    })
                                    
                                    if (totalCashPayment <= 0) return null
                                    
                                    return (
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
                                    )
                                })()}

                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowPaymentModal(false)
                                            setSelectedSupplier(null)
                                            setUnpaidInvoices([])
                                            setSelectedInvoices({})
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
                                        disabled={processingPayment || Object.keys(selectedInvoices).filter(id => selectedInvoices[id].selected).length === 0}
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

export default SuppliersSection
