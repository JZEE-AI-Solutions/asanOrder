import { Suspense } from 'react'
import { LoadingSpinner, PageLoading } from './LoadingStates'

const SuspenseWrapper = ({ children, fallback = null }) => {
  const defaultFallback = fallback || (
    <div className="flex items-center justify-center min-h-[200px]">
      <LoadingSpinner />
    </div>
  )

  return (
    <Suspense fallback={defaultFallback}>
      {children}
    </Suspense>
  )
}

export default SuspenseWrapper
