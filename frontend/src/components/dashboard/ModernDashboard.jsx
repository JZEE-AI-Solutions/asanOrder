import React from 'react';
import {
    ShoppingBagIcon,
    CurrencyDollarIcon,
    ClockIcon,
    CheckCircleIcon,
    EyeIcon
} from '@heroicons/react/24/outline';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';

const ModernDashboard = ({
    stats,
    recentOrders,
    onViewOrder,
    onViewAllOrders,
    getStatusIcon
}) => {

    const statCards = [
        {
            title: 'Total Orders',
            value: stats?.stats?.totalOrders || 0,
            icon: ShoppingBagIcon,
            color: 'bg-pink-500',
            textColor: 'text-pink-500'
        },
        {
            title: 'Total Revenue',
            value: `Rs. ${stats?.stats?.totalRevenue?.toLocaleString() || '0'}`,
            icon: CurrencyDollarIcon,
            color: 'bg-purple-600',
            textColor: 'text-purple-600'
        },
        {
            title: 'Pending Orders',
            value: stats?.stats?.pendingOrders || 0,
            icon: ClockIcon,
            color: 'bg-orange-500',
            textColor: 'text-orange-500'
        },
        {
            title: 'Completed',
            value: stats?.stats?.completedOrders || 0,
            icon: CheckCircleIcon,
            color: 'bg-green-500',
            textColor: 'text-green-500'
        }
    ];

    // Calculate percentages for Order Status
    const total = stats?.stats?.totalOrders || 1; // Avoid division by zero
    const statusCounts = [
        { label: 'New', count: stats?.stats?.pendingOrders || 0, color: 'bg-blue-500' },
        { label: 'Confirmed', count: stats?.stats?.confirmedOrders || 0, color: 'bg-purple-500' },
        { label: 'Shipped', count: stats?.stats?.dispatchedOrders || 0, color: 'bg-orange-500' },
        { label: 'Delivered', count: stats?.stats?.completedOrders || 0, color: 'bg-green-500' },
    ];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-brand-600">Dashboard</h1>
                <p className="text-gray-500 mt-1">Welcome back! Here's what's happening with your dress shop today.</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((card, index) => (
                    <div key={index} className="bg-white rounded-2xl p-6 shadow-soft border border-gray-100 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 mb-1">{card.title}</p>
                            <h3 className="text-3xl font-bold text-gray-900">{card.value}</h3>
                        </div>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg ${card.color}`}>
                            <card.icon className="w-6 h-6" />
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Recent Orders */}
                <div className="lg:col-span-2">
                    <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-hidden">
                        <div className="p-6 flex items-center justify-between border-b border-gray-50">
                            <h3 className="text-lg font-bold text-gray-900">Recent Orders</h3>
                            <button
                                onClick={onViewAllOrders}
                                className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
                            >
                                View all →
                            </button>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {recentOrders.length === 0 ? (
                                <div className="p-8 text-center text-gray-500">No recent orders</div>
                            ) : (
                                recentOrders.map((order) => {
                                    const formData = JSON.parse(order.formData || '{}');
                                    return (
                                        <div key={order.id} className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                                            <div className="flex items-center space-x-4">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center space-x-2">
                                                        <span className="font-semibold text-gray-900">{formData['Customer Name'] || 'Guest'}</span>
                                                        <Badge variant={order.status.toLowerCase()}>{order.status}</Badge>
                                                    </div>
                                                    <span className="text-sm text-gray-500">{formData['Product Name'] || 'Order #' + order.orderNumber}</span>
                                                    <span className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center space-x-4">
                                                <span className="font-bold text-gray-900">
                                                    {formData['Payment Amount'] ? `Rs. ${formData['Payment Amount']}` : 'N/A'}
                                                </span>
                                                <button
                                                    onClick={() => onViewOrder(order)}
                                                    className="text-gray-400 hover:text-brand-600 p-2 rounded-full hover:bg-brand-50 transition-colors"
                                                >
                                                    <EyeIcon className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Order Status */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-2xl shadow-soft border border-gray-100 p-6 h-full">
                        <h3 className="text-lg font-bold text-gray-900 mb-6">Order Status</h3>
                        <div className="space-y-6">
                            {statusCounts.map((status) => {
                                const percentage = Math.round((status.count / total) * 100);
                                return (
                                    <div key={status.label}>
                                        <div className="flex justify-between text-sm mb-2">
                                            <span className="font-medium text-gray-700">{status.label}</span>
                                            <span className="text-gray-500">{status.count} ({percentage}%)</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-2">
                                            <div
                                                className={`h-2 rounded-full ${status.color}`}
                                                style={{ width: `${percentage}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ModernDashboard;
