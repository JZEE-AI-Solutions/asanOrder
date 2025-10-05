import { Button } from './ui/Button'
import { Card, CardContent } from './ui/Card'

// Error state components
export const ErrorCard = ({ 
  title = 'Something went wrong',
  message = 'An error occurred while loading data.',
  onRetry,
  className = ''
}) => (
  <Card className={`${className}`}>
    <CardContent>
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-4">{message}</p>
        {onRetry && (
          <Button onClick={onRetry}>
            Try Again
          </Button>
        )}
      </div>
    </CardContent>
  </Card>
)

export const EmptyState = ({ 
  title = 'No data found',
  message = 'There are no items to display.',
  action,
  actionLabel = 'Add Item',
  icon: Icon,
  className = ''
}) => (
  <Card className={`${className}`}>
    <CardContent>
      <div className="text-center py-12">
        {Icon && (
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon className="w-8 h-8 text-gray-400" />
          </div>
        )}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        {action && (
          <Button onClick={action}>
            {actionLabel}
          </Button>
        )}
      </div>
    </CardContent>
  </Card>
)

export const NetworkError = ({ onRetry, className = '' }) => (
  <ErrorCard
    title="Network Error"
    message="Unable to connect to the server. Please check your internet connection and try again."
    onRetry={onRetry}
    className={className}
  />
)

export const NotFoundError = ({ 
  title = 'Page Not Found',
  message = 'The page you are looking for does not exist.',
  onGoHome,
  className = ''
}) => (
  <Card className={`${className}`}>
    <CardContent>
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.47-.881-6.08-2.33" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        {onGoHome && (
          <Button onClick={onGoHome}>
            Go Home
          </Button>
        )}
      </div>
    </CardContent>
  </Card>
)

export const UnauthorizedError = ({ onLogin, className = '' }) => (
  <ErrorCard
    title="Unauthorized"
    message="You don't have permission to access this resource. Please log in with the correct account."
    onRetry={onLogin}
    className={className}
  />
)

export const ServerError = ({ onRetry, className = '' }) => (
  <ErrorCard
    title="Server Error"
    message="The server encountered an error. Please try again later."
    onRetry={onRetry}
    className={className}
  />
)
