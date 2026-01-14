import { Card, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { 
  ShoppingBagIcon,
  EyeIcon,
  CheckIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline'

const RecentOrdersSection = ({ 
  recentOrders, 
  onViewOrder, 
  onConfirmOrder, 
  onViewAllOrders,
  getStatusBadge,
  getStatusIcon 
}) => {
  if (recentOrders.length === 0) {
    return (
      <Card>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 p-6 pb-0">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center mb-2 sm:mb-0">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
              <ShoppingBagIcon className="h-5 w-5 text-purple-600" />
            </div>
            Recent Orders
          </h3>
          <Button
            onClick={onViewAllOrders}
            className="w-full sm:w-auto text-sm py-2.5 px-6 flex items-center justify-center"
          >
            View All Orders
            <ArrowRightIcon className="h-4 w-4 ml-2" />
          </Button>
        </div>
        
        <CardContent>
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingBagIcon className="h-8 w-8 text-gray-400" />
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">No Recent Orders</h4>
            <p className="text-gray-500">No recent orders found</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 p-6 pb-0">
        <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center mb-2 sm:mb-0">
          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
            <ShoppingBagIcon className="h-5 w-5 text-purple-600" />
          </div>
          Recent Orders
        </h3>
        <Button
          onClick={onViewAllOrders}
          className="w-full sm:w-auto text-sm py-2.5 px-6 flex items-center justify-center"
        >
          View All Orders
          <ArrowRightIcon className="h-4 w-4 ml-2" />
        </Button>
      </div>

      <CardContent>
        <div className="space-y-4">
          {recentOrders.map((order) => {
            const formData = JSON.parse(order.formData)
            return (
              <div key={order.id} className="card-compact hover:shadow-xl hover:border-pink-300 transition-all duration-300 group">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start space-y-4 lg:space-y-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center mb-3 flex-wrap">
                      <span className="text-2xl mr-3">{getStatusIcon(order.status)}</span>
                      <h4 className="font-semibold text-gray-900 text-base group-hover:text-pink-600 transition-colors">
                        Order #{order.orderNumber}
                      </h4>
                      <Badge variant={order.status.toLowerCase()}>
                        {order.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                      <p><span className="font-semibold">Customer:</span> <span className="break-words">{formData['Customer Name'] || 'N/A'}</span></p>
                      <p><span className="font-semibold">Phone:</span> <span className="break-all">{formData['Mobile Number'] || 'N/A'}</span></p>
                      {formData['Payment Amount'] && (
                        <p><span className="font-semibold">Amount:</span> <span className="font-bold text-green-600">Rs. {formData['Payment Amount']}</span></p>
                      )}
                      <p><span className="font-semibold">Date:</span> {new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 lg:ml-6">
                    <Button
                      onClick={() => onViewOrder(order)}
                      variant="outline"
                      className="w-full sm:w-auto text-sm py-2.5 px-4 flex items-center justify-center"
                    >
                      <EyeIcon className="h-4 w-4 mr-2" />
                      View
                    </Button>
                    
                    {order.status === 'PENDING' && (
                      <Button
                        onClick={() => onConfirmOrder(order.id)}
                        variant="success"
                        className="w-full sm:w-auto text-sm font-semibold py-2.5 px-4 flex items-center justify-center"
                      >
                        <CheckIcon className="h-4 w-4 mr-2" />
                        Confirm
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default RecentOrdersSection
