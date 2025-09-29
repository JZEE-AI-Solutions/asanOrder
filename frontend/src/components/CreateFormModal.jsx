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
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: {
      fields: [
        { label: 'Customer Name', fieldType: 'TEXT', isRequired: false, placeholder: 'Enter your full name', isVisible: true },
        { label: 'Email Address', fieldType: 'EMAIL', isRequired: false, placeholder: 'Enter your email address', isVisible: true },
        { label: 'Phone Number', fieldType: 'PHONE', isRequired: true, placeholder: 'Enter your phone number', isVisible: true },
        { label: 'Shipping Address', fieldType: 'ADDRESS', isRequired: false, placeholder: 'Enter your complete address', isVisible: true },
        { label: 'Select Products', fieldType: 'PRODUCT_SELECTOR', isRequired: false, placeholder: 'Choose your products', isVisible: true },
        { label: 'Size', fieldType: 'DROPDOWN', isRequired: false, placeholder: 'Select your size', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isVisible: true },
        { label: 'Quantity', fieldType: 'AMOUNT', isRequired: false, placeholder: 'How many items?', isVisible: true },
        { label: 'Product Images', fieldType: 'FILE_UPLOAD', isRequired: false, placeholder: 'Upload product images', isVisible: true },
        { label: 'Payment Amount', fieldType: 'AMOUNT', isRequired: false, placeholder: 'Enter payment amount', isVisible: true },
        { label: 'Payment Receipt', fieldType: 'FILE_UPLOAD', isRequired: false, placeholder: 'Upload payment receipt (optional)', isVisible: true }
      ]
    }
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'fields'
  })

  // Auto-detect field type based on field name
  const getFieldTypeFromName = (fieldName) => {
    const name = fieldName.toLowerCase()
    if (name.includes('email')) return 'EMAIL'
    if (name.includes('phone') || name.includes('mobile') || name.includes('contact')) return 'PHONE'
    if (name.includes('address') || name.includes('location')) return 'ADDRESS'
    if (name.includes('amount') || name.includes('price') || name.includes('cost')) return 'AMOUNT'
    if (name.includes('quantity') || name.includes('qty')) return 'AMOUNT'
    if (name.includes('description') || name.includes('notes') || name.includes('message')) return 'TEXTAREA'
    if (name.includes('image') || name.includes('photo') || name.includes('file')) return 'FILE_UPLOAD'
    if (name.includes('size') || name.includes('option') || name.includes('choice')) return 'DROPDOWN'
    if (name.includes('product') || name.includes('item')) return 'PRODUCT_SELECTOR'
    return 'TEXT'
  }

  const fieldTypes = [
    { value: 'TEXT', label: 'Text Input' },
    { value: 'EMAIL', label: 'Email Address' },
    { value: 'PHONE', label: 'Phone Number' },
    { value: 'ADDRESS', label: 'Address' },
    { value: 'TEXTAREA', label: 'Long Text' },
    { value: 'AMOUNT', label: 'Number/Amount' },
    { value: 'FILE_UPLOAD', label: 'File Upload' },
    { value: 'DROPDOWN', label: 'Dropdown Menu' },
    { value: 'PRODUCT_SELECTOR', label: 'Product Selection' }
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
    
    // Update form name to tenant name
    const selectedTenant = tenants.find(t => t.id === tenantId)
    if (selectedTenant) {
      setValue('name', selectedTenant.businessName)
    }
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
                ? Array.isArray(field.options) 
                  ? field.options
                  : field.options.split(',').map(opt => opt.trim()).filter(opt => opt)
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
                placeholder={selectedTenantId ? tenants.find(t => t.id === selectedTenantId)?.businessName || 'Enter form name' : 'Enter form name'}
                defaultValue={selectedTenantId ? tenants.find(t => t.id === selectedTenantId)?.businessName || '' : ''}
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


          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h4 className="font-medium text-gray-900">Form Fields</h4>
                <p className="text-sm text-gray-500">Add the questions you want customers to answer</p>
              </div>
              <button
                type="button"
                onClick={addField}
                className="btn-primary flex items-center text-sm px-4 py-2"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Question
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            What should this field ask for?
                          </label>
                          <input
                            {...register(`fields.${index}.label`, { 
                              required: 'Field label is required',
                              onChange: (e) => {
                                // Auto-detect field type when label changes
                                const fieldType = getFieldTypeFromName(e.target.value)
                                setValue(`fields.${index}.fieldType`, fieldType)
                                
                                // Auto-generate placeholder based on field type
                                const placeholders = {
                                  'EMAIL': 'Enter email address',
                                  'PHONE': 'Enter phone number',
                                  'ADDRESS': 'Enter complete address',
                                  'AMOUNT': 'Enter amount',
                                  'TEXTAREA': 'Enter details here',
                                  'FILE_UPLOAD': 'Choose file to upload',
                                  'DROPDOWN': 'Select an option',
                                  'PRODUCT_SELECTOR': 'Choose products'
                                }
                                if (placeholders[fieldType]) {
                                  setValue(`fields.${index}.placeholder`, placeholders[fieldType])
                                }
                              }
                            })}
                            className="input-field"
                            placeholder="e.g., Customer Name, Email Address, Phone Number"
                          />
                          {errors.fields?.[index]?.label && (
                            <p className="form-error">{errors.fields[index].label.message}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            💡 We'll automatically choose the right input type based on your field name
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Help text (optional)
                          </label>
                          <input
                            {...register(`fields.${index}.placeholder`)}
                            className="input-field"
                            placeholder="e.g., Enter your full name"
                          />
                        </div>
                      </div>

                      {/* Show detected field type */}
                      <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                        <div className="flex items-center text-sm text-blue-700">
                          <span className="font-medium">Field Type:</span>
                          <span className="ml-2 px-2 py-1 bg-blue-100 rounded text-blue-800">
                            {fieldTypes.find(t => t.value === field.fieldType)?.label || 'Text Input'}
                          </span>
                          <span className="ml-2 text-blue-600">
                            (Auto-detected from field name)
                          </span>
                        </div>
                      </div>

                      {field.fieldType === 'DROPDOWN' && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <label className="block text-sm font-medium text-yellow-800 mb-1">
                            What options should users choose from?
                          </label>
                          <input
                            {...register(`fields.${index}.options`)}
                            className="input-field"
                            placeholder="Small, Medium, Large, Extra Large"
                            defaultValue={field.options?.join(', ')}
                          />
                          <p className="text-xs text-yellow-600 mt-1">
                            💡 Separate each option with a comma
                          </p>
                        </div>
                      )}

                      {field.fieldType === 'PRODUCT_SELECTOR' && selectedTenantId && (
                        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="font-medium text-green-900">🛍️ Choose Products for This Field</h5>
                            <span className="text-sm text-green-600 bg-green-100 px-2 py-1 rounded">
                              {selectedProducts.length} products selected
                            </span>
                          </div>
                          <p className="text-sm text-green-700 mb-3">
                            Select which products customers can choose from when filling out this form.
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

                      <div className="mt-4 flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center">
                          <input
                            {...register(`fields.${index}.isRequired`)}
                            type="checkbox"
                            className="rounded border-gray-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                          />
                          <span className="ml-2 text-sm font-medium text-gray-700">
                            This field is required
                          </span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {field.isRequired ? '✅ Required' : '⚪ Optional'}
                        </div>
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
