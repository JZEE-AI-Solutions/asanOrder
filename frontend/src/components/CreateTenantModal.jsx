import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { XMarkIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'

const CreateTenantModal = ({ onClose, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm()

  const businessTypes = [
    { value: 'DRESS_SHOP', label: 'Dress Shop' },
    { value: 'RESTAURANT', label: 'Restaurant' },
    { value: 'BAKERY', label: 'Bakery' },
    { value: 'ELECTRONICS', label: 'Electronics' },
    { value: 'GROCERY', label: 'Grocery' },
    { value: 'OTHER', label: 'Other' }
  ]

  const onSubmit = async (data) => {
    setIsSubmitting(true)
    try {
      await api.post('/tenant', data)
      toast.success('Tenant created successfully!')
      onSuccess()
    } catch (error) {
      toast.error('Failed to create tenant')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-md shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Create New Tenant</h3>
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
            >
              <option value="" className="text-gray-900 bg-white">Select business type</option>
              {businessTypes.map((type) => (
                <option key={type.value} value={type.value} className="text-gray-900 bg-white">
                  {type.label}
                </option>
              ))}
            </select>
            {errors.businessType && (
              <p className="form-error">{errors.businessType.message}</p>
            )}
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium text-gray-900 mb-3">Business Owner Account</h4>
            
            <div className="form-group">
              <label className="form-label">Owner Name</label>
              <input
                {...register('ownerName', { required: 'Owner name is required' })}
                className="input-field bg-white text-gray-900"
                placeholder="Enter owner name"
              />
              {errors.ownerName && (
                <p className="form-error">{errors.ownerName.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Owner Email</label>
              <input
                {...register('ownerEmail', { 
                  required: 'Owner email is required',
                  pattern: {
                    value: /^\S+@\S+$/i,
                    message: 'Invalid email address'
                  }
                })}
                type="email"
                className="input-field bg-white text-gray-900"
                placeholder="Enter owner email"
              />
              {errors.ownerEmail && (
                <p className="form-error">{errors.ownerEmail.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Owner Password</label>
              <input
                {...register('ownerPassword', { 
                  required: 'Owner password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters'
                  }
                })}
                type="password"
                className="input-field bg-white text-gray-900"
                placeholder="Enter owner password"
              />
              {errors.ownerPassword && (
                <p className="form-error">{errors.ownerPassword.message}</p>
              )}
            </div>
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
                  Creating...
                </>
              ) : (
                'Create Tenant'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateTenantModal
