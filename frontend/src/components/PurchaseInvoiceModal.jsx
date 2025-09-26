import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { XMarkIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'

const PurchaseInvoiceModal = ({ invoice, onClose, onSaved }) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm()

  // Reset form when invoice changes
  useEffect(() => {
    if (invoice) {
      reset({
        invoiceNumber: invoice.invoiceNumber || '',
        supplierName: invoice.supplierName || '',
        invoiceDate: invoice.invoiceDate ? new Date(invoice.invoiceDate).toISOString().split('T')[0] : '',
        totalAmount: invoice.totalAmount || '',
        notes: invoice.notes || ''
      })
    } else {
      reset({
        invoiceNumber: '',
        supplierName: '',
        invoiceDate: '',
        totalAmount: '',
        notes: ''
      })
    }
  }, [invoice, reset])

  const onSubmit = async (data) => {
    setIsSubmitting(true)
    try {
      if (invoice) {
        await api.put(`/purchase-invoice/${invoice.id}`, data)
        toast.success('Invoice updated successfully!')
      } else {
        await api.post('/purchase-invoice', data)
        toast.success('Invoice created successfully!')
      }
      onSaved()
    } catch (error) {
      toast.error(invoice ? 'Failed to update invoice' : 'Failed to create invoice')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-md shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {invoice ? 'Edit Purchase Invoice' : 'Add Purchase Invoice'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Invoice Number *</label>
            <input
              {...register('invoiceNumber', { required: 'Invoice number is required' })}
              className="input-field"
              placeholder="Enter invoice number"
            />
            {errors.invoiceNumber && (
              <p className="form-error">{errors.invoiceNumber.message}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Supplier Name</label>
            <input
              {...register('supplierName')}
              className="input-field"
              placeholder="Enter supplier name"
            />
            {errors.supplierName && (
              <p className="form-error">{errors.supplierName.message}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Invoice Date *</label>
            <input
              {...register('invoiceDate', { required: 'Invoice date is required' })}
              type="date"
              className="input-field"
            />
            {errors.invoiceDate && (
              <p className="form-error">{errors.invoiceDate.message}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Total Amount *</label>
            <input
              {...register('totalAmount', { 
                required: 'Total amount is required',
                min: { value: 0, message: 'Amount must be positive' }
              })}
              type="number"
              step="0.01"
              min="0"
              className="input-field"
              placeholder="0.00"
            />
            {errors.totalAmount && (
              <p className="form-error">{errors.totalAmount.message}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              {...register('notes')}
              className="input-field"
              rows={3}
              placeholder="Enter additional notes"
            />
            {errors.notes && (
              <p className="form-error">{errors.notes.message}</p>
            )}
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
                  {invoice ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                invoice ? 'Update Invoice' : 'Create Invoice'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PurchaseInvoiceModal
