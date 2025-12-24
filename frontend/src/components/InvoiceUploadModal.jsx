import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { XMarkIcon, CameraIcon, DocumentArrowUpIcon, PhotoIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'

const InvoiceUploadModal = ({ onClose, onProductsExtracted }) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadMethod, setUploadMethod] = useState('file') // 'file' or 'camera'
  const [previewImage, setPreviewImage] = useState(null)
  const [extractedProducts, setExtractedProducts] = useState(null)
  const [extractedReturns, setExtractedReturns] = useState(null)
  const [invoiceData, setInvoiceData] = useState(null)
  const [editingProduct, setEditingProduct] = useState(null)
  const [editingReturn, setEditingReturn] = useState(null)
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [stream, setStream] = useState(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm()

  const handleFileUpload = (event) => {
    const file = event.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreviewImage(e.target.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // Use back camera on mobile
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
    } catch (error) {
      console.error('Error accessing camera:', error)
      toast.error('Unable to access camera. Please check permissions.')
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop())
      setStream(null)
    }
  }

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current
      const video = videoRef.current
      const context = canvas.getContext('2d')
      
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      context.drawImage(video, 0, 0)
      
      canvas.toBlob((blob) => {
        const file = new File([blob], 'captured-invoice.jpg', { type: 'image/jpeg' })
        const reader = new FileReader()
        reader.onload = (e) => {
          setPreviewImage(e.target.result)
          stopCamera()
        }
        reader.readAsDataURL(file)
      }, 'image/jpeg', 0.8)
    }
  }

  const processInvoice = async (data) => {
    setIsProcessing(true)
    try {
      let response

      if (uploadMethod === 'file') {
        // Check if we have a file from the input or from fileInputRef
        const file = data.invoice?.[0] || fileInputRef.current?.files?.[0]
        
        if (!file) {
          toast.error('Please select an invoice image')
          setIsProcessing(false)
          return
        }

        const formData = new FormData()
        formData.append('invoice', file)
        response = await api.post('/invoice/process-image', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })
      } else {
        // For camera capture, we need to convert the preview image to a file
        const canvas = canvasRef.current
        if (canvas) {
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
          const file = new File([blob], 'captured-invoice.jpg', { type: 'image/jpeg' })
          const formData = new FormData()
          formData.append('invoice', file)
          response = await api.post('/invoice/process-image', formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          })
        } else {
          throw new Error('No image captured')
        }
      }

      setExtractedProducts(response.data.products)
      setExtractedReturns(response.data.returns)
      setInvoiceData(response.data.invoiceData)
      
      const message = response.data.hasReturns 
        ? `Successfully extracted ${response.data.counts.products} products and ${response.data.counts.returns} returns!`
        : `Successfully extracted ${response.data.counts.products} products!`
      
      toast.success(message)
      
    } catch (error) {
      console.error('Error processing invoice:', error)
      const errorMsg = typeof error.response?.data?.error === 'string'
        ? error.response?.data?.error
        : error.response?.data?.error?.message || 'Failed to process invoice'
      toast.error(errorMsg)
    } finally {
      setIsProcessing(false)
    }
  }

  const saveProducts = async () => {
    if (!extractedProducts || extractedProducts.length === 0) return

    setIsProcessing(true)
    try {
      const promises = []
      
      // Save products if any
      if (extractedProducts && extractedProducts.length > 0) {
        const productsData = {
          invoiceNumber: invoiceData?.invoiceNumber || `INV-${Date.now()}`,
          invoiceDate: invoiceData?.invoiceDate || new Date().toISOString(),
          totalAmount: invoiceData?.amounts?.productsTotal || extractedProducts.reduce((sum, p) => sum + (p.purchasePrice * p.quantity), 0),
          products: extractedProducts
        }
        
        console.log('Sending products data:', productsData)
        promises.push(api.post('/purchase-invoice/with-products', productsData))
      }
      
      // Save returns if any
      if (extractedReturns && extractedReturns.length > 0) {
        const returnsData = {
          invoiceNumber: invoiceData?.invoiceNumber || `INV-${Date.now()}`,
          invoiceDate: invoiceData?.invoiceDate || new Date().toISOString(),
          totalAmount: invoiceData?.amounts?.returnsTotal || extractedReturns.reduce((sum, r) => sum + (r.purchasePrice * r.quantity), 0),
          returnItems: extractedReturns.map(returnItem => ({
            productName: returnItem.name, // Map 'name' to 'productName'
            description: returnItem.description,
            purchasePrice: returnItem.purchasePrice,
            quantity: returnItem.quantity,
            reason: returnItem.reason,
            sku: returnItem.sku
          }))
        }
        
        console.log('Sending returns data:', returnsData)
        promises.push(api.post('/return/from-invoice', returnsData))
      }
      
      await Promise.all(promises)
      
      const message = extractedReturns && extractedReturns.length > 0
        ? `${extractedProducts.length} products and ${extractedReturns.length} returns saved successfully!`
        : `${extractedProducts.length} products saved successfully!`
      
      toast.success(message)
      onProductsExtracted(extractedProducts, invoiceData)
    } catch (error) {
      console.error('Error saving products and returns:', error)
      console.error('Error response:', error.response?.data)
      toast.error('Failed to save data: ' + (error.response?.data?.error || error.message))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleEditProduct = (index) => {
    setEditingProduct({ ...extractedProducts[index], index })
  }

  const handleEditReturn = (index) => {
    setEditingReturn({ ...extractedReturns[index], index })
  }

  const handleSaveProductEdit = () => {
    if (editingProduct) {
      const updatedProducts = [...extractedProducts]
      updatedProducts[editingProduct.index] = {
        name: editingProduct.name,
        description: editingProduct.description,
        purchasePrice: parseFloat(editingProduct.purchasePrice),
        quantity: parseInt(editingProduct.quantity),
        category: editingProduct.category,
        sku: editingProduct.sku
      }
      setExtractedProducts(updatedProducts)
      setEditingProduct(null)
    }
  }

  const handleSaveReturnEdit = () => {
    if (editingReturn) {
      const updatedReturns = [...extractedReturns]
      updatedReturns[editingReturn.index] = {
        name: editingReturn.name,
        productName: editingReturn.name, // Map name to productName for returns
        description: editingReturn.description,
        purchasePrice: parseFloat(editingReturn.purchasePrice),
        quantity: parseInt(editingReturn.quantity),
        reason: editingReturn.reason,
        sku: editingReturn.sku
      }
      setExtractedReturns(updatedReturns)
      setEditingReturn(null)
    }
  }

  const handleCancelEdit = () => {
    setEditingProduct(null)
    setEditingReturn(null)
  }

  const handleDeleteProduct = (index) => {
    const updatedProducts = extractedProducts.filter((_, i) => i !== index)
    setExtractedProducts(updatedProducts)
  }

  const handleDeleteReturn = (index) => {
    const updatedReturns = extractedReturns.filter((_, i) => i !== index)
    setExtractedReturns(updatedReturns)
  }

  const handleClose = () => {
    stopCamera()
    setPreviewImage(null)
    setExtractedProducts(null)
    setExtractedReturns(null)
    setInvoiceData(null)
    setEditingProduct(null)
    setEditingReturn(null)
    reset()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-4 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Import Products from Invoice</h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {!extractedProducts ? (
          <div>
            {/* Upload Method Selection */}
            <div className="mb-6">
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setUploadMethod('file')}
                  className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                    uploadMethod === 'file'
                      ? 'border-pink-500 bg-pink-50 text-pink-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <DocumentArrowUpIcon className="h-6 w-6 mx-auto mb-2" />
                  <div className="font-medium">Upload File</div>
                  <div className="text-sm text-gray-600">Choose from device</div>
                </button>
                
                <button
                  type="button"
                  onClick={() => setUploadMethod('camera')}
                  className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                    uploadMethod === 'camera'
                      ? 'border-pink-500 bg-pink-50 text-pink-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <CameraIcon className="h-6 w-6 mx-auto mb-2" />
                  <div className="font-medium">Take Photo</div>
                  <div className="text-sm text-gray-600">Use camera</div>
                </button>
              </div>
            </div>

            {/* File Upload */}
            {uploadMethod === 'file' && (
              <form onSubmit={(e) => {
                e.preventDefault()
                if (previewImage) {
                  processInvoice({})
                } else {
                  toast.error('Please select an invoice image')
                }
              }} className="space-y-4">
                <div className="form-group">
                  <label className="form-label">Invoice Image</label>
                  <input
                    {...register('invoice')}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="input-field"
                    ref={fileInputRef}
                  />
                  {!previewImage && (
                    <p className="form-error">Please select an invoice image</p>
                  )}
                </div>

                {previewImage && (
                  <div className="mt-4">
                    <label className="form-label">Preview</label>
                    <img
                      src={previewImage}
                      alt="Invoice preview"
                      className="w-full h-64 object-contain border rounded-lg"
                    />
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="btn-secondary"
                    disabled={isProcessing}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex items-center"
                    disabled={isProcessing || !previewImage}
                  >
                    {isProcessing ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-2" />
                        Processing...
                      </>
                    ) : (
                      'Process Invoice'
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Camera Capture */}
            {uploadMethod === 'camera' && (
              <div className="space-y-4">
                {!stream ? (
                  <div className="text-center py-8">
                    <CameraIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-4">Click to start camera</p>
                    <button
                      onClick={startCamera}
                      className="btn-primary"
                    >
                      Start Camera
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-64 object-cover rounded-lg"
                      />
                      <canvas
                        ref={canvasRef}
                        className="hidden"
                      />
                    </div>
                    
                    <div className="flex justify-center space-x-3">
                      <button
                        onClick={capturePhoto}
                        className="btn-primary flex items-center"
                      >
                        <PhotoIcon className="h-5 w-5 mr-2" />
                        Capture Photo
                      </button>
                      <button
                        onClick={stopCamera}
                        className="btn-secondary"
                      >
                        Stop Camera
                      </button>
                    </div>

                    {previewImage && (
                      <div className="mt-4">
                        <label className="form-label">Captured Image</label>
                        <img
                          src={previewImage}
                          alt="Captured invoice"
                          className="w-full h-64 object-contain border rounded-lg"
                        />
                        <div className="flex justify-end space-x-3 mt-4">
                          <button
                            onClick={() => setPreviewImage(null)}
                            className="btn-secondary"
                          >
                            Retake
                          </button>
                          <button
                            onClick={() => processInvoice({ invoice: [new File([], 'captured.jpg')] })}
                            className="btn-primary flex items-center"
                            disabled={isProcessing}
                          >
                            {isProcessing ? (
                              <>
                                <LoadingSpinner size="sm" className="mr-2" />
                                Processing...
                              </>
                            ) : (
                              'Process Invoice'
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Extracted Products Review */
          <div>
            <div className="mb-4">
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                Extracted Data
              </h4>
              <p className="text-sm text-gray-600">
                Review the extracted products and returns, then click Save to add them to your inventory.
              </p>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-4 mb-6">
              {/* Products Section */}
              {extractedProducts && extractedProducts.length > 0 && (
                <div>
                  <h5 className="font-medium text-green-700 mb-2 flex items-center">
                    <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                    Products ({extractedProducts.length})
                  </h5>
                  <div className="space-y-2">
                    {extractedProducts.map((product, index) => (
                      <div key={index} className="border rounded-lg p-3 bg-green-50 border-green-200">
                        {editingProduct && editingProduct.index === index ? (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                              <input
                                type="text"
                                value={editingProduct.name}
                                onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                              <input
                                type="text"
                                value={editingProduct.description || ''}
                                onChange={(e) => setEditingProduct({...editingProduct, description: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Price (Rs.)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editingProduct.purchasePrice}
                                  onChange={(e) => setEditingProduct({...editingProduct, purchasePrice: e.target.value})}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                                <input
                                  type="number"
                                  value={editingProduct.quantity}
                                  onChange={(e) => setEditingProduct({...editingProduct, quantity: e.target.value})}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                <input
                                  type="text"
                                  value={editingProduct.category || ''}
                                  onChange={(e) => setEditingProduct({...editingProduct, category: e.target.value})}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                                <input
                                  type="text"
                                  value={editingProduct.sku || ''}
                                  onChange={(e) => setEditingProduct({...editingProduct, sku: e.target.value})}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={handleCancelEdit}
                                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleSaveProductEdit}
                                className="px-3 py-1 text-sm bg-pink-500 text-white rounded hover:bg-pink-600"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h6 className="font-medium text-gray-900">{product.name}</h6>
                              {product.description && (
                                <p className="text-sm text-gray-600">{product.description}</p>
                              )}
                              <div className="flex space-x-4 mt-2 text-sm">
                                <span>Price: <strong>Rs. {product.purchasePrice}</strong></span>
                                <span>Qty: <strong>{product.quantity}</strong></span>
                                {product.category && (
                                  <span>Category: <strong>{product.category}</strong></span>
                                )}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleEditProduct(index)}
                                className="text-blue-600 hover:text-blue-800 text-sm"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(index)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Returns Section */}
              {extractedReturns && extractedReturns.length > 0 && (
                <div>
                  <h5 className="font-medium text-red-700 mb-2 flex items-center">
                    <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                    Returns ({extractedReturns.length})
                  </h5>
                  <div className="space-y-2">
                    {extractedReturns.map((returnItem, index) => (
                      <div key={index} className="border rounded-lg p-3 bg-red-50 border-red-200">
                        {editingReturn && editingReturn.index === index ? (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                              <input
                                type="text"
                                value={editingReturn.name}
                                onChange={(e) => setEditingReturn({...editingReturn, name: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                              <input
                                type="text"
                                value={editingReturn.description || ''}
                                onChange={(e) => setEditingReturn({...editingReturn, description: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Price (Rs.)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editingReturn.purchasePrice}
                                  onChange={(e) => setEditingReturn({...editingReturn, purchasePrice: e.target.value})}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                                <input
                                  type="number"
                                  value={editingReturn.quantity}
                                  onChange={(e) => setEditingReturn({...editingReturn, quantity: e.target.value})}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                                <input
                                  type="text"
                                  value={editingReturn.reason || ''}
                                  onChange={(e) => setEditingReturn({...editingReturn, reason: e.target.value})}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                                <input
                                  type="text"
                                  value={editingReturn.sku || ''}
                                  onChange={(e) => setEditingReturn({...editingReturn, sku: e.target.value})}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={handleCancelEdit}
                                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={handleSaveReturnEdit}
                                className="px-3 py-1 text-sm bg-pink-500 text-white rounded hover:bg-pink-600"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <h6 className="font-medium text-gray-900">{returnItem.productName || returnItem.name}</h6>
                              {returnItem.description && (
                                <p className="text-sm text-gray-600">{returnItem.description}</p>
                              )}
                              <div className="flex space-x-4 mt-2 text-sm">
                                <span>Price: <strong>Rs. {returnItem.purchasePrice}</strong></span>
                                <span>Qty: <strong>{returnItem.quantity}</strong></span>
                                {returnItem.reason && (
                                  <span>Reason: <strong>{returnItem.reason}</strong></span>
                                )}
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleEditReturn(index)}
                                className="text-blue-600 hover:text-blue-800 text-sm"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteReturn(index)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center mb-4">
              <div className="flex space-x-2">
                <button
                  onClick={() => {
                    const newProduct = {
                      name: 'New Product',
                      description: '',
                      purchasePrice: 0,
                      quantity: 1,
                      category: '',
                      sku: ''
                    }
                    setExtractedProducts([...extractedProducts, newProduct])
                    setEditingProduct({ ...newProduct, index: extractedProducts.length })
                  }}
                  className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                >
                  + Add Product
                </button>
                <button
                  onClick={() => {
                    const newReturn = {
                      name: 'New Return',
                      description: '',
                      purchasePrice: 0,
                      quantity: 1,
                      reason: 'INVOICE_RETURN',
                      sku: ''
                    }
                    setExtractedReturns([...extractedReturns, newReturn])
                    setEditingReturn({ ...newReturn, index: extractedReturns.length })
                  }}
                  className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                >
                  + Add Return
                </button>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setExtractedProducts(null)}
                  className="btn-secondary"
                  disabled={isProcessing}
                >
                  Back
                </button>
                <button
                  onClick={saveProducts}
                  className="btn-primary flex items-center"
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Saving...
                    </>
                  ) : (
                    extractedReturns && extractedReturns.length > 0
                      ? `Save ${extractedProducts.length} Products & ${extractedReturns.length} Returns`
                      : `Save ${extractedProducts.length} Products`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default InvoiceUploadModal
