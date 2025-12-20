import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    Squares2X2Icon,
    ShoppingBagIcon,
    UsersIcon,
    TagIcon,
    CurrencyDollarIcon,
    TruckIcon,
    PlusIcon,
    ArrowLeftOnRectangleIcon,
    DocumentTextIcon,
    XMarkIcon,
    ChartBarIcon,
    CogIcon
} from '@heroicons/react/24/outline';

const Sidebar = ({ onNewOrder, onLogout, isOpen, onClose }) => {
    const menuItems = [
        { name: 'Dashboard', icon: Squares2X2Icon, path: '/business' },
        { name: 'Orders', icon: ShoppingBagIcon, path: '/business/orders' },
        { name: 'Customers', icon: UsersIcon, path: '/business/customers' },
        { name: 'Order Forms', icon: DocumentTextIcon, path: '/business/forms' },
        { name: 'Reports', icon: ChartBarIcon, path: '/business/reports' },
        { name: 'Settings', icon: CogIcon, path: '/business/settings' },
    ];

    const inventoryItems = [
        { name: 'Products', icon: TagIcon, path: '/business/products' },
        { name: 'Purchases', icon: CurrencyDollarIcon, path: '/business/purchases' },
        { name: 'Returns', icon: ArrowLeftOnRectangleIcon, path: '/business/returns' },
        { name: 'Vendors', icon: TruckIcon, path: '/business/vendors' },
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
                {/* Brand */}
                <div className="p-6 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-brand-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/30 text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436h.004c-1.228.954-2.642 1.642-4.165 1.981a.75.75 0 01-.848-.917c.145-.74.582-1.443 1.154-1.92.473-.394.98-.703 1.502-.92a17.92 17.92 0 00-1.513-1.514c-.218.522-.526 1.03-.92 1.502-.477.572-1.18 1.01-1.92 1.154a.75.75 0 01-.916-.848c.338-1.524 1.026-2.939 1.98-4.165A13.028 13.028 0 019.315 7.584zM8.824 3.147a.75.75 0 00-1.06-1.06l-1.59 1.59a.75.75 0 000 1.061l1.59 1.59a.75.75 0 001.06-1.06l-.53-.53h2.65a.75.75 0 000-1.5h-2.65l.53-.53z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="font-bold text-gray-900 text-lg leading-tight">Dress Shop</h1>
                            <p className="text-xs text-gray-500 font-medium">Order Management</p>
                        </div>
                    </div>

                    {/* Close button for mobile */}
                    <button
                        onClick={onClose}
                        className="lg:hidden p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Menu */}
                <div className="flex-1 px-4 py-2 overflow-y-auto h-[calc(100vh-180px)]">
                    <div className="mb-8">
                        <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Menu</p>
                        <div className="space-y-1">
                            {menuItems.map((item) => (
                                <NavItem key={item.name} item={item} />
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Inventory</p>
                        <div className="space-y-1">
                            {inventoryItems.map((item) => (
                                <NavItem key={item.name} item={item} />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Bottom Actions */}
                <div className="absolute bottom-0 left-0 w-full p-4 border-t border-gray-100 bg-white space-y-3">
                    <button
                        onClick={() => {
                            onNewOrder();
                            onClose();
                        }}
                        className="w-full bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-brand-500/30 flex items-center justify-center space-x-2 transition-all duration-200 hover:-translate-y-0.5"
                    >
                        <PlusIcon className="w-5 h-5" />
                        <span>New Order</span>
                    </button>

                    <button
                        onClick={onLogout}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                    >
                        <ArrowLeftOnRectangleIcon className="w-5 h-5" />
                        <span>Logout</span>
                    </button>
                </div>
            </div>
        </>
    );
};

export default Sidebar;
