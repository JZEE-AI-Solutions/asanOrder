import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import { useTenant } from '../../hooks/useTenant'
import { toast } from 'react-hot-toast'
import ModernLayout from '../../components/ModernLayout'
import LoadingSpinner from '../../components/LoadingSpinner'
import { Card, CardContent } from '../../components/ui/Card'

function AccountLedgerPage() {
  const navigate = useNavigate()
  const { accountId } = useParams()
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState(null)
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [filters, setFilters] = useState({
    fromDate: '',
    toDate: ''
  })

  useEffect(() => {
    if (accountId && tenant?.id) {
      fetchAccountAndLedger()
    }
  }, [accountId, tenant?.id, filters])

  const fetchAccountAndLedger = async () => {
    try {
      setLoading(true)
      
      // Fetch account details first
      const accountResponse = await api.get(`/accounting/accounts/${accountId}`)
      if (!accountResponse.data?.success) {
        toast.error('Failed to load account')
        return
      }
      
      const accountData = accountResponse.data.data
      setAccount(accountData)

      // Fetch ledger entries
      const params = new URLSearchParams({
        accountId: accountId,
        limit: 1000, // Get all entries for ledger
        sort: 'date',
        order: 'asc'
      })

      if (filters.fromDate) {
        params.append('fromDate', filters.fromDate)
      }
      if (filters.toDate) {
        params.append('toDate', filters.toDate)
      }

      const response = await api.get(`/accounting/transactions?${params}`)
      
      if (response.data?.success) {
        // Process transactions to extract ledger entries for this account
        const entries = []
        
        response.data.data.forEach(transaction => {
          transaction.transactionLines?.forEach(line => {
            if (line.accountId === accountId) {
              entries.push({
                date: transaction.date,
                transactionNumber: transaction.transactionNumber,
                description: transaction.description,
                debitAmount: line.debitAmount || 0,
                creditAmount: line.creditAmount || 0
              })
            }
          })
        })

        // Sort by date (oldest first) to calculate running balance chronologically
        entries.sort((a, b) => {
          const dateA = new Date(a.date)
          const dateB = new Date(b.date)
          if (dateA.getTime() !== dateB.getTime()) {
            return dateA - dateB
          }
          // If same date, sort by transaction number
          return a.transactionNumber.localeCompare(b.transactionNumber)
        })
        
        // Calculate running balance from start
        // For ASSET and EXPENSE: Debit increases, Credit decreases
        // For LIABILITY, EQUITY, INCOME: Credit increases, Debit decreases
        const isDebitIncrease = accountData.type === 'ASSET' || accountData.type === 'EXPENSE'
        let currentBalance = 0
        
        entries.forEach(entry => {
          if (isDebitIncrease) {
            currentBalance = currentBalance + entry.debitAmount - entry.creditAmount
          } else {
            currentBalance = currentBalance + entry.creditAmount - entry.debitAmount
          }
          entry.balance = currentBalance
        })

        // Reverse to show most recent first (but balance is already calculated correctly)
        entries.reverse()
        setLedgerEntries(entries)
      }
    } catch (error) {
      console.error('Error fetching ledger:', error)
      toast.error('Failed to load ledger')
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  if (loading && !account) {
    return (
      <ModernLayout>
        <LoadingSpinner className="min-h-screen" />
      </ModernLayout>
    )
  }

  if (!account) {
    return (
      <ModernLayout>
        <div className="text-center py-12">
          <p className="text-gray-500">Account not found</p>
          <button
            onClick={() => navigate('/business/accounting/settings')}
            className="mt-4 text-blue-600 hover:text-blue-800"
          >
            Back to Settings
          </button>
        </div>
      </ModernLayout>
    )
  }

  const isDebitIncrease = account.type === 'ASSET' || account.type === 'EXPENSE'

  return (
    <ModernLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/business/accounting/settings')}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Account Ledger</h1>
            <p className="text-gray-500 mt-1">
              {account.name} ({account.code}) - {account.type}
            </p>
            <p className="text-lg font-semibold text-gray-900 mt-2">
              Current Balance: Rs. {account.balance.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => handleFilterChange('fromDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => handleFilterChange('toDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ledger Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : ledgerEntries.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-gray-500">No transactions found for this account</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Transaction #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Debit
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Credit
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ledgerEntries.map((entry, index) => (
                      <tr key={`${entry.transactionNumber}-${index}`} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {new Date(entry.date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {entry.transactionNumber}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {entry.description || 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {entry.debitAmount > 0 ? `Rs. ${entry.debitAmount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {entry.creditAmount > 0 ? `Rs. ${entry.creditAmount.toLocaleString()}` : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-right text-gray-900">
                          Rs. {entry.balance.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ModernLayout>
  )
}

export default AccountLedgerPage

