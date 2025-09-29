import { useState, useEffect } from 'react'
import { XMarkIcon, ShoppingBagIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'
import ProductSelector from './ProductSelector'

const ProductManagementModal = ({ form, onClose, onSuccess }) => {
  const [selectedProducts, setSelectedProducts] = useState([])
  const [selectedProductIds, setSelectedProductIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (form) {
      loadSelectedProducts()
    }
  }, [form])

  const loadSelectedProducts = async () => {
    // Find Product Selector fields and get their selected product IDs
    const productSelectorFields = form.fields?.filter(field => field.fieldType === 'PRODUCT_SELECTOR')
    if (productSelectorFields.length > 0) {
      const firstField = productSelectorFields[0]
      let productIds = []
      
      if (firstField.selectedProducts) {
        try {
          let products;
          if (typeof firstField.selectedProducts === 'string') {
            // Try to parse the JSON string
            const parsed = JSON.parse(firstField.selectedProducts)
            
            // If it's still a string, try parsing again (double-encoded JSON)
            if (typeof parsed === 'string') {
              products = JSON.parse(parsed)
            } else {
              products = parsed
            }
          } else {
            products = firstField.selectedProducts
          }
          
          // Extract product IDs
          if (Array.isArray(products)) {
            productIds = products.map(p => p.id).filter(id => id)
          } else {
            productIds = []
          }
        } catch (error) {
          console.error('Error parsing selectedProducts:', error)
          productIds = []
        }
      }
      
      setSelectedProductIds(productIds)
      
      // If we have product IDs, fetch the full product data
      if (productIds.length > 0 && form.tenant?.id) {
        try {
          setLoading(true)
          const response = await api.get(`/products/tenant/${form.tenant.id}`)
          const allProducts = response.data.products || []
          
          // Filter to get only the selected products
          const selectedProductsData = allProducts.filter(product => 
            productIds.includes(product.id)
          )
          
          setSelectedProducts(selectedProductsData)
        } catch (error) {
          console.error('Error fetching selected products:', error)
          toast.error('Failed to load selected products')
        } finally {
          setLoading(false)
        }
      } else {
        setSelectedProducts([])
      }
    }
  }

  const handleProductsChange = (products) => {
    setSelectedProducts(products)
  }

  const handleSave = async () => {
    if (!form) return

    setSaving(true)
    try {
      // Store only product IDs to keep the JSON small and simple
      const productIds = selectedProducts.map(product => ({ id: product.id }))

      // Update the form with new selected product IDs
      const updatedFields = form.fields.map(field => {
        if (field.fieldType === 'PRODUCT_SELECTOR') {
          return {
            ...field,
            selectedProducts: JSON.stringify(productIds)
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
                        {(() => {
                          let count = 0;
                          if (field.selectedProducts) {
                            try {
                              const parsed = typeof field.selectedProducts === 'string' 
                                ? JSON.parse(field.selectedProducts) 
                                : field.selectedProducts;
                              count = Array.isArray(parsed) ? parsed.length : 0;
                            } catch (error) {
                              count = 0;
                            }
                          }
                          return count;
                        })()} products
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
                  tenantId={form.tenant?.id}
                  selectedProducts={selectedProducts}
                  onProductsChange={handleProductsChange}
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
