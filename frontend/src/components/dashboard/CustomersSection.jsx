import { useState } from 'react'
import { Card, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { StatsCard } from '../ui/StatsCard'
import {
  UsersIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ClockIcon,
  UserPlusIcon,
  ArrowRightIcon,
  Squares2X2Icon,
  ListBulletIcon,
  FunnelIcon
} from '@heroicons/react/24/outline'

const CustomersSection = ({
  customers,
  customerStats,
  customerLoading,
  customerSearch,
  onSearchChange,
  onAddCustomer,
  onRefreshCustomers,
  onCustomerClick,
  filterPendingPayments,
  onFilterChange
}) => {
  const [displayMode, setDisplayMode] = useState('list')

  return (
    <div className="space-y-6">
      {/* Customer Stats */}
      {customerStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <StatsCard
            title="Total Customers"
            value={customerStats.totalCustomers}
            icon={UsersIcon}
          />
          <StatsCard
            title="Total Revenue"
            value={`Rs. ${customerStats.totalRevenue?.toLocaleString() || 0}`}
            icon={CurrencyDollarIcon}
          />
          <StatsCard
            title="Avg Order Value"
            value={`Rs. ${customerStats.averageOrderValue?.toLocaleString() || 0}`}
            icon={ChartBarIcon}
          />
          <StatsCard
            title="New (30 days)"
            value={customerStats.newCustomersLast30Days}
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
                placeholder="Search customers by name, phone, or email..."
                value={customerSearch}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              {/* Pending Payments Filter */}
              <button
                onClick={() => onFilterChange && onFilterChange(!filterPendingPayments)}
                className={`flex items-center px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                  filterPendingPayments
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <FunnelIcon className="h-4 w-4 mr-2" />
                {filterPendingPayments ? 'Pending Payments' : 'All Customers'}
              </button>
              <Button
                onClick={onAddCustomer}
                variant="success"
                className="flex items-center"
              >
                <UserPlusIcon className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
              <Button
                onClick={onRefreshCustomers}
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

      {/* Customer List/Grid */}
      {customerLoading ? (
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading customers...</p>
        </div>
      ) : customers.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-xl border border-gray-200">
          <UsersIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No customers found</p>
        </div>
      ) : displayMode === 'list' ? (
        <Card>
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Customers</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {customers.map((customer) => (
              <div
                key={customer.id}
                onClick={() => onCustomerClick(customer)}
                className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 bg-pink-100 rounded-full flex items-center justify-center">
                          <span className="text-pink-600 font-semibold text-sm">
                            {customer.name ? customer.name.charAt(0).toUpperCase() : 'C'}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {customer.name || 'Unknown Customer'}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {customer.phoneNumber}
                        </p>
                        {customer.email && (
                          <p className="text-sm text-gray-500 truncate">
                            {customer.email}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6">
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {customer.totalOrders} orders
                      </p>
                      <p className="text-sm text-gray-500">
                        Rs. {customer.totalSpent?.toLocaleString() || 0}
                      </p>
                      {customer.pendingPayment > 0 && (
                        <p className="text-sm font-semibold text-red-600 mt-1">
                          Pending: Rs. {customer.pendingPayment.toFixed(2)}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-sm text-gray-500">
                        Last order
                      </p>
                      <p className="text-sm font-medium text-gray-900">
                        {customer.lastOrderDate
                          ? new Date(customer.lastOrderDate).toLocaleDateString()
                          : 'Never'
                        }
                      </p>
                    </div>

                    <ArrowRightIcon className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {customers.map((customer) => (
            <div
              key={customer.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 p-6 cursor-pointer"
              onClick={() => onCustomerClick(customer)}
            >
              <div className="flex items-center space-x-4 mb-4">
                <div className="h-12 w-12 bg-gradient-to-br from-pink-100 to-purple-100 rounded-full flex items-center justify-center text-pink-600 font-bold text-lg">
                  {customer.name ? customer.name.charAt(0).toUpperCase() : 'C'}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{customer.name || 'Unknown'}</h3>
                  <p className="text-sm text-gray-500">{customer.phoneNumber}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4 py-4 border-t border-b border-gray-50">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Orders</p>
                  <p className="font-semibold text-gray-900">{customer.totalOrders}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Spent</p>
                  <p className="font-semibold text-gray-900">Rs. {customer.totalSpent?.toLocaleString() || 0}</p>
                </div>
              </div>
              {customer.pendingPayment > 0 && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600 uppercase tracking-wide font-semibold mb-1">Pending Payment</p>
                  <p className="text-lg font-bold text-red-700">Rs. {customer.pendingPayment.toFixed(2)}</p>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500">
                  Last: {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString() : 'Never'}
                </span>
                <span className="text-sm font-medium text-brand-600 group-hover:text-brand-700 flex items-center">
                  View Details
                  <ArrowRightIcon className="h-4 w-4 ml-1" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CustomersSection
