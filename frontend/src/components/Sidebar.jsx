import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    Squares2X2Icon,
    ShoppingBagIcon,
    UsersIcon,
    BuildingOfficeIcon,
    TagIcon,
    CurrencyDollarIcon,
    TruckIcon,
    ArrowLeftOnRectangleIcon,
    DocumentTextIcon,
    XMarkIcon,
    ChartBarIcon,
    CogIcon,
    CalculatorIcon,
    ArrowPathIcon,
    UserCircleIcon
} from '@heroicons/react/24/outline';

const Sidebar = ({ onLogout, isOpen, onClose }) => {
    const { user } = useAuth();
    // Main Menu - Core Operations (most frequently used)
    const menuItems = [
        { name: 'Dashboard', icon: Squares2X2Icon, path: '/business' },
        { name: 'Orders', icon: ShoppingBagIcon, path: '/business/orders' },
        { name: 'Order Returns', icon: ArrowPathIcon, path: '/business/accounting/returns' },
        { name: 'Customers', icon: UsersIcon, path: '/business/customers' },
        { name: 'Reports', icon: ChartBarIcon, path: '/business/reports' },
    ];

    // Inventory & Procurement
    const inventoryItems = [
        { name: 'Products', icon: TagIcon, path: '/business/products' },
        { name: 'Purchases', icon: CurrencyDollarIcon, path: '/business/purchases' },
        { name: 'Suppliers', icon: BuildingOfficeIcon, path: '/business/suppliers' },
        { name: 'Supplier Returns', icon: ArrowLeftOnRectangleIcon, path: '/business/returns' },
        { name: 'Vendors', icon: TruckIcon, path: '/business/vendors' },
    ];

    // Configuration & Setup
    const configItems = [
        { name: 'Order Forms', icon: DocumentTextIcon, path: '/business/forms' },
        { name: 'Accounting', icon: CalculatorIcon, path: '/business/accounting' },
        { name: 'Settings', icon: CogIcon, path: '/business/settings' },
    ];

    const NavItem = ({ item }) => (
        <NavLink
            to={item.path}
            end={item.path === '/business'}
            onClick={onClose} // Close sidebar on mobile when link is clicked
            className={({ isActive }) =>
                `flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                    ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/30'
                    : 'text-gray-500 hover:bg-brand-50 hover:text-brand-600'
                }`
            }
        >
            {({ isActive }) => (
                <>
                    <item.icon
                        className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-brand-500'
                            }`}
                    />
                    <span className="font-medium">{item.name}</span>
                </>
            )}
        </NavLink>
    );

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-gray-900/50 z-30 lg:hidden backdrop-blur-sm transition-opacity"
                    onClick={onClose}
                />
            )}

            {/* Sidebar Container */}
            <div className={`
                fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 z-40 transform transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none
                ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                {/* Business Name and User Info */}
                <div className="p-6 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/30 text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                    <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436h.004c-1.228.954-2.642 1.642-4.165 1.981a.75.75 0 01-.848-.917c.145-.74.582-1.443 1.154-1.92.473-.394.98-.703 1.502-.92a17.92 17.92 0 00-1.513-1.514c-.218.522-.526 1.03-.92 1.502-.477.572-1.18 1.01-1.92 1.154a.75.75 0 01-.916-.848c.338-1.524 1.026-2.939 1.98-4.165A13.028 13.028 0 019.315 7.584zM8.824 3.147a.75.75 0 00-1.06-1.06l-1.59 1.59a.75.75 0 000 1.061l1.59 1.59a.75.75 0 001.06-1.06l-.53-.53h2.65a.75.75 0 000-1.5h-2.65l.53-.53z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h1 className="font-bold text-gray-900 text-lg leading-tight truncate">
                                    {user?.tenant?.businessName || 'Business'}
                                </h1>
                                <p className="text-xs text-gray-500 font-medium">Order Management</p>
                            </div>
                        </div>

                        {/* Close button for mobile */}
                        <button
                            onClick={onClose}
                            className="lg:hidden p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 flex-shrink-0"
                        >
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Logged in User */}
                    <div className="flex items-center justify-between px-2 py-2 bg-gray-50 rounded-lg">
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                            <UserCircleIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                    {user?.name || 'User'}
                                </p>
                                <p className="text-xs text-gray-500 truncate">
                                    {user?.email || ''}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onLogout}
                            className="ml-2 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200 flex-shrink-0"
                            title="Logout"
                        >
                            <ArrowLeftOnRectangleIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Menu */}
                <div className="flex-1 px-4 py-2 overflow-y-auto h-[calc(100vh-200px)]">
                    {/* Main Menu - Core Operations */}
                    <div className="mb-8">
                        <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Menu</p>
                        <div className="space-y-1">
                            {menuItems.map((item) => (
                                <NavItem key={item.name} item={item} />
                            ))}
                        </div>
                    </div>

                    {/* Inventory & Procurement */}
                    <div className="mb-8">
                        <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Inventory & Procurement</p>
                        <div className="space-y-1">
                            {inventoryItems.map((item) => (
                                <NavItem key={item.name} item={item} />
                            ))}
                        </div>
                    </div>

                    {/* Configuration & Setup */}
                    <div>
                        <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Configuration</p>
                        <div className="space-y-1">
                            {configItems.map((item) => (
                                <NavItem key={item.name} item={item} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Sidebar;
