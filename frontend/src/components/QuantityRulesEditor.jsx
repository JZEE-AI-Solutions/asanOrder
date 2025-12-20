import { useState } from 'react'
import { PlusIcon, XMarkIcon, HashtagIcon } from '@heroicons/react/24/outline'

function QuantityRulesEditor({ rules = [], defaultCharge = 150, onRulesChange, onDefaultChange, showDefaultCharge = true }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [newRule, setNewRule] = useState({ min: '', max: '', charge: '' })

  const handleAddRule = () => {
    const min = parseInt(newRule.min) || 1
    const max = newRule.max === '' || newRule.max === null ? null : parseInt(newRule.max)
    const charge = parseFloat(newRule.charge) || 0

    if (charge >= 0 && min >= 1 && (max === null || max >= min)) {
      let updatedRules
      if (editingIndex !== null) {
        // Editing existing rule
        updatedRules = [...rules]
        updatedRules[editingIndex] = { min, max, charge }
      } else {
        // Adding new rule
        updatedRules = [...rules, { min, max, charge }]
      }
      // Sort by min value
      updatedRules.sort((a, b) => (a.min || 1) - (b.min || 1))
      onRulesChange(updatedRules)
      setNewRule({ min: '', max: '', charge: '' })
      setShowAddForm(false)
      setEditingIndex(null)
    }
  }

  const handleEditRule = (index) => {
    const rule = rules[index]
    setNewRule({
      min: rule.min?.toString() || '1',
      max: rule.max === null || rule.max === undefined ? '' : rule.max.toString(),
      charge: rule.charge?.toString() || '0'
    })
    setEditingIndex(index)
    setShowAddForm(true)
  }

  const handleRemoveRule = (index) => {
    const updatedRules = rules.filter((_, i) => i !== index)
    onRulesChange(updatedRules)
  }

  const handleCancelEdit = () => {
    setNewRule({ min: '', max: '', charge: '' })
    setShowAddForm(false)
    setEditingIndex(null)
  }

  return (
    <div className="space-y-4">
      {/* Default Quantity Charge - Only show if showDefaultCharge is true */}
      {showDefaultCharge && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default Quantity Charge per Unit (Rs.)
            <span className="text-gray-500 text-xs ml-2 font-normal">
              Applied to additional units (quantity - 1) when quantity doesn't match any rule below. Quantity 1 = no charge.
            </span>
          </label>
          <input
            type="number"
            value={defaultCharge}
            onChange={(e) => onDefaultChange(parseFloat(e.target.value) || 0)}
            min="0"
            step="0.01"
            className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
          />
        </div>
      )}

      {/* Quantity Rules List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-700">
            Quantity-Based Rules
          </label>
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="flex items-center px-3 py-1.5 text-sm font-medium text-pink-600 bg-pink-50 border border-pink-200 rounded-lg hover:bg-pink-100 transition-colors"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Add Rule
            </button>
          )}
        </div>

        {showAddForm && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Quantity
                </label>
                <input
                  type="number"
                  value={newRule.min}
                  onChange={(e) => setNewRule({ ...newRule, min: e.target.value })}
                  placeholder="1"
                  min="1"
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Quantity
                  <span className="text-gray-500 text-xs ml-1 font-normal">(leave empty for unlimited)</span>
                </label>
                <input
                  type="number"
                  value={newRule.max}
                  onChange={(e) => setNewRule({ ...newRule, max: e.target.value || null })}
                  placeholder="Unlimited"
                  min="1"
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Charge (Rs.)
                </label>
                <input
                  type="number"
                  value={newRule.charge}
                  onChange={(e) => setNewRule({ ...newRule, charge: e.target.value })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                />
              </div>
            </div>

            <div className="flex space-x-2 mt-3">
              <button
                type="button"
                onClick={handleAddRule}
                disabled={
                  !newRule.min || 
                  parseFloat(newRule.charge) < 0 ||
                  (newRule.max && parseInt(newRule.max) < parseInt(newRule.min))
                }
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {editingIndex !== null ? 'Update Rule' : 'Add Rule'}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No quantity rules configured. All products will use the default charge.
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-white border-2 border-gray-200 rounded-lg"
              >
                <div className="flex items-center">
                  <HashtagIcon className="h-5 w-5 text-gray-400 mr-2" />
                  <span className="font-medium text-gray-900">
                    {rule.min} - {rule.max === null || rule.max === undefined ? '∞' : rule.max} items
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-gray-700">Rs. {rule.charge.toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={() => handleEditRule(index)}
                    className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                    title="Edit rule"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveRule(index)}
                    className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                    title="Remove rule"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default QuantityRulesEditor

