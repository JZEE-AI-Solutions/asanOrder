import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import ModernLayout from '../../components/ModernLayout'
import AccountsTab from '../../components/accounting/AccountsTab'
import InvestorsTab from '../../components/accounting/InvestorsTab'
import LogisticsTab from '../../components/accounting/LogisticsTab'

function AccountingSettingsPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('accounts')

  return (
    <ModernLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/business/accounting')}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-brand-600">Accounting Settings</h1>
            <p className="text-gray-500 mt-1">Manage chart of accounts, investors, and logistics companies.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 overflow-x-auto">
            <button
              onClick={() => setActiveTab('accounts')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap min-h-[44px] ${
                activeTab === 'accounts'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Chart of Accounts
            </button>
            <button
              onClick={() => setActiveTab('investors')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap min-h-[44px] ${
                activeTab === 'investors'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Investors
            </button>
            <button
              onClick={() => setActiveTab('logistics')}
              className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap min-h-[44px] ${
                activeTab === 'logistics'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Logistics Companies
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'accounts' && <AccountsTab />}
        {activeTab === 'investors' && <InvestorsTab />}
        {activeTab === 'logistics' && <LogisticsTab />}
      </div>
    </ModernLayout>
  )
}

export default AccountingSettingsPage

