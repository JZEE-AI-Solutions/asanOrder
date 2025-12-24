import { useState, useEffect } from 'react'
import { PlusIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import QuickAddAccountModal from './QuickAddAccountModal'

function PaymentAccountSelector({ value, onChange, showQuickAdd = true, filterType = null, required = false, className = '' }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    fetchAccounts()
  }, [filterType])

  const fetchAccounts = async () => {
    setLoading(true)
    try {
      const params = filterType ? { subType: filterType } : {}
      const response = await api.get('/accounting/accounts/payment-accounts', { params })
      if (response.data.success) {
        setAccounts(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching payment accounts:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAccountAdded = (newAccount) => {
    if (!newAccount || !newAccount.id) {
      console.error('Invalid account data received:', newAccount)
      return
    }
    // Add new account to list
    setAccounts(prev => {
      const updated = [...prev, newAccount].sort((a, b) => {
        // Sort by subType (CASH first), then by name
        if (a.accountSubType !== b.accountSubType) {
          return a.accountSubType === 'CASH' ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })
      return updated
    })
    // Select the newly added account
    onChange(newAccount.id)
    setShowAddModal(false)
  }

  // Group accounts by type
  const cashAccounts = accounts.filter(acc => acc.accountSubType === 'CASH')
  const bankAccounts = accounts.filter(acc => acc.accountSubType === 'BANK')

  return (
    <div className="space-y-2">
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`w-full px-3 py-2 bg-white text-gray-900 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] ${
          className || 'border-gray-300'
        }`}
        disabled={loading}
      >
        <option value="">Select account</option>
        {cashAccounts.length > 0 && (
          <optgroup label="Cash Accounts">
            {cashAccounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.name} {account.balance !== undefined ? `(Rs. ${account.balance.toFixed(2)})` : ''}
              </option>
            ))}
          </optgroup>
        )}
        {bankAccounts.length > 0 && (
          <optgroup label="Bank Accounts">
            {bankAccounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.name} {account.balance !== undefined ? `(Rs. ${account.balance.toFixed(2)})` : ''}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {showQuickAdd && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setShowAddModal(true)
          }}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          <span>Add New Account</span>
        </button>
      )}

      {showAddModal && (
        <QuickAddAccountModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAccountAdded={handleAccountAdded}
          filterType={filterType}
        />
      )}
    </div>
  )
}

export default PaymentAccountSelector

