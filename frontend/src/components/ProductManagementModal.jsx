import { useState, useEffect } from 'react'
import { XMarkIcon, ShoppingBagIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'
import ProductSelector from './ProductSelector'

const ProductManagementModal = ({ form, onClose, onSuccess }) => {
  const [selectedProducts, setSelectedProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (form) {
      // Find Product Selector fields and get their selected products
      const productSelectorFields = form.fields?.filter(field => field.fieldType === 'PRODUCT_SELECTOR')
      if (productSelectorFields.length > 0) {
        // For now, we'll use the first Product Selector field's products
        // In a more complex scenario, you might want to manage each field separately
        const firstField = productSelectorFields[0]
        setSelectedProducts(firstField.selectedProducts || [])
      }
    }
  }, [form])

  const handleSave = async () => {
    if (!form) return

    setSaving(true)
    try {
      // Update the form with new selected products
      const updatedFields = form.fields.map(field => {
        if (field.fieldType === 'PRODUCT_SELECTOR') {
          return {
            ...field,
            selectedProducts: selectedProducts
          }
        }
        return field
      })

      await api.put(`/form/${form.id}`, {
        fields: updatedFields
      })

      toast.success('Products updated successfully!')
      onSuccess()
    } catch (error) {
      console.error('Error updating products:', error)
      toast.error('Failed to update products')
    } finally {
      setSaving(false)
    }
  }

  if (!form) return null

  const productSelectorFields = form.fields?.filter(field => field.fieldType === 'PRODUCT_SELECTOR')
  const hasProductSelectors = productSelectorFields.length > 0

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <ShoppingBagIcon className="h-5 w-5 mr-2 text-blue-600" />
            Manage Products
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Form Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-2">{form.name}</h4>
            <p className="text-sm text-gray-600">
              {form.description || 'No description provided'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Form ID: {form.id}
            </p>
          </div>

          {/* Product Selector Fields Info */}
          {hasProductSelectors ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">
                  Product Selector Fields ({productSelectorFields.length})
                </h4>
                <div className="space-y-2">
                  {productSelectorFields.map((field, index) => (
                    <div key={index} className="flex items-center justify-between bg-white rounded p-2">
                      <span className="text-sm font-medium text-gray-700">
                        {field.label}
                        {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                      </span>
                      <span className="text-xs text-gray-500">
                        {field.selectedProducts?.length || 0} products
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Product Management */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium text-gray-900">Product Selection</h4>
                  <span className="text-sm text-gray-600">
                    {selectedProducts.length} products selected
                  </span>
                </div>
                
                <ProductSelector
                  tenantId={form.tenantId}
                  selectedProducts={selectedProducts}
                  onProductsChange={setSelectedProducts}
                  maxProducts={50}
                  showSearch={true}
                />
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <ShoppingBagIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">No Product Selector Fields</h4>
              <p className="text-gray-600">
                This form doesn't contain any Product Selector fields. 
                Add Product Selector fields to the form to manage products.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            {hasProductSelectors && (
              <button
                type="button"
                onClick={handleSave}
                className="btn-primary flex items-center"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save Products'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProductManagementModal
