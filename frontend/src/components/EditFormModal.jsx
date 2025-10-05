import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'

const EditFormModal = ({ form, onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset
  } = useForm()

  const { fields, append, remove, replace } = useFieldArray({
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
    { value: 'DROPDOWN', label: 'Dropdown' }
  ]

  useEffect(() => {
    if (form) {
      loadFormData()
    }
  }, [form])

  const loadFormData = async () => {
    try {
      // Get full form details with fields
      const response = await api.get(`/form/${form.id}`)
      const formData = response.data.form
      
      // Prepare fields data for the form
      const fieldsData = formData.fields.map(field => ({
        label: field.label,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        placeholder: field.placeholder || '',
        options: field.options ? JSON.parse(field.options).join(', ') : '',
        isVisible: true // All existing fields are visible
      }))

      // Reset form with loaded data
      reset({
        name: formData.name,
        description: formData.description || '',
        formCategory: formData.formCategory || 'SIMPLE_CART',
        tenantId: formData.tenantId,
        fields: fieldsData
      })

      // Replace fields array
      replace(fieldsData)
      
    } catch (error) {
      toast.error('Failed to load form data')
      console.error('Load form error:', error)
    } finally {
      setLoading(false)
    }
  }

  const addField = () => {
    append({
      label: '',
      fieldType: 'TEXT',
      isRequired: false,
      placeholder: '',
      options: '',
      isVisible: true
    })
  }

  const onSubmit = async (data) => {
    setIsSubmitting(true)
    try {
      // Filter only visible fields and process options
      const processedData = {
        ...data,
        fields: data.fields
          .filter(field => field.isVisible)
          .map(field => ({
            ...field,
            options: field.fieldType === 'DROPDOWN' && field.options 
              ? field.options.split(',').map(opt => opt.trim()).filter(opt => opt)
              : undefined
          }))
      }
      
      await api.put(`/form/${form.id}`, processedData)
      toast.success('Form updated successfully!')
      onSuccess()
    } catch (error) {
      toast.error('Failed to update form')
      console.error('Update form error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8">
          <LoadingSpinner size="lg" />
          <p className="text-center mt-4 text-gray-600">Loading form data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Edit Form</h3>
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
              <label className="form-label">Status</label>
              <div className="flex items-center space-x-4">
                <span className={`badge ${form.isPublished ? 'badge-confirmed' : 'badge-pending'}`}>
                  {form.isPublished ? 'Published' : 'Draft'}
                </span>
                {form.isPublished && (
                  <span className="text-xs text-gray-500">
                    Published forms can be edited, but changes will affect new submissions
                  </span>
                )}
              </div>
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

          <div className="form-group">
            <label className="form-label">Form Category</label>
            <select
              {...register('formCategory', { required: 'Form category is required' })}
              className="input-field"
            >
              <option value="SIMPLE_CART">Simple Cart (Order Entry Form)</option>
              <option value="SHOPPING_CART">Shopping Cart (Product Catalog)</option>
            </select>
            <p className="text-sm text-gray-500 mt-1">
              Simple Cart: Traditional form with fields. Shopping Cart: Product catalog with cart functionality.
            </p>
            {errors.formCategory && (
              <p className="form-error">{errors.formCategory.message}</p>
            )}
          </div>

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
                      {fields.length > 1 && (
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
                          />
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
                  Updating...
                </>
              ) : (
                'Update Form'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditFormModal
