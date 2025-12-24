import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { XMarkIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'
import toast from 'react-hot-toast'

function QuickAddAccountModal({ isOpen, onClose, onAccountAdded, filterType = null }) {
  const [formData, setFormData] = useState({
    name: '',
    accountSubType: filterType || 'CASH',
    code: ''
  })
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!isOpen || !mounted) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    e.stopPropagation() // Prevent event from bubbling to parent form
    
    if (!formData.name.trim()) {
      toast.error('Account name is required')
      return
    }

    setLoading(true)
    try {
      // Generate account code if not provided
      let accountCode = formData.code.trim()
      if (!accountCode) {
        // Get existing accounts to determine next code
        const response = await api.get('/accounting/accounts/payment-accounts', {
          params: { subType: formData.accountSubType }
        })
        const existingAccounts = response.data.data || []
        const existingCodes = existingAccounts
          .map(acc => parseInt(acc.code))
          .filter(code => !isNaN(code))
          .sort((a, b) => b - a)
        
        const baseCode = formData.accountSubType === 'CASH' ? 1000 : 1100
        const nextNumber = existingCodes.length > 0 
          ? Math.max(...existingCodes.map(c => c % 100)) + 1
          : 1
        accountCode = `${baseCode.toString().slice(0, -2)}${String(nextNumber).padStart(2, '0')}`
      }

      const response = await api.post('/accounting/accounts', {
        code: accountCode,
        name: formData.name.trim(),
        type: 'ASSET',
        accountSubType: formData.accountSubType,
        balance: 0
      })

      if (response.data.success) {
        toast.success('Account created successfully')
        onAccountAdded(response.data.data)
        setFormData({ name: '', accountSubType: filterType || 'CASH', code: '' })
        // Don't close modal here - let onAccountAdded handle it
      } else {
        toast.error(response.data.error?.message || 'Failed to create account')
      }
    } catch (error) {
      console.error('Error creating account:', error)
      const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to create account'
      toast.error(errorMessage)
      // Don't close modal on error - let user retry
    } finally {
      setLoading(false)
    }
  }

  const modalContent = (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
      onClick={(e) => {
        // Close modal when clicking backdrop
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div 
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()} // Prevent backdrop click from closing
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Add New Account</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form 
          onSubmit={handleSubmit} 
          className="p-4 space-y-4"
          onClick={(e) => e.stopPropagation()} // Prevent form clicks from bubbling
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Main Cash, Bank Account 1"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Type <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.accountSubType}
              onChange={(e) => setFormData(prev => ({ ...prev, accountSubType: e.target.value }))}
              required
              disabled={!!filterType}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Account Code <span className="text-gray-500 text-xs">(Optional - Auto-generated if not provided)</span>
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value }))}
              placeholder="Auto-generated"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  // Render modal outside the form hierarchy using Portal
  return createPortal(modalContent, document.body)
}

export default QuickAddAccountModal

