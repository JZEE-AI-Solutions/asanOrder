import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, ShoppingBagIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ProductSelector from '../components/ProductSelector'
import ModernLayout from '../components/ModernLayout'

const ProductManagementPage = () => {
  const { formId } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(null)
  const [selectedProducts, setSelectedProducts] = useState([])
  const [selectedProductIds, setSelectedProductIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    console.log('🚀 ProductManagementPage: useEffect triggered', { formId })
    if (formId) {
      fetchFormData()
    }
  }, [formId])

  const fetchFormData = async () => {
    try {
      console.log('🔄 Fetching form data for formId:', formId)
      setLoading(true)
      const response = await api.get(`/form/${formId}`)
      const formData = response.data.form
      console.log('✅ Fetched form data:', { formId: formData.id, fieldsCount: formData.fields?.length })
      setForm(formData)
      loadSelectedProducts(formData)
    } catch (error) {
      console.error('Error fetching form:', error)
      toast.error('Failed to load form')
      navigate('/business/forms')
    } finally {
      setLoading(false)
    }
  }

  const loadSelectedProducts = async (formData) => {
    console.log('📥 ProductManagementPage: loadSelectedProducts called')
    
    // Find Product Selector fields and get their selected product IDs and prices
    const productSelectorFields = formData.fields?.filter(field => field.fieldType === 'PRODUCT_SELECTOR')
    if (productSelectorFields.length > 0) {
      const firstField = productSelectorFields[0]
      let productIds = []
      let storedProducts = [] // Store products with prices from saved data
      
      console.log('📋 First field selectedProducts:', firstField.selectedProducts, 'Type:', typeof firstField.selectedProducts)
      
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
          
          console.log('📦 Parsed selectedProducts from form:', products)
          
          // Extract product IDs and store products with prices
          if (Array.isArray(products)) {
            productIds = products.map(p => p.id).filter(id => id)
            storedProducts = products // Store for later use to preserve prices
            console.log('📦 Stored products with prices:', JSON.stringify(storedProducts, null, 2))
          } else {
            productIds = []
            console.log('⚠️ Products is not an array:', products)
          }
        } catch (error) {
          console.error('Error parsing selectedProducts:', error)
          productIds = []
        }
      } else {
        console.log('⚠️ No selectedProducts found in field')
      }
      
      setSelectedProductIds(productIds)
      
      // If we have product IDs, fetch the full product data
      if (productIds.length > 0 && formData.tenant?.id) {
        try {
          console.log('🔄 Fetching products from tenant:', formData.tenant.id)
          const response = await api.get(`/products/tenant/${formData.tenant.id}`)
          const allProducts = response.data.products || []
          
          // Filter to get only the selected products and preserve prices from stored data
          const selectedProductsData = allProducts
            .filter(product => productIds.includes(product.id))
            .map(product => {
              // Find the original product data to get price if stored
              const originalProduct = storedProducts.find(p => p.id === product.id)
              // Use stored price if it exists (even if 0), otherwise use currentRetailPrice
              let price
              if (originalProduct && originalProduct.price !== undefined && originalProduct.price !== null) {
                price = typeof originalProduct.price === 'number' 
                  ? originalProduct.price 
                  : parseFloat(originalProduct.price) || 0
              } else {
                price = product.currentRetailPrice ? parseFloat(product.currentRetailPrice) || 0 : 0
              }
              console.log('📥 Loading product:', product.name)
              console.log('   - originalProduct:', originalProduct)
              console.log('   - originalProduct?.price:', originalProduct?.price, 'Type:', typeof originalProduct?.price)
              console.log('   - product.currentRetailPrice:', product.currentRetailPrice)
              console.log('   - Final price:', price)
              return {
                ...product,
                price: price
              }
            })
          
          console.log('✅ Loaded selected products with prices:', selectedProductsData.map(p => ({ name: p.name, price: p.price })))
          setSelectedProducts(selectedProductsData)
        } catch (error) {
          console.error('Error fetching selected products:', error)
          toast.error('Failed to load selected products')
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
      // Store product IDs and prices
      const productsWithPrices = selectedProducts.map(product => {
        // Use price if explicitly set (even if 0), otherwise use currentRetailPrice
        let price
        if (product.price !== undefined && product.price !== null) {
          price = typeof product.price === 'number' ? product.price : parseFloat(product.price)
          if (isNaN(price)) price = 0
        } else {
          price = product.currentRetailPrice ? parseFloat(product.currentRetailPrice) || 0 : 0
        }
        
        console.log('💾 Product:', product.name, 'ID:', product.id)
        console.log('   - product.price:', product.price, 'Type:', typeof product.price)
        console.log('   - product.currentRetailPrice:', product.currentRetailPrice)
        console.log('   - Final price to save:', price)
        
        return {
          id: product.id,
          price: price
        }
      })
      console.log('💾 Saving products with prices:', JSON.stringify(productsWithPrices, null, 2))

      // Update the form with new selected products (with prices)
      // Backend will stringify selectedProducts, so send as object/array
      // IMPORTANT: Include all field properties as backend deletes and recreates all fields
      const updatedFields = form.fields.map(field => {
        const baseField = {
          label: field.label,
          fieldType: field.fieldType,
          isRequired: field.isRequired || false,
          placeholder: field.placeholder || null,
          options: field.options || null
        }
        
        if (field.fieldType === 'PRODUCT_SELECTOR') {
          return {
            ...baseField,
            selectedProducts: productsWithPrices  // Backend will stringify this
          }
        }
        return baseField
      })

      console.log('📤 Sending updated fields to backend')
      const productSelectorField = updatedFields.find(f => f.fieldType === 'PRODUCT_SELECTOR')
      console.log('📤 PRODUCT_SELECTOR field selectedProducts:', JSON.stringify(productSelectorField?.selectedProducts, null, 2))

      const response = await api.put(`/form/${form.id}`, {
        fields: updatedFields
      })

      console.log('✅ Form updated response:', response.data)
      if (response.data.form?.fields) {
        const savedField = response.data.form.fields.find(f => f.fieldType === 'PRODUCT_SELECTOR')
        console.log('✅ Saved selectedProducts in response:', savedField?.selectedProducts)
        if (savedField?.selectedProducts) {
          try {
            const parsed = typeof savedField.selectedProducts === 'string' 
              ? JSON.parse(savedField.selectedProducts) 
              : savedField.selectedProducts
            console.log('✅ Parsed saved selectedProducts:', JSON.stringify(parsed, null, 2))
          } catch (e) {
            console.error('Error parsing saved selectedProducts:', e)
          }
        }
      }

      toast.success('Products updated successfully!')
      navigate('/business/forms')
    } catch (error) {
      console.error('Error updating products:', error)
      console.error('Error response:', error.response?.data)
      toast.error('Failed to update products')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <ModernLayout>
        <LoadingSpinner className="min-h-screen" />
      </ModernLayout>
    )
  }

  if (!form) return null

  const productSelectorFields = form.fields?.filter(field => field.fieldType === 'PRODUCT_SELECTOR')
  const hasProductSelectors = productSelectorFields.length > 0

  return (
    <ModernLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/business/forms')}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="h-6 w-6" />
            </button>
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg mr-3">
                <ShoppingBagIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Manage Products</h1>
                <p className="text-sm text-gray-500 mt-1">{form.name}</p>
              </div>
            </div>
          </div>
          {hasProductSelectors && (
            <button
              type="button"
              onClick={handleSave}
              className="btn-primary flex items-center px-6 py-2.5"
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

        <div className="space-y-6">
          {/* Form Info */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{form.name}</h3>
            <p className="text-gray-600 mb-2">
              {form.description || 'No description provided'}
            </p>
            <p className="text-sm text-gray-500">
              Form ID: {form.id}
            </p>
          </div>

          {/* Product Selector Fields Info */}
          {hasProductSelectors ? (
            <div className="space-y-6">
              <div className="card p-6 bg-blue-50 border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-4">
                  Product Selector Fields ({productSelectorFields.length})
                </h4>
                <div className="space-y-2">
                  {productSelectorFields.map((field, index) => (
                    <div key={index} className="flex items-center justify-between bg-white rounded-lg p-3">
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
              <div className="card p-6">
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
            <div className="card p-12 text-center">
              <ShoppingBagIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">No Product Selector Fields</h4>
              <p className="text-gray-600">
                This form doesn't contain any Product Selector fields. 
                Add Product Selector fields to the form to manage products.
              </p>
            </div>
          )}
        </div>
      </div>
    </ModernLayout>
  )
}

export default ProductManagementPage


