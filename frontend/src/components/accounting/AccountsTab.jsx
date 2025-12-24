import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { useTenant } from '../../hooks/useTenant'
import { toast } from 'react-hot-toast'

function AccountsTab() {
  const { tenant } = useTenant()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [showOpeningBalanceModal, setShowOpeningBalanceModal] = useState(false)
  const [accountForOpeningBalance, setAccountForOpeningBalance] = useState(null)

  useEffect(() => {
    if (tenant?.id) {
      fetchAccounts()
    }
  }, [tenant?.id])

  const fetchAccounts = async () => {
    try {
      setLoading(true)
      const response = await api.get('/accounting/accounts')
      
      if (response.data?.success) {
        setAccounts(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching accounts:', error)
      toast.error('Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAccount = () => {
    setSelectedAccount(null)
    setShowForm(true)
  }

  const handleEditAccount = (account) => {
    setSelectedAccount(account)
    setShowForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    setSelectedAccount(null)
    fetchAccounts()
  }

  const handleSetOpeningBalance = (account) => {
    setAccountForOpeningBalance(account)
    setShowOpeningBalanceModal(true)
  }

  const handleOpeningBalanceClose = () => {
    setShowOpeningBalanceModal(false)
    setAccountForOpeningBalance(null)
    fetchAccounts()
  }

  const handleViewLedger = (account) => {
    navigate(`/business/accounting/ledger/${account.id}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Group accounts by type
  const accountsByType = accounts.reduce((acc, account) => {
    if (!acc[account.type]) {
      acc[account.type] = []
    }
    acc[account.type].push(account)
    return acc
  }, {})

  const typeOrder = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Chart of Accounts</h2>
        <button
          onClick={handleCreateAccount}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors min-h-[44px]"
        >
          Add Account
        </button>
      </div>

      <div className="space-y-6">
        {typeOrder.map(type => {
          if (!accountsByType[type]) return null
          
          return (
            <div key={type} className="bg-white rounded-lg shadow">
              <div className="p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">{type}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Balance
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {accountsByType[type].map((account) => (
                      <tr key={account.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {account.code}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {account.name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                          Rs. {account.balance.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleViewLedger(account)}
                              className="text-green-600 hover:text-green-900 font-medium"
                              title="View Ledger"
                            >
                              View Ledger
                            </button>
                            {(account.type === 'ASSET' || account.type === 'LIABILITY') && (
                              <button
                                onClick={() => handleSetOpeningBalance(account)}
                                className="text-blue-600 hover:text-blue-900 font-medium"
                                title="Set Opening Balance"
                              >
                                Set Opening Balance
                              </button>
                            )}
                            <button
                              onClick={() => handleEditAccount(account)}
                              className="text-gray-600 hover:text-gray-900"
                              title="Edit Account"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>

      {/* Account Form Modal */}
      {showForm && (
        <AccountFormModal
          account={selectedAccount}
          onClose={handleFormClose}
        />
      )}

      {/* Opening Balance Modal */}
      {showOpeningBalanceModal && accountForOpeningBalance && (
        <OpeningBalanceModal
          account={accountForOpeningBalance}
          onClose={handleOpeningBalanceClose}
        />
      )}
    </div>
  )
}

function OpeningBalanceModal({ account, onClose }) {
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0]
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Please enter a valid opening balance amount')
      return
    }

    if (!formData.date) {
      toast.error('Please select a date')
      return
    }

    try {
      setLoading(true)
      
      await api.post(`/accounting/accounts/${account.id}/opening-balance`, {
        amount: parseFloat(formData.amount),
        date: formData.date
      })
      
      toast.success('Opening balance set successfully')
      onClose()
    } catch (error) {
      console.error('Error setting opening balance:', error)
      toast.error(error.response?.data?.error?.message || 'Failed to set opening balance')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="p-4 sm:p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              Set Opening Balance
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Account:</p>
            <p className="text-lg font-semibold text-gray-900">{account.name} ({account.code})</p>
            <p className="text-sm text-gray-500 mt-1">Current Balance: Rs. {account.balance.toLocaleString()}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Opening Balance Amount (Rs.) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter the opening balance as of the selected date
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                As of Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                required
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              />
              <p className="text-xs text-gray-500 mt-1">
                Select the date as of which this opening balance is valid
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                <strong>Note:</strong> This will create a transaction dated {formData.date} to record the opening balance. 
                For Asset accounts, it will debit the account and credit "Opening Balance" equity account. 
                For Liability accounts, it will credit the account and debit "Opening Balance" equity account.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
              >
                {loading ? 'Setting...' : 'Set Opening Balance'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function AccountFormModal({ account, onClose }) {
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'ASSET',
    balance: '0'
  })

  useEffect(() => {
    if (account) {
      setFormData({
        code: account.code,
        name: account.name,
        type: account.type,
        balance: account.balance.toString()
      })
    }
  }, [account])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.code || !formData.name || !formData.type) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      setLoading(true)
      
      if (account) {
        // Update account (if endpoint exists)
        await api.put(`/accounting/accounts/${account.id}`, formData)
        toast.success('Account updated successfully')
      } else {
        // Create account
        await api.post('/accounting/accounts', {
          ...formData,
          balance: parseFloat(formData.balance)
        })
        toast.success('Account created successfully')
      }

      onClose()
    } catch (error) {
      console.error('Error saving account:', error)
      toast.error(error.response?.data?.error?.message || 'Failed to save account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {account ? 'Edit Account' : 'Add Account'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
                required
                disabled={!!account}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 min-h-[44px]"
                placeholder="e.g., 1000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder="e.g., Cash"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                required
                disabled={!!account}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 min-h-[44px]"
              >
                <option value="ASSET">Asset</option>
                <option value="LIABILITY">Liability</option>
                <option value="EQUITY">Equity</option>
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Opening Balance
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.balance}
                onChange={(e) => setFormData(prev => ({ ...prev, balance: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder="0.00"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
              >
                {loading ? 'Saving...' : account ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AccountsTab

