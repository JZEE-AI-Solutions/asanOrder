import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  FunnelIcon
} from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ModernLayout from '../components/ModernLayout'

const ReportsPage = () => {
  const navigate = useNavigate()
  const [profitStats, setProfitStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  })
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetchProfitStats()
  }, [dateRange.startDate, dateRange.endDate, statusFilter])

  const fetchProfitStats = async () => {
    try {
      setLoading(true)
      const params = {}
      if (dateRange.startDate) params.startDate = dateRange.startDate
      if (dateRange.endDate) params.endDate = dateRange.endDate
      if (statusFilter) params.status = statusFilter

      const response = await api.get('/order/stats/profit', { params })
      setProfitStats(response.data)
    } catch (error) {
      console.error('Failed to fetch profit stats:', error)
      toast.error('Failed to fetch profit statistics')
    } finally {
      setLoading(false)
    }
  }

  const handleDateRangeChange = (type, value) => {
    setDateRange(prev => ({
      ...prev,
      [type]: value
    }))
  }

  const resetFilters = () => {
    setDateRange({ startDate: '', endDate: '' })
    setStatusFilter('')
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/business/dashboard')}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="h-6 w-6" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Profit & Analytics</h1>
              <p className="text-gray-500 mt-1">Detailed profit analysis and reports</p>
            </div>
          </div>
          <button
            onClick={fetchProfitStats}
            className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors"
          >
            <ArrowPathIcon className="h-5 w-5" />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="card p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => handleDateRangeChange('startDate', e.target.value)}
                className="w-full px-4 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => handleDateRangeChange('endDate', e.target.value)}
                className="w-full px-4 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Order Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              >
                <option value="">All Statuses</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="DISPATCHED">Dispatched</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
              >
                <FunnelIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {profitStats && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="card p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-1">Total Revenue</p>
                    <p className="text-3xl font-bold text-blue-900">
                      Rs. {profitStats.totalRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                    </p>
                  </div>
                  <ChartBarIcon className="h-12 w-12 text-blue-600 opacity-50" />
                </div>
              </div>

              <div className="card p-6 bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-1">Total Cost</p>
                    <p className="text-3xl font-bold text-red-900">
                      Rs. {profitStats.totalCost?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                    </p>
                  </div>
                  <CurrencyDollarIcon className="h-12 w-12 text-red-600 opacity-50" />
                </div>
              </div>

              <div className={`card p-6 bg-gradient-to-br ${profitStats.totalProfit >= 0 ? 'from-green-50 to-green-100 border-2 border-green-200' : 'from-red-50 to-red-100 border-2 border-red-200'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wide mb-1" style={{ color: profitStats.totalProfit >= 0 ? '#059669' : '#dc2626' }}>
                      Net Profit
                    </p>
                    <p className={`text-3xl font-bold ${profitStats.totalProfit >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                      Rs. {profitStats.totalProfit?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                    </p>
                  </div>
                  <CurrencyDollarIcon className={`h-12 w-12 opacity-50 ${profitStats.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                </div>
              </div>

              <div className="card p-6 bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-semibold text-purple-600 uppercase tracking-wide mb-1">Profit Margin</p>
                    <p className={`text-3xl font-bold ${profitStats.profitMargin >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                      {profitStats.profitMargin?.toFixed(2) || '0.00'}%
                    </p>
                  </div>
                  <ChartBarIcon className="h-12 w-12 text-purple-600 opacity-50" />
                </div>
              </div>
            </div>

            {/* Shipping Variance Section */}
            {profitStats.shippingVariance && (
              <div className="card p-6 mb-8">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Shipping Variance Analysis</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-1">Variance Expense</p>
                        <p className="text-2xl font-bold text-red-900">
                          Rs. {profitStats.shippingVariance.expense?.toFixed(2) || '0.00'}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">When actual cost > estimated</p>
                      </div>
                      <CurrencyDollarIcon className="h-10 w-10 text-red-600 opacity-50" />
                    </div>
                  </div>

                  <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-green-600 uppercase tracking-wide mb-1">Variance Income</p>
                        <p className="text-2xl font-bold text-green-900">
                          Rs. {profitStats.shippingVariance.income?.toFixed(2) || '0.00'}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">When actual cost &lt; estimated</p>
                      </div>
                      <CurrencyDollarIcon className="h-10 w-10 text-green-600 opacity-50" />
                    </div>
                  </div>

                  <div className={`border-2 rounded-lg p-4 ${
                    (profitStats.shippingVariance.net || 0) >= 0 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-sm font-semibold uppercase tracking-wide mb-1 ${
                          (profitStats.shippingVariance.net || 0) >= 0 
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`}>
                          Net Variance
                        </p>
                        <p className={`text-2xl font-bold ${
                          (profitStats.shippingVariance.net || 0) >= 0 
                            ? 'text-green-900' 
                            : 'text-red-900'
                        }`}>
                          Rs. {(profitStats.shippingVariance.net || 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          {(profitStats.shippingVariance.net || 0) >= 0 
                            ? 'Overall positive impact on profit' 
                            : 'Overall negative impact on profit'}
                        </p>
                      </div>
                      <ChartBarIcon className={`h-10 w-10 opacity-50 ${
                        (profitStats.shippingVariance.net || 0) >= 0 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Additional Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="card p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">Orders Analyzed</p>
                    <p className="text-2xl font-bold text-gray-900">{profitStats.orderCount || 0}</p>
                  </div>
                <CalendarIcon className="h-10 w-10 text-gray-400" />
                </div>
              </div>

              <div className="card p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">Average Revenue per Order</p>
                    <p className="text-2xl font-bold text-gray-900">
                      Rs. {profitStats.orderCount > 0 ? (profitStats.totalRevenue / profitStats.orderCount).toFixed(2) : '0.00'}
                    </p>
                  </div>
                  <CurrencyDollarIcon className="h-10 w-10 text-gray-400" />
                </div>
              </div>

              <div className="card p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-600 mb-1">Average Profit per Order</p>
                    <p className={`text-2xl font-bold ${profitStats.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Rs. {profitStats.orderCount > 0 ? (profitStats.totalProfit / profitStats.orderCount).toFixed(2) : '0.00'}
                    </p>
                  </div>
                  <ChartBarIcon className="h-10 w-10 text-gray-400" />
                </div>
              </div>
            </div>

            {/* Orders List */}
            {profitStats.orders && profitStats.orders.length > 0 && (
              <div className="card p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Order-wise Profit Breakdown</h2>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Order #</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Date</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Revenue</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Cost</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Profit</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitStats.orders.map((order) => (
                        <tr key={order.orderId} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/business/orders/${order.orderId}`)}>
                          <td className="py-3 px-4 text-sm font-medium text-gray-900">{order.orderNumber}</td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              order.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' :
                              order.status === 'DISPATCHED' ? 'bg-blue-100 text-blue-800' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-right font-medium text-blue-600">
                            Rs. {order.totalRevenue.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right font-medium text-red-600">
                            Rs. {order.totalCost.toFixed(2)}
                          </td>
                          <td className={`py-3 px-4 text-sm text-right font-bold ${order.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            Rs. {order.profit.toFixed(2)}
                          </td>
                          <td className={`py-3 px-4 text-sm text-right font-semibold ${order.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {order.profitMargin.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(!profitStats.orders || profitStats.orders.length === 0) && (
              <div className="card p-12 text-center">
                <ChartBarIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">No profit data available for the selected filters</p>
                <p className="text-gray-500 text-sm mt-2">Try adjusting your date range or status filter</p>
              </div>
            )}
          </>
        )}
      </div>
    </ModernLayout>
  )
}

export default ReportsPage

