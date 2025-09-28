import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { XMarkIcon, PlusIcon, TrashIcon, ShoppingBagIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'
import ProductSelector from './ProductSelector'

const CreateFormModal = ({ tenants, defaultTenantId, onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedTenantId, setSelectedTenantId] = useState(defaultTenantId || '')
  const [selectedProducts, setSelectedProducts] = useState([])
  
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors }
  } = useForm({
    defaultValues: {
      fields: [
        { label: 'Customer Name', fieldType: 'TEXT', isRequired: true, placeholder: 'Enter customer name', isVisible: true },
        { label: 'Mobile Number', fieldType: 'PHONE', isRequired: true, placeholder: 'Enter mobile number', isVisible: true },
        { label: 'Shipping Address', fieldType: 'ADDRESS', isRequired: true, placeholder: 'Enter complete address', isVisible: true },
        { label: 'Dress Size', fieldType: 'DROPDOWN', isRequired: true, placeholder: 'Select dress size', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isVisible: true },
        { label: 'Dress Quantity', fieldType: 'AMOUNT', isRequired: true, placeholder: 'Enter number of dresses', isVisible: true },
        { label: 'Dress Images', fieldType: 'FILE_UPLOAD', isRequired: true, placeholder: 'Upload dress images', isVisible: true },
        { label: 'Payment Amount', fieldType: 'AMOUNT', isRequired: true, placeholder: 'Enter payment amount', isVisible: true },
        { label: 'Payment Receipt', fieldType: 'FILE_UPLOAD', isRequired: false, placeholder: 'Upload payment receipt (optional)', isVisible: true }
      ]
    }
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'fields'
  })

  const fieldTypes = [
    { value: 'TEXT', label: 'Text' },
    { value: 'EMAIL', label: 'Email' },
    { value: 'PHONE', label: 'Phone' },
    { value: 'ADDRESS', label: 'Address' },
    { value: 'TEXTAREA', label: 'Text Area' },
    { value: 'AMOUNT', label: 'Amount' },
    { value: 'FILE_UPLOAD', label: 'File Upload' },
    { value: 'DROPDOWN', label: 'Dropdown' },
    { value: 'PRODUCT_SELECTOR', label: 'Product Selector' }
  ]

  const addField = () => {
    append({
      label: '',
      fieldType: 'TEXT',
      isRequired: false,
      placeholder: '',
      isVisible: true
    })
  }

  const handleTenantChange = (tenantId) => {
    setSelectedTenantId(tenantId)
    setSelectedProducts([]) // Clear selected products when tenant changes
  }

  const onSubmit = async (data) => {
    setIsSubmitting(true)
    try {
      // Filter only visible fields and process options
      const processedData = {
        ...data,
        fields: data.fields
          .filter(field => field.isVisible)
          .map(field => {
            const processedField = {
              ...field,
              options: field.fieldType === 'DROPDOWN' && field.options 
                ? field.options.split(',').map(opt => opt.trim()).filter(opt => opt)
                : undefined
            }
            
            // Add selected products for PRODUCT_SELECTOR fields
            if (field.fieldType === 'PRODUCT_SELECTOR') {
              processedField.selectedProducts = selectedProducts
            }
            
            return processedField
          })
      }
      
      await api.post('/form', processedData)
      toast.success('Form created successfully!')
      onSuccess()
    } catch (error) {
      toast.error('Failed to create form')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Create New Form</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Form Name</label>
              <input
                {...register('name', { required: 'Form name is required' })}
                className="input-field"
                placeholder="Enter form name"
              />
              {errors.name && (
                <p className="form-error">{errors.name.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Tenant</label>
              <select
                {...register('tenantId', { required: 'Tenant is required' })}
                className="input-field"
                value={selectedTenantId}
                onChange={(e) => handleTenantChange(e.target.value)}
              >
                <option value="">Select tenant</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.businessName}
                  </option>
                ))}
              </select>
              {errors.tenantId && (
                <p className="form-error">{errors.tenantId.message}</p>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              {...register('description')}
              className="input-field"
              rows={2}
              placeholder="Enter form description (optional)"
            />
          </div>

          {/* Product Selection Section */}
          {selectedTenantId && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center mb-4">
                <ShoppingBagIcon className="h-5 w-5 text-blue-600 mr-2" />
                <h4 className="font-medium text-blue-900">Product Selection</h4>
              </div>
              <p className="text-sm text-blue-700 mb-4">
                Select products that can be used in Product Selector fields. You can add Product Selector fields in the form fields section below.
                {selectedProducts.length > 0 && ` (${selectedProducts.length} products selected)`}
              </p>
              <ProductSelector
                tenantId={selectedTenantId}
                selectedProducts={selectedProducts}
                onProductsChange={setSelectedProducts}
                maxProducts={20}
                showSearch={true}
              />
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-medium text-gray-900">Form Fields</h4>
              <button
                type="button"
                onClick={addField}
                className="btn-outline flex items-center text-sm"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Add Field
              </button>
            </div>

            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className={`border rounded-lg p-4 ${field.isVisible ? 'border-gray-200 bg-white' : 'border-gray-300 bg-gray-50'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center">
                      <h5 className="font-medium text-gray-700">{field.label || `Field ${index + 1}`}</h5>
                      {!field.isVisible && <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">Hidden</span>}
                    </div>
                    <div className="flex items-center space-x-2">
                      <label className="flex items-center">
                        <input
                          {...register(`fields.${index}.isVisible`)}
                          type="checkbox"
                          className="rounded border-gray-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                        />
                        <span className="ml-1 text-xs text-gray-600">Visible</span>
                      </label>
                      {index >= 8 && (
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {field.isVisible && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Field Label
                          </label>
                          <input
                            {...register(`fields.${index}.label`, { 
                              required: 'Field label is required' 
                            })}
                            className="input-field"
                            placeholder="Enter field label"
                          />
                          {errors.fields?.[index]?.label && (
                            <p className="form-error">{errors.fields[index].label.message}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Field Type
                          </label>
                          <select
                            {...register(`fields.${index}.fieldType`)}
                            className="input-field"
                          >
                            {fieldTypes.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Placeholder
                          </label>
                          <input
                            {...register(`fields.${index}.placeholder`)}
                            className="input-field"
                            placeholder="Enter placeholder text"
                          />
                        </div>
                      </div>

                      {field.fieldType === 'DROPDOWN' && (
                        <div className="mt-3">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Dropdown Options (comma-separated)
                          </label>
                          <input
                            {...register(`fields.${index}.options`)}
                            className="input-field"
                            placeholder="Option 1, Option 2, Option 3"
                            defaultValue={field.options?.join(', ')}
                          />
                        </div>
                      )}

                      {field.fieldType === 'PRODUCT_SELECTOR' && (
                        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <p className="text-sm text-blue-700">
                            This field will display a product selector with {selectedProducts.length} products for customers to choose from.
                          </p>
                          {selectedProducts.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {selectedProducts.slice(0, 3).map((product) => (
                                <span key={product.id} className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                                  {product.name}
                                </span>
                              ))}
                              {selectedProducts.length > 3 && (
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                                  +{selectedProducts.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                          {selectedProducts.length === 0 && (
                            <p className="text-xs text-blue-600 mt-1">
                              Select products in the Product Selection section above to populate this field.
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex items-center space-x-4">
                        <label className="flex items-center">
                          <input
                            {...register(`fields.${index}.isRequired`)}
                            type="checkbox"
                            className="rounded border-gray-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                          />
                          <span className="ml-2 text-sm text-gray-700">Required field</span>
                        </label>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex items-center"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Creating...
                </>
              ) : (
                'Create Form'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateFormModal
