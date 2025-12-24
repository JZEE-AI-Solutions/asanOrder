import { useState, useEffect } from 'react'
import api from '../../services/api'
import { useTenant } from '../../hooks/useTenant'
import { toast } from 'react-hot-toast'

function LogisticsTab() {
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [selectedCompany, setSelectedCompany] = useState(null)

  useEffect(() => {
    if (tenant?.id) {
      fetchCompanies()
    }
  }, [tenant?.id])

  const fetchCompanies = async () => {
    try {
      setLoading(true)
      const response = await api.get('/accounting/logistics-companies')
      
      if (response.data?.success) {
        setCompanies(response.data.data || [])
      }
    } catch (error) {
      console.error('Error fetching logistics companies:', error)
      toast.error('Failed to load logistics companies')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCompany = () => {
    setSelectedCompany(null)
    setShowForm(true)
  }

  const handleEditCompany = (company) => {
    setSelectedCompany(company)
    setShowForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    setSelectedCompany(null)
    fetchCompanies()
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
        <h2 className="text-xl font-semibold text-gray-900">Logistics Companies</h2>
        <button
          onClick={handleCreateCompany}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors min-h-[44px]"
        >
          Add Company
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
                  COD Fee Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fee Details
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {companies.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    No logistics companies found
                  </td>
                </tr>
              ) : (
                companies.map((company) => {
                  let feeDetails = 'N/A'
                  if (company.codFeeCalculationType === 'PERCENTAGE') {
                    feeDetails = `${company.codFeePercentage}%`
                  } else if (company.codFeeCalculationType === 'FIXED') {
                    feeDetails = `Rs. ${company.fixedCodFee}`
                  } else if (company.codFeeCalculationType === 'RANGE_BASED') {
                    try {
                      const rules = JSON.parse(company.codFeeRules || '[]')
                      feeDetails = `${rules.length} ranges`
                    } catch (e) {
                      feeDetails = 'Range-based'
                    }
                  }

                  return (
                    <tr key={company.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {company.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {company.phone || company.email || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                          {company.codFeeCalculationType?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {feeDetails}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          company.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {company.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => handleEditCompany(company)}
                          className="text-blue-600 hover:text-blue-800 min-h-[44px] min-w-[44px]"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Company Form Modal */}
      {showForm && (
        <LogisticsCompanyFormModal
          company={selectedCompany}
          onClose={handleFormClose}
        />
      )}
    </div>
  )
}

function LogisticsCompanyFormModal({ company, onClose }) {
  const { tenant } = useTenant()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    address: '',
    email: '',
    phone: '',
    codFeeCalculationType: 'PERCENTAGE',
    codFeePercentage: '',
    fixedCodFee: '',
    codFeeRules: []
  })

  useEffect(() => {
    if (company) {
      let rules = []
      try {
        rules = company.codFeeRules ? JSON.parse(company.codFeeRules) : []
      } catch (e) {
        rules = []
      }

      setFormData({
        name: company.name || '',
        contact: company.contact || '',
        address: company.address || '',
        email: company.email || '',
        phone: company.phone || '',
        codFeeCalculationType: company.codFeeCalculationType || 'PERCENTAGE',
        codFeePercentage: company.codFeePercentage?.toString() || '',
        fixedCodFee: company.fixedCodFee?.toString() || '',
        codFeeRules: rules
      })
    }
  }, [company])

  const handleAddRangeRule = () => {
    setFormData(prev => ({
      ...prev,
      codFeeRules: [...prev.codFeeRules, { min: '', max: '', fee: '' }]
    }))
  }

  const handleRemoveRangeRule = (index) => {
    setFormData(prev => ({
      ...prev,
      codFeeRules: prev.codFeeRules.filter((_, i) => i !== index)
    }))
  }

  const handleUpdateRangeRule = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      codFeeRules: prev.codFeeRules.map((rule, i) => 
        i === index ? { ...rule, [field]: value } : rule
      )
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.name || !formData.codFeeCalculationType) {
      toast.error('Name and COD fee calculation type are required')
      return
    }

    if (formData.codFeeCalculationType === 'PERCENTAGE' && !formData.codFeePercentage) {
      toast.error('COD fee percentage is required')
      return
    }

    if (formData.codFeeCalculationType === 'FIXED' && !formData.fixedCodFee) {
      toast.error('Fixed COD fee is required')
      return
    }

    if (formData.codFeeCalculationType === 'RANGE_BASED' && formData.codFeeRules.length === 0) {
      toast.error('At least one range rule is required')
      return
    }

    try {
      setLoading(true)
      
      const submitData = {
        name: formData.name,
        contact: formData.contact,
        address: formData.address,
        email: formData.email,
        phone: formData.phone,
        codFeeCalculationType: formData.codFeeCalculationType,
        codFeePercentage: formData.codFeePercentage ? parseFloat(formData.codFeePercentage) : null,
        fixedCodFee: formData.fixedCodFee ? parseFloat(formData.fixedCodFee) : null,
        codFeeRules: formData.codFeeCalculationType === 'RANGE_BASED' ? formData.codFeeRules.map(rule => ({
          min: parseFloat(rule.min),
          max: parseFloat(rule.max),
          fee: parseFloat(rule.fee)
        })) : null
      }

      if (company) {
        await api.put(`/accounting/logistics-companies/${company.id}`, submitData)
        toast.success('Logistics company updated successfully')
      } else {
        await api.post('/accounting/logistics-companies', submitData)
        toast.success('Logistics company created successfully')
      }

      onClose()
    } catch (error) {
      console.error('Error saving logistics company:', error)
      toast.error(error.response?.data?.error?.message || 'Failed to save logistics company')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {company ? 'Edit Logistics Company' : 'Add Logistics Company'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                COD Fee Calculation Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.codFeeCalculationType}
                onChange={(e) => setFormData(prev => ({ ...prev, codFeeCalculationType: e.target.value }))}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              >
                <option value="PERCENTAGE">Percentage</option>
                <option value="RANGE_BASED">Range-Based</option>
                <option value="FIXED">Fixed</option>
              </select>
            </div>

            {formData.codFeeCalculationType === 'PERCENTAGE' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  COD Fee Percentage <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.codFeePercentage}
                  onChange={(e) => setFormData(prev => ({ ...prev, codFeePercentage: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                  placeholder="e.g., 4"
                />
                <p className="mt-1 text-xs text-gray-500">Percentage of COD amount (e.g., 4 for 4%)</p>
              </div>
            )}

            {formData.codFeeCalculationType === 'FIXED' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fixed COD Fee <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.fixedCodFee}
                  onChange={(e) => setFormData(prev => ({ ...prev, fixedCodFee: e.target.value }))}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                  placeholder="e.g., 50"
                />
                <p className="mt-1 text-xs text-gray-500">Fixed amount regardless of COD amount</p>
              </div>
            )}

            {formData.codFeeCalculationType === 'RANGE_BASED' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  COD Fee Rules <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  {formData.codFeeRules.map((rule, index) => (
                    <div key={index} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-600 mb-1">Min Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rule.min}
                          onChange={(e) => handleUpdateRangeRule(index, 'min', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                          placeholder="Min"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-600 mb-1">Max Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rule.max}
                          onChange={(e) => handleUpdateRangeRule(index, 'max', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                          placeholder="Max"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-gray-600 mb-1">Fee</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rule.fee}
                          onChange={(e) => handleUpdateRangeRule(index, 'fee', e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                          placeholder="Fee"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveRangeRule(index)}
                        className="px-3 py-2 text-red-600 hover:text-red-800 min-h-[44px] min-w-[44px]"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddRangeRule}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors min-h-[44px]"
                  >
                    + Add Range Rule
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">Define ranges with fixed fees (e.g., 1-100 = Rs. 75)</p>
              </div>
            )}

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
                {loading ? 'Saving...' : company ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default LogisticsTab

