import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { StatsCard } from '../ui/StatsCard'
import {
    BuildingOfficeIcon,
    CurrencyDollarIcon,
    ChartBarIcon,
    ClockIcon,
    PlusIcon,
    ArrowRightIcon,
    Squares2X2Icon,
    ListBulletIcon,
    FunnelIcon,
    PencilIcon
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

    const handleAddClick = () => {
        navigate('/business/suppliers/new')
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
                                                        <>
                                                            <p className="text-sm font-semibold text-green-600 mt-1">
                                                                Advance: Rs. {Math.abs(pending).toLocaleString()}
                                                            </p>
                                                        </>
                                                    );
                                                } else if (pending > 0) {
                                                    // Positive pending means we owe supplier
                                                    return (
                                                        <>
                                                            <p className="text-sm text-gray-500">
                                                                Balance: Rs. {pending.toLocaleString()}
                                                            </p>
                                                            <p className="text-sm font-semibold text-red-600 mt-1">
                                                                Pending: Rs. {pending.toFixed(2)}
                                                            </p>
                                                        </>
                                                    );
                                                } else {
                                                    return (
                                                        <p className="text-sm text-gray-500">
                                                            Balance: Rs. 0
                                                        </p>
                                                    );
                                                }
                                            })()}
                                        </div>

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

                                        <ArrowRightIcon className="h-5 w-5 text-gray-400" />
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

                            <div className="grid grid-cols-2 gap-4 mb-4 py-4 border-t border-b border-gray-50">
                                <div>
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">Invoices</p>
                                    <p className="font-semibold text-gray-900">{supplier._count?.purchaseInvoices || 0}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">Balance</p>
                                    {(() => {
                                        const pending = supplier.balance?.pending ?? (typeof supplier.balance === 'number' ? supplier.balance : 0);
                                        if (pending < 0) {
                                            return (
                                                <p className="font-semibold text-green-600">Rs. {Math.abs(pending).toLocaleString()}</p>
                                            );
                                        } else {
                                            return (
                                                <p className="font-semibold text-gray-900">Rs. {pending.toLocaleString()}</p>
                                            );
                                        }
                                    })()}
                                </div>
                            </div>
                            {(() => {
                                const pending = supplier.balance?.pending ?? (typeof supplier.balance === 'number' ? supplier.balance : 0);
                                if (pending < 0) {
                                    // Negative pending means supplier has advance
                                    return (
                                        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                            <p className="text-xs text-green-600 uppercase tracking-wide font-semibold mb-1">Advance Balance</p>
                                            <p className="text-lg font-bold text-green-700">Rs. {Math.abs(pending).toFixed(2)}</p>
                                        </div>
                                    );
                                } else if (pending > 0) {
                                    // Positive pending means we owe supplier
                                    return (
                                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                            <p className="text-xs text-red-600 uppercase tracking-wide font-semibold mb-1">Pending Payment</p>
                                            <p className="text-lg font-bold text-red-700">Rs. {pending.toFixed(2)}</p>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            <div className="flex justify-between items-center">
                                <span className="text-xs text-gray-500">
                                    {supplier.email || 'No email'}
                                </span>
                                <div className="flex items-center space-x-2">
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
                                    <span className="text-sm font-medium text-brand-600 group-hover:text-brand-700 flex items-center">
                                        View Details
                                        <ArrowRightIcon className="h-4 w-4 ml-1" />
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

        </div>
    )
}

export default SuppliersSection
