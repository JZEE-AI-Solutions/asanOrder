import { Card, CardContent } from '../ui/Card'
import { Button } from '../ui/Button'
import { 
  DocumentTextIcon, 
  CurrencyDollarIcon,
  ArrowTopRightOnSquareIcon,
  ShareIcon,
  LinkIcon,
  ShoppingBagIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline'

const FormsSection = ({ forms, tenant, onOpenForm, onShareForm, onCopyFormLink, onManageProducts }) => {
  if (forms.length === 0) {
    return (
      <Card className="mb-8">
        <CardContent>
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <DocumentTextIcon className="h-8 w-8 text-gray-400" />
            </div>
            <h4 className="text-xl font-semibold text-gray-900 mb-2">No Published Forms Yet</h4>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              You don't have any published forms yet. Create and publish your first form to start accepting orders.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-lg mx-auto">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Only published and visible forms are shown here. You can create and manage all forms from the "All Forms" section above.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 p-6 pb-0">
        <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center mb-2 sm:mb-0">
          <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center mr-3">
            <DocumentTextIcon className="h-5 w-5 text-pink-600" />
          </div>
          Your Published Forms
        </h3>
        <div className="flex items-center text-sm text-gray-500">
          <ChartBarIcon className="h-4 w-4 mr-1" />
          {forms.length} form{forms.length !== 1 ? 's' : ''} available
        </div>
      </div>
      
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {forms.map((form) => (
            <div key={form.id} className="card-compact hover:shadow-xl hover:border-pink-300 transition-all duration-300 group">
              <div className="flex justify-between items-start mb-4">
                <h4 className="font-semibold text-gray-900 text-base truncate pr-2 group-hover:text-pink-600 transition-colors">
                  {form.name}
                </h4>
                <span className={`badge ${form.isPublished ? 'badge-confirmed' : 'badge-pending'} whitespace-nowrap`}>
                  {form.isPublished ? 'Published' : 'Draft'}
                </span>
              </div>
              
              <div className="flex items-center text-sm text-gray-500 mb-4">
                <CurrencyDollarIcon className="h-4 w-4 mr-1" />
                <span className="font-semibold">{form._count?.orders || 0}</span>
                <span className="ml-1">orders received</span>
              </div>
              
              {form.isPublished && (
                <div className="space-y-2">
                  <Button
                    onClick={() => onOpenForm(form)}
                    className="w-full text-sm py-2.5 flex items-center justify-center"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4 mr-2" />
                    Open Form
                  </Button>
                  
                  {/* Show Manage Products button for Shopping Cart forms or forms with Product Selector field */}
                  {(form.formCategory === 'SHOPPING_CART' || 
                    (form.fields && form.fields.some(field => field.fieldType === 'PRODUCT_SELECTOR'))) && (
                    <Button
                      onClick={() => onManageProducts(form)}
                      variant="secondary"
                      className="w-full text-sm py-2.5 flex items-center justify-center"
                    >
                      <ShoppingBagIcon className="h-4 w-4 mr-2" />
                      Manage Products
                    </Button>
                  )}
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => onShareForm(form)}
                      variant="success"
                      size="sm"
                      className="text-xs py-2 px-3 flex items-center justify-center"
                    >
                      <ShareIcon className="h-3 w-3 mr-1" />
                      Share
                    </Button>
                    <Button
                      onClick={() => onCopyFormLink(form)}
                      variant="outline"
                      size="sm"
                      className="text-xs py-2 px-3 flex items-center justify-center"
                    >
                      <LinkIcon className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default FormsSection
