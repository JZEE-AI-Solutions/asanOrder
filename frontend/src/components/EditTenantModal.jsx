import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { XMarkIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'

const EditTenantModal = ({ tenant, onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm()

  const businessTypes = [
    { value: 'DRESS_SHOP', label: 'Dress Shop' },
    { value: 'RESTAURANT', label: 'Restaurant' },
    { value: 'BAKERY', label: 'Bakery' },
    { value: 'ELECTRONICS', label: 'Electronics' },
    { value: 'GROCERY', label: 'Grocery' },
    { value: 'OTHER', label: 'Other' }
  ]

  // Reset form when tenant changes
  useEffect(() => {
    if (tenant) {
      reset({
        businessName: tenant.businessName || '',
        contactPerson: tenant.contactPerson || '',
        whatsappNumber: tenant.whatsappNumber || '',
        businessType: tenant.businessType || ''
      })
    }
  }, [tenant, reset])

  const onSubmit = async (data) => {
    setIsSubmitting(true)
    try {
      await api.put(`/tenant/${tenant.id}`, data)
      toast.success('Tenant updated successfully!')
      onSuccess()
    } catch (error) {
      toast.error('Failed to update tenant')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!tenant) return null

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-md shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Edit Tenant</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Business Name</label>
            <input
              {...register('businessName', { required: 'Business name is required' })}
              className="input-field bg-white text-gray-900"
              placeholder="Enter business name"
            />
            {errors.businessName && (
              <p className="form-error">{errors.businessName.message}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Contact Person</label>
            <input
              {...register('contactPerson', { required: 'Contact person is required' })}
              className="input-field bg-white text-gray-900"
              placeholder="Enter contact person name"
            />
            {errors.contactPerson && (
              <p className="form-error">{errors.contactPerson.message}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">WhatsApp Number</label>
            <input
              {...register('whatsappNumber', { 
                required: 'WhatsApp number is required',
                pattern: {
                  value: /^\+92[0-9]{10}$/,
                  message: 'Enter valid Pakistani number (+92XXXXXXXXXX)'
                }
              })}
              className="input-field bg-white text-gray-900"
              placeholder="+923001234567"
            />
            {errors.whatsappNumber && (
              <p className="form-error">{errors.whatsappNumber.message}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Business Type</label>
            <select
              {...register('businessType', { required: 'Business type is required' })}
              className="input-field bg-white text-gray-900"
              style={{ color: '#111827', backgroundColor: '#ffffff' }}
            >
              <option value="" style={{ color: '#111827', backgroundColor: '#ffffff' }}>Select business type</option>
              {businessTypes.map((type) => (
                <option key={type.value} value={type.value} style={{ color: '#111827', backgroundColor: '#ffffff' }}>
                  {type.label}
                </option>
              ))}
            </select>
            {errors.businessType && (
              <p className="form-error">{errors.businessType.message}</p>
            )}
          </div>

          {/* Display business code (read-only) */}
          <div className="form-group">
            <label className="form-label">Business Code</label>
            <input
              value={tenant.businessCode || 'N/A'}
              className="input-field bg-gray-100 cursor-not-allowed"
              disabled
            />
            <p className="text-xs text-gray-500 mt-1">Business code cannot be changed</p>
          </div>

          {/* Display owner info (read-only) */}
          <div className="border-t pt-4">
            <h4 className="font-medium text-gray-900 mb-3">Business Owner Account</h4>
            
            <div className="form-group">
              <label className="form-label">Owner Name</label>
              <input
                value={tenant.owner?.name || 'N/A'}
                className="input-field bg-gray-100 cursor-not-allowed"
                disabled
              />
            </div>

            <div className="form-group">
              <label className="form-label">Owner Email</label>
              <input
                value={tenant.owner?.email || 'N/A'}
                className="input-field bg-gray-100 cursor-not-allowed"
                disabled
              />
            </div>
            <p className="text-xs text-gray-500">Owner account details cannot be changed from here</p>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
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
                'Update Tenant'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EditTenantModal
