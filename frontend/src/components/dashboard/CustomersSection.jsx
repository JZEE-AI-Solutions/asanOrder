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
  ArrowRightIcon
} from '@heroicons/react/24/outline'

const CustomersSection = ({ 
  customers,
  customerStats,
  customerLoading,
  customerSearch,
  onSearchChange,
  onAddCustomer,
  onRefreshCustomers,
  onCustomerClick
}) => {
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer List */}
      <Card>
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Customers</h3>
        </div>
        
        {customerLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading customers...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="p-8 text-center">
            <UsersIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No customers found</p>
          </div>
        ) : (
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
        )}
      </Card>
    </div>
  )
}

export default CustomersSection
