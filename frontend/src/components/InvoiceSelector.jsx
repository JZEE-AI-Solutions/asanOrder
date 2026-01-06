import { useState, useEffect } from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'

function InvoiceSelector({ onSelectInvoice, selectedInvoiceId, supplierId }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    if (productFilter.trim().length >= 2) {
      searchInvoices()
    } else {
      setInvoices([])
      setShowDropdown(false)
    }
  }, [productFilter, supplierId])

  const searchInvoices = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (productFilter.trim()) {
        params.append('productName', productFilter.trim())
      }
      if (supplierId) {
        params.append('supplierId', supplierId)
      }
      params.append('limit', '20')

      const response = await api.get(`/purchase-invoice/search?${params.toString()}`)
      
      if (response.data.success) {
        setInvoices(response.data.purchaseInvoices || [])
        setShowDropdown(true)
      }
    } catch (error) {
      console.error('Error searching invoices:', error)
      toast.error('Failed to search invoices')
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }

  const handleSelectInvoice = (invoice) => {
    onSelectInvoice(invoice)
    setShowDropdown(false)
    setProductFilter('')
    setSearchTerm('')
  }

  const selectedInvoice = invoices.find(inv => inv.id === selectedInvoiceId)

  return (
    <div className="space-y-4">
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Search Invoice by Product Name
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            onFocus={() => {
              if (invoices.length > 0) {
                setShowDropdown(true)
              }
            }}
            placeholder="Type product name to find invoices..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          />
        </div>

        {showDropdown && invoices.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                onClick={() => handleSelectInvoice(invoice)}
                className={`cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-50 ${
                  selectedInvoiceId === invoice.id ? 'bg-blue-100' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">
                      {invoice.invoiceNumber}
                    </span>
                    <span className="text-sm text-gray-500">
                      {invoice.supplier?.name || invoice.supplierName} • {new Date(invoice.invoiceDate).toLocaleDateString()}
                    </span>
                    <span className="text-xs text-gray-400 mt-1">
                      Total: Rs. {invoice.totalAmount.toFixed(2)}
                    </span>
                  </div>
                </div>
                {invoice.purchaseItems && invoice.purchaseItems.length > 0 && (
                  <div className="mt-1 text-xs text-gray-600">
                    Products: {invoice.purchaseItems.map(item => item.name).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {showDropdown && !loading && invoices.length === 0 && productFilter.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md py-2 px-3 text-sm text-gray-500">
            No invoices found matching "{productFilter}"
          </div>
        )}

        {loading && (
          <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md py-2 px-3 text-sm text-gray-500">
            Searching...
          </div>
        )}
      </div>

      {selectedInvoice && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Selected Invoice</h3>
          <div className="space-y-1 text-sm">
            <div><span className="font-medium">Invoice:</span> {selectedInvoice.invoiceNumber}</div>
            <div><span className="font-medium">Supplier:</span> {selectedInvoice.supplier?.name || selectedInvoice.supplierName}</div>
            <div><span className="font-medium">Date:</span> {new Date(selectedInvoice.invoiceDate).toLocaleDateString()}</div>
            <div><span className="font-medium">Total:</span> Rs. {selectedInvoice.totalAmount.toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default InvoiceSelector

