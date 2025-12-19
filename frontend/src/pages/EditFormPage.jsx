import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, useFieldArray } from 'react-hook-form'
import { ArrowLeftIcon, PlusIcon, TrashIcon, DocumentTextIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ModernLayout from '../components/ModernLayout'

const EditFormPage = () => {
  const navigate = useNavigate()
  const { formId } = useParams()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  
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
    { value: 'DROPDOWN', label: 'Dropdown' },
    { value: 'PRODUCT_SELECTOR', label: 'Product Selection' }
  ]

  useEffect(() => {
    if (formId) {
      loadFormData()
    }
  }, [formId])

  const loadFormData = async () => {
    try {
      setLoading(true)
      // Get full form details with fields
      const response = await api.get(`/form/${formId}`)
      const formData = response.data.form
      setForm(formData)
      
      // Prepare fields data for the form
      const fieldsData = formData.fields.map(field => ({
        label: field.label,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        placeholder: field.placeholder || '',
        options: field.options ? (Array.isArray(JSON.parse(field.options)) ? JSON.parse(field.options).join(', ') : field.options) : '',
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
      navigate('/business/forms')
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
      
      await api.put(`/form/${formId}`, processedData)
      toast.success('Form updated successfully!')
      navigate('/business/forms')
    } catch (error) {
      toast.error('Failed to update form')
      console.error('Update form error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <ModernLayout>
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      </ModernLayout>
    )
  }

  if (!form) {
    return null
  }

  return (
    <ModernLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/business/forms')}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div className="flex items-center">
            <div className="p-2 bg-pink-100 rounded-lg mr-3">
              <DocumentTextIcon className="h-6 w-6 text-pink-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Edit Form</h1>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="block text-sm font-bold text-gray-900 mb-2">Form Name</label>
              <input
                {...register('name', { required: 'Form name is required' })}
                className="input-field bg-white text-gray-900 border-2 border-gray-300 rounded-lg px-4 py-2 w-full focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                placeholder="Enter form name"
              />
              {errors.name && (
                <p className="form-error">{errors.name.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="block text-sm font-bold text-gray-900 mb-2">Status</label>
              <div className="flex items-center space-x-4">
                <span className={`badge ${form.isPublished ? 'badge-confirmed' : 'badge-pending'}`}>
                  {form.isPublished ? 'Published' : 'Draft'}
                </span>
                {form.isPublished && (
                  <span className="text-xs text-gray-700 font-medium">
                    Published forms can be edited, but changes will affect new submissions
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="block text-sm font-bold text-gray-900 mb-2">Description</label>
            <textarea
              {...register('description')}
              className="input-field bg-white text-gray-900 border-2 border-gray-300 rounded-lg px-4 py-2 w-full focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              rows={2}
              placeholder="Enter form description (optional)"
            />
          </div>

          <div className="form-group">
            <label className="block text-sm font-bold text-gray-900 mb-2">Form Category</label>
            <select
              {...register('formCategory', { required: 'Form category is required' })}
              className="input-field bg-white text-gray-900 border-2 border-gray-300 rounded-lg px-4 py-2 w-full focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
              style={{ color: '#111827', backgroundColor: '#ffffff' }}
            >
              <option value="SIMPLE_CART" style={{ color: '#111827', backgroundColor: '#ffffff' }}>Simple Cart (Order Entry Form)</option>
              <option value="SHOPPING_CART" style={{ color: '#111827', backgroundColor: '#ffffff' }}>Shopping Cart (Product Catalog)</option>
            </select>
            <p className="text-sm text-gray-700 font-medium mt-2">
              Simple Cart: Traditional form with fields. Shopping Cart: Product catalog with cart functionality.
            </p>
            {errors.formCategory && (
              <p className="form-error">{errors.formCategory.message}</p>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-gray-900 text-lg">Form Fields</h4>
              <button
                type="button"
                onClick={addField}
                className="btn-primary flex items-center text-sm px-4 py-2"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Field
              </button>
            </div>

            <div className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className={`border rounded-lg p-4 ${field.isVisible ? 'border-gray-200 bg-white' : 'border-gray-300 bg-gray-50'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center">
                      <h5 className="font-bold text-gray-900">{field.label || `Field ${index + 1}`}</h5>
                      {!field.isVisible && <span className="ml-2 text-xs bg-gray-300 text-gray-900 px-2 py-1 rounded font-semibold">Hidden</span>}
                    </div>
                    <div className="flex items-center space-x-2">
                      <label className="flex items-center">
                        <input
                          {...register(`fields.${index}.isVisible`)}
                          type="checkbox"
                          className="rounded border-gray-300 text-primary-600 shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                        />
                        <span className="ml-1 text-xs font-semibold text-gray-900">Visible</span>
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
                          <label className="block text-sm font-bold text-gray-900 mb-2">
                            Field Label
                          </label>
                          <input
                            {...register(`fields.${index}.label`, { 
                              required: 'Field label is required' 
                            })}
                            className="input-field bg-white text-gray-900 border-2 border-gray-300 rounded-lg px-4 py-2 w-full focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            placeholder="Enter field label"
                          />
                          {errors.fields?.[index]?.label && (
                            <p className="form-error">{errors.fields[index].label.message}</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-bold text-gray-900 mb-2">
                            Field Type
                          </label>
                          <select
                            {...register(`fields.${index}.fieldType`)}
                            className="input-field bg-white text-gray-900 border-2 border-gray-300 rounded-lg px-4 py-2 w-full focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            style={{ color: '#111827', backgroundColor: '#ffffff' }}
                          >
                            {fieldTypes.map((type) => (
                              <option key={type.value} value={type.value} style={{ color: '#111827', backgroundColor: '#ffffff' }}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-bold text-gray-900 mb-2">
                            Placeholder
                          </label>
                          <input
                            {...register(`fields.${index}.placeholder`)}
                            className="input-field bg-white text-gray-900 border-2 border-gray-300 rounded-lg px-4 py-2 w-full focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                            placeholder="Enter placeholder text"
                          />
                        </div>
                      </div>

                      {field.fieldType === 'DROPDOWN' && (
                        <div className="mt-3">
                          <label className="block text-sm font-bold text-gray-900 mb-2">
                            Dropdown Options (comma-separated)
                          </label>
                          <input
                            {...register(`fields.${index}.options`)}
                            className="input-field bg-white text-gray-900 border-2 border-gray-300 rounded-lg px-4 py-2 w-full focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
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
                          <span className="ml-2 text-sm font-bold text-gray-900">Required field</span>
                        </label>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 mt-8">
            <button
              type="button"
              onClick={() => navigate('/business/forms')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 text-sm font-medium text-white bg-pink-600 border border-transparent rounded-lg hover:bg-pink-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Updating...</span>
                </>
              ) : (
                'Update Form'
              )}
            </button>
          </div>
        </form>
      </div>
    </ModernLayout>
  )
}

export default EditFormPage

