import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import toast from 'react-hot-toast'
import ModernLayout from '../components/ModernLayout'

const EditSupplierPage = () => {
    const navigate = useNavigate()
    const { supplierId } = useParams()
    const [formData, setFormData] = useState({
        name: '',
        contact: '',
        email: '',
        phone: '',
        address: '',
        balance: '0',
        balanceType: 'we_owe', // 'we_owe' or 'they_owe'
        openingBalanceDate: new Date().toISOString().split('T')[0] // Default to today
    })
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(true)
    const [errors, setErrors] = useState({})

            useEffect(() => {
        const fetchSupplier = async () => {
            try {
                setFetching(true)
                const response = await api.get(`/accounting/suppliers/${supplierId}`)
                const supplier = response.data.supplier
                
                // Get opening balance from calculated balance or raw balance field
                // The calculated balance object has openingBalance, or use raw balance field
                let openingBalance = 0
                if (supplier.balance && typeof supplier.balance === 'object' && supplier.balance.openingBalance !== undefined) {
                    // Use opening balance from calculated balance
                    openingBalance = supplier.balance.openingBalance || 0
                } else if (typeof supplier.balance === 'number') {
                    // Use raw balance field (for backward compatibility)
                    openingBalance = supplier.balance
                } else {
                    // Fallback: try to get from supplier directly
                    openingBalance = supplier.balance || 0
                }
                
                // Determine balance type based on opening balance value
                const balanceType = openingBalance < 0 ? 'they_owe' : 'we_owe'
                const balanceAmount = Math.abs(openingBalance)

                // Get opening balance date from supplier (if stored) or use today as default
                // Note: We'll need to fetch this from the first opening balance transaction if available
                const openingBalanceDate = new Date().toISOString().split('T')[0] // Default to today, can be improved later

                setFormData({
                    name: supplier.name || '',
                    contact: supplier.contact || '',
                    email: supplier.email || '',
                    phone: supplier.phone || '',
                    address: supplier.address || '',
                    balance: balanceAmount.toString(),
                    balanceType,
                    openingBalanceDate
                })
            } catch (error) {
                console.error('Failed to fetch supplier:', error)
                toast.error('Failed to load supplier details')
                navigate('/business/suppliers')
            } finally {
                setFetching(false)
            }
        }

        if (supplierId) {
            fetchSupplier()
        }
    }, [supplierId, navigate])

    const handleInputChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({
            ...prev,
            [name]: value
        }))
        // Clear error when user starts typing
        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: ''
            }))
        }
    }

    const validateForm = () => {
        const newErrors = {}

        if (!formData.name.trim()) {
            newErrors.name = 'Name is required'
        } else if (formData.name.trim().length < 2) {
            newErrors.name = 'Name must be at least 2 characters'
        }

        if (formData.email && formData.email.trim() && !/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Please enter a valid email address'
        }

        if (formData.balance && isNaN(parseFloat(formData.balance))) {
            newErrors.balance = 'Balance must be a valid number'
        }

        if (formData.balance && parseFloat(formData.balance) > 0 && !formData.openingBalanceDate) {
            newErrors.openingBalanceDate = 'Opening balance date is required when balance is set'
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!validateForm()) {
            return
        }

        try {
            setLoading(true)

            // Calculate the actual balance value based on type
            const balanceAmount = parseFloat(formData.balance) || 0
            const actualBalance = formData.balanceType === 'they_owe'
                ? -balanceAmount  // Negative if supplier owes us (they paid advance)
                : balanceAmount   // Positive if we owe supplier

            const payload = {
                name: formData.name.trim(),
                contact: formData.contact?.trim() || null,
                email: formData.email?.trim() || null,
                phone: formData.phone?.trim() || null,
                address: formData.address?.trim() || null,
                balance: actualBalance,
                openingBalanceDate: formData.openingBalanceDate || null
            }

            await api.put(`/accounting/suppliers/${supplierId}`, payload)
            toast.success('Supplier updated successfully!')
            navigate('/business/suppliers')
        } catch (error) {
            console.error('Failed to update supplier:', error)
            if (error.response?.data?.details) {
                const validationErrors = {}
                error.response.data.details.forEach(detail => {
                    validationErrors[detail.path] = detail.msg
                })
                setErrors(validationErrors)
            } else {
                const errorMsg = typeof error.response?.data?.error === 'string'
                    ? error.response?.data?.error
                    : error.response?.data?.error?.message || 'Failed to update supplier'
                toast.error(errorMsg)
            }
        } finally {
            setLoading(false)
        }
    }

    if (fetching) {
        return (
            <ModernLayout>
                <div className="flex items-center justify-center min-h-screen">
                    <LoadingSpinner />
                </div>
            </ModernLayout>
        )
    }

    return (
        <ModernLayout>
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate('/business/suppliers')}
                        className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <ArrowLeftIcon className="h-6 w-6" />
                    </button>
                    <div className="flex items-center">
                        <div className="p-2 bg-blue-100 rounded-lg mr-3">
                            <BuildingOfficeIcon className="h-6 w-6 text-blue-600" />
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Edit Supplier</h1>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Information */}
                    <div className="card p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                                    Supplier Name *
                                </label>
                                <input
                                    type="text"
                                    id="name"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.name ? 'border-red-300' : 'border-gray-300'
                                        }`}
                                    placeholder="Enter supplier name"
                                />
                                {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                            </div>

                            <div>
                                <label htmlFor="contact" className="block text-sm font-medium text-gray-700 mb-1">
                                    Contact Person
                                </label>
                                <input
                                    type="text"
                                    id="contact"
                                    name="contact"
                                    value={formData.contact}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Enter contact person name"
                                />
                            </div>

                            <div>
                                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                                    Phone Number
                                </label>
                                <input
                                    type="tel"
                                    id="phone"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Enter phone number"
                                />
                            </div>

                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    id="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.email ? 'border-red-300' : 'border-gray-300'
                                        }`}
                                    placeholder="Enter email address"
                                />
                                {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
                            </div>
                        </div>
                    </div>

                    {/* Address Information */}
                    <div className="card p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Address Information</h3>
                        <div>
                            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                                Address
                            </label>
                            <textarea
                                id="address"
                                name="address"
                                value={formData.address}
                                onChange={handleInputChange}
                                rows={2}
                                className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter supplier address"
                            />
                        </div>
                    </div>

                    {/* Financial Information */}
                    <div className="card p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Financial Information</h3>

                        {/* Balance Type Selector */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                                Balance Type
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className={`relative flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${formData.balanceType === 'we_owe'
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-300 hover:border-gray-400'
                                    }`}>
                                    <input
                                        type="radio"
                                        name="balanceType"
                                        value="we_owe"
                                        checked={formData.balanceType === 'we_owe'}
                                        onChange={handleInputChange}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div className="ml-3">
                                        <span className="block text-sm font-medium text-gray-900">
                                            We Owe Supplier
                                        </span>
                                        <span className="block text-xs text-gray-500">
                                            (Accounts Payable - We need to pay them)
                                        </span>
                                    </div>
                                </label>

                                <label className={`relative flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${formData.balanceType === 'they_owe'
                                        ? 'border-green-500 bg-green-50'
                                        : 'border-gray-300 hover:border-gray-400'
                                    }`}>
                                    <input
                                        type="radio"
                                        name="balanceType"
                                        value="they_owe"
                                        checked={formData.balanceType === 'they_owe'}
                                        onChange={handleInputChange}
                                        className="h-4 w-4 text-green-600 focus:ring-green-500"
                                    />
                                    <div className="ml-3">
                                        <span className="block text-sm font-medium text-gray-900">
                                            Supplier Owes Us
                                        </span>
                                        <span className="block text-xs text-gray-500">
                                            (We paid them advance or returned products)
                                        </span>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* Balance Amount */}
                        <div>
                            <label htmlFor="balance" className="block text-sm font-medium text-gray-700 mb-1">
                                Opening Balance Amount (Rs.)
                            </label>
                            <input
                                type="number"
                                id="balance"
                                name="balance"
                                value={formData.balance}
                                onChange={handleInputChange}
                                step="0.01"
                                min="0"
                                className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.balance ? 'border-red-300' : 'border-gray-300'
                                    }`}
                                placeholder="0.00"
                            />
                            {errors.balance && <p className="mt-1 text-sm text-red-600">{errors.balance}</p>}

                            {/* Dynamic helper text based on balance type */}
                            <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
                                <p className="text-sm text-gray-700">
                                    {formData.balanceType === 'we_owe' ? (
                                        <>
                                            <span className="font-semibold text-blue-600">We Owe: </span>
                                            Enter the amount you need to pay to this supplier for previous purchases
                                        </>
                                    ) : (
                                        <>
                                            <span className="font-semibold text-green-600">Supplier Owes Us: </span>
                                            Enter the amount you paid to supplier as advance or value of products you returned to them (they will adjust in next purchase)
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Opening Balance Date */}
                        {formData.balance && parseFloat(formData.balance) > 0 && (
                            <div className="mt-4">
                                <label htmlFor="openingBalanceDate" className="block text-sm font-medium text-gray-700 mb-1">
                                    Opening Balance Date *
                                </label>
                                <input
                                    type="date"
                                    id="openingBalanceDate"
                                    name="openingBalanceDate"
                                    value={formData.openingBalanceDate}
                                    onChange={handleInputChange}
                                    className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.openingBalanceDate ? 'border-red-300' : 'border-gray-300'
                                        }`}
                                />
                                {errors.openingBalanceDate && <p className="mt-1 text-sm text-red-600">{errors.openingBalanceDate}</p>}
                                <p className="mt-1 text-xs text-gray-500">
                                    Select the date when this opening balance was established
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={() => navigate('/business/suppliers')}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                        >
                            {loading ? (
                                <>
                                    <LoadingSpinner size="sm" />
                                    <span className="ml-2">Updating...</span>
                                </>
                            ) : (
                                'Update Supplier'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </ModernLayout>
    )
}

export default EditSupplierPage

