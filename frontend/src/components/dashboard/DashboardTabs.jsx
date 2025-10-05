import { ChartBarIcon, CubeIcon, UsersIcon } from '@heroicons/react/24/outline'

const DashboardTabs = ({ activeTab, onTabChange }) => {
  const tabs = [
    {
      id: 'overview',
      label: 'Overview',
      icon: ChartBarIcon
    },
    {
      id: 'products',
      label: 'Products',
      icon: CubeIcon
    },
    {
      id: 'customers',
      label: 'Customers',
      icon: UsersIcon
    }
  ]

  return (
    <div className="mb-8">
      <nav className="flex space-x-8">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-5 w-5 inline mr-2" />
              {tab.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export default DashboardTabs
