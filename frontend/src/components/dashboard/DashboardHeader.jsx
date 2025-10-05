import { Button } from '../ui/Button'
import { UsersIcon } from '@heroicons/react/24/outline'

const DashboardHeader = ({ tenant, user, onLogout }) => {
  return (
    <header className="bg-white shadow-2xl border-b border-gray-200">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4 sm:py-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 truncate text-gradient">
              {tenant?.businessName}
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              <UsersIcon className="h-4 w-4 inline mr-1" />
              Welcome back, {user.name}
            </p>
          </div>
          <Button
            onClick={onLogout}
            variant="outline"
            className="ml-4"
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  )
}

export default DashboardHeader
