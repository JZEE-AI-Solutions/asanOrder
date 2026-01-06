import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { useTenant } from '../../hooks/useTenant'
import { toast } from 'react-hot-toast'
import ModernLayout from '../../components/ModernLayout'
import LoadingSpinner from '../../components/LoadingSpinner'
import { StatsCard } from '../../components/ui/StatsCard'
import { Card, CardContent } from '../../components/ui/Card'
import {
  CurrencyDollarIcon,
  ChartBarIcon,
  DocumentTextIcon,
  CreditCardIcon,
  ArrowLeftOnRectangleIcon,
  Cog6ToothIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline'

function AccountingDashboard() {
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(true)
  const [balanceSummary, setBalanceSummary] = useState(null)
  const [recentTransactions, setRecentTransactions] = useState([])

  useEffect(() => {
    if (tenant?.id) {
      fetchDashboardData()
    }
  }, [tenant?.id])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const [summaryRes, transactionsRes] = await Promise.all([
        api.get('/accounting/balances/summary'),
        api.get('/accounting/transactions?page=1&limit=5&sort=date&order=desc')
      ])

      if (summaryRes.data?.success) {
        setBalanceSummary(summaryRes.data.data)
      }

      if (transactionsRes.data?.success) {
        setRecentTransactions(transactionsRes.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <ModernLayout>
        <LoadingSpinner className="min-h-screen" />
      </ModernLayout>
    )
  }

  return (
    <ModernLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-brand-600">Accounting</h1>
          <p className="text-gray-500 mt-1">Manage your accounting, transactions, and financial records.</p>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Link
            to="/business/accounting/expenses"
            className="card p-6 hover:shadow-lg transition-all duration-200 text-center group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-red-100 rounded-full flex items-center justify-center group-hover:bg-red-200 transition-colors">
              <CurrencyDollarIcon className="h-6 w-6 text-red-600" />
            </div>
            <div className="text-sm font-medium text-gray-900">Expenses</div>
          </Link>
          <Link
            to="/business/accounting/balances"
            className="card p-6 hover:shadow-lg transition-all duration-200 text-center group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              <ChartBarIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div className="text-sm font-medium text-gray-900">Balances</div>
          </Link>
          <Link
            to="/business/accounting/transactions"
            className="card p-6 hover:shadow-lg transition-all duration-200 text-center group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-purple-100 rounded-full flex items-center justify-center group-hover:bg-purple-200 transition-colors">
              <DocumentTextIcon className="h-6 w-6 text-purple-600" />
            </div>
            <div className="text-sm font-medium text-gray-900">Transactions</div>
          </Link>
          <Link
            to="/business/accounting/payments"
            className="card p-6 hover:shadow-lg transition-all duration-200 text-center group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
              <CreditCardIcon className="h-6 w-6 text-green-600" />
            </div>
            <div className="text-sm font-medium text-gray-900">Payments</div>
          </Link>
          <Link
            to="/business/accounting/returns"
            className="card p-6 hover:shadow-lg transition-all duration-200 text-center group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-orange-100 rounded-full flex items-center justify-center group-hover:bg-orange-200 transition-colors">
              <ArrowLeftOnRectangleIcon className="h-6 w-6 text-orange-600" />
            </div>
            <div className="text-sm font-medium text-gray-900">Returns</div>
          </Link>
          <Link
            to="/business/accounting/settings"
            className="card p-6 hover:shadow-lg transition-all duration-200 text-center group"
          >
            <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-gray-200 transition-colors">
              <Cog6ToothIcon className="h-6 w-6 text-gray-600" />
            </div>
            <div className="text-sm font-medium text-gray-900">Settings</div>
          </Link>
        </div>

        {/* Balance Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="Total Receivables"
            value={`Rs. ${balanceSummary?.totalReceivables?.toLocaleString() || '0.00'}`}
            icon={ArrowTrendingUpIcon}
            iconClassName="bg-green-100 text-green-600"
          />
          <StatsCard
            title="Total Payables"
            value={`Rs. ${balanceSummary?.totalPayables?.toLocaleString() || '0.00'}`}
            icon={ArrowTrendingDownIcon}
            iconClassName="bg-red-100 text-red-600"
          />
          <StatsCard
            title="Cash Position"
            value={`Rs. ${balanceSummary?.cashPosition?.toLocaleString() || '0.00'}`}
            icon={BanknotesIcon}
            iconClassName="bg-blue-100 text-blue-600"
          />
          <StatsCard
            title="Net Balance"
            value={`Rs. ${balanceSummary?.netBalance?.toLocaleString() || '0.00'}`}
            icon={ChartBarIcon}
            iconClassName={
              (balanceSummary?.netBalance || 0) >= 0
                ? 'bg-green-100 text-green-600'
                : 'bg-red-100 text-red-600'
            }
          />
        </div>

        {/* Recent Transactions */}
        <Card>
          <CardContent>
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Recent Transactions</h2>
            </div>
            <div className="p-6">
              {recentTransactions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No transactions yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {recentTransactions.map((transaction) => (
                        <tr key={transaction.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {new Date(transaction.date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {transaction.description || 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            Rs. {transaction.transactionLines?.reduce((sum, line) => 
                              sum + (line.debitAmount || 0), 0
                            ).toLocaleString() || '0.00'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ModernLayout>
  )
}

export default AccountingDashboard

