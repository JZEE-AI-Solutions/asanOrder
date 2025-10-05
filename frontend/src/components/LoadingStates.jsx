import { Card, CardContent } from './ui/Card'

// Skeleton loading components
export const SkeletonCard = ({ className = '' }) => (
  <Card className={`animate-pulse ${className}`}>
    <CardContent>
      <div className="space-y-4">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        <div className="h-4 bg-gray-200 rounded w-5/6"></div>
      </div>
    </CardContent>
  </Card>
)

export const SkeletonStatsCard = () => (
  <Card className="animate-pulse">
    <CardContent>
      <div className="flex items-center">
        <div className="p-2 bg-gray-200 rounded-lg w-12 h-12"></div>
        <div className="ml-4 flex-1">
          <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-16"></div>
        </div>
      </div>
    </CardContent>
  </Card>
)

export const SkeletonTable = ({ rows = 5, columns = 4 }) => (
  <Card className="animate-pulse">
    <CardContent>
      <div className="space-y-4">
        {/* Header */}
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded"></div>
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-4 gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div key={colIndex} className="h-4 bg-gray-200 rounded"></div>
            ))}
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
)

export const SkeletonList = ({ items = 5 }) => (
  <div className="space-y-4">
    {Array.from({ length: items }).map((_, i) => (
      <Card key={i} className="animate-pulse">
        <CardContent>
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
            <div className="w-6 h-6 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
)

// Loading overlay component
export const LoadingOverlay = ({ message = 'Loading...', size = 'md' }) => {
  const sizes = {
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 flex flex-col items-center space-y-4">
        <div className={`animate-spin rounded-full border-b-2 border-pink-600 ${sizes[size]}`}></div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  )
}

// Page loading component
export const PageLoading = ({ message = 'Loading page...' }) => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600 mx-auto mb-4"></div>
      <p className="text-gray-600">{message}</p>
    </div>
  </div>
)

// Inline loading component
export const InlineLoading = ({ message = 'Loading...' }) => (
  <div className="flex items-center justify-center py-8">
    <div className="flex items-center space-x-2">
      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-600"></div>
      <span className="text-gray-600">{message}</span>
    </div>
  </div>
)

// Loading spinner component
export const LoadingSpinner = ({ size = 'md', className = '' }) => {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  }

  return (
    <div className={`animate-spin rounded-full border-b-2 border-pink-600 ${sizes[size]} ${className}`}></div>
  )
}
