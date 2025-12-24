import { useState, useEffect } from 'react'
import api from '../../services/api'
import { useTenant } from '../../hooks/useTenant'
import { toast } from 'react-hot-toast'

function InvestorsTab() {
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(true)
  const [investors, setInvestors] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [selectedInvestor, setSelectedInvestor] = useState(null)
  const [showInvestmentForm, setShowInvestmentForm] = useState(false)
  const [selectedInvestorForInvestment, setSelectedInvestorForInvestment] = useState(null)

  useEffect(() => {
    if (tenant?.id) {
      fetchInvestors()
    }
  }, [tenant?.id])

  const fetchInvestors = async () => {
    try {
      setLoading(true)
      const response = await api.get('/accounting/investors')
      
      if (response.data?.success) {
        setInvestors(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching investors:', error)
      toast.error('Failed to load investors')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateInvestor = () => {
    setSelectedInvestor(null)
    setShowForm(true)
  }

  const handleEditInvestor = (investor) => {
    setSelectedInvestor(investor)
    setShowForm(true)
  }

  const handleRecordInvestment = (investor) => {
    setSelectedInvestorForInvestment(investor)
    setShowInvestmentForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    setSelectedInvestor(null)
    fetchInvestors()
  }

  const handleInvestmentFormClose = () => {
    setShowInvestmentForm(false)
    setSelectedInvestorForInvestment(null)
    fetchInvestors()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Investors</h2>
        <button
          onClick={handleCreateInvestor}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors min-h-[44px]"
        >
          Add Investor
        </button>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Investment %
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Invested
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Profit Received
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current Balance
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {investors.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                    No investors found
                  </td>
                </tr>
              ) : (
                investors.map((investor) => (
                  <tr key={investor.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {investor.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {investor.phone || investor.email || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {investor.investmentPercentage ? `${investor.investmentPercentage}%` : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      Rs. {investor.totalInvestedAmount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-green-600">
                      Rs. {investor.totalProfitReceived.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-blue-600">
                      Rs. {investor.currentBalance.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRecordInvestment(investor)}
                          className="text-blue-600 hover:text-blue-800 min-h-[44px] min-w-[44px]"
                        >
                          Record Investment
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Investor Form Modal */}
      {showForm && (
        <InvestorFormModal
          investor={selectedInvestor}
          onClose={handleFormClose}
        />
      )}

      {/* Investment Form Modal */}
      {showInvestmentForm && (
        <InvestmentFormModal
          investor={selectedInvestorForInvestment}
          onClose={handleInvestmentFormClose}
        />
      )}
    </div>
  )
}

function InvestorFormModal({ investor, onClose }) {
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    address: '',
    email: '',
    phone: '',
    investmentPercentage: ''
  })

  useEffect(() => {
    if (investor) {
      setFormData({
        name: investor.name || '',
        contact: investor.contact || '',
        address: investor.address || '',
        email: investor.email || '',
        phone: investor.phone || '',
        investmentPercentage: investor.investmentPercentage?.toString() || ''
      })
    }
  }, [investor])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.name) {
      toast.error('Name is required')
      return
    }

    try {
      setLoading(true)
      
      const submitData = {
        ...formData,
        investmentPercentage: formData.investmentPercentage ? parseFloat(formData.investmentPercentage) : null
      }

      if (investor) {
        // Update investor (if endpoint exists)
        await api.put(`/accounting/investors/${investor.id}`, submitData)
        toast.success('Investor updated successfully')
      } else {
        // Create investor
        await api.post('/accounting/investors', submitData)
        toast.success('Investor created successfully')
      }

      onClose()
    } catch (error) {
      console.error('Error saving investor:', error)
      toast.error(error.response?.data?.error?.message || 'Failed to save investor')
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
              {investor ? 'Edit Investor' : 'Add Investor'}
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
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Investment Percentage
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.investmentPercentage}
                onChange={(e) => setFormData(prev => ({ ...prev, investmentPercentage: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder="e.g., 50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                {loading ? 'Saving...' : investor ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function InvestmentFormModal({ investor, onClose }) {
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    description: ''
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.date || !formData.amount) {
      toast.error('Date and amount are required')
      return
    }

    try {
      setLoading(true)
      
      await api.post('/accounting/investors/investments', {
        investorId: investor.id,
        date: formData.date,
        amount: parseFloat(formData.amount),
        description: formData.description
      })
      
      toast.success('Investment recorded successfully')
      onClose()
    } catch (error) {
      console.error('Error recording investment:', error)
      toast.error(error.response?.data?.error?.message || 'Failed to record investment')
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
              Record Investment - {investor?.name}
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
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount <span className="text-red-500">*</span>
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
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows="3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter description..."
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
                {loading ? 'Recording...' : 'Record Investment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default InvestorsTab

