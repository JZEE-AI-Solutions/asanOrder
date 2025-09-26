import { useState, useRef } from 'react'
import { CameraIcon, PhotoIcon, XMarkIcon, TrashIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from './LoadingSpinner'

const ProductImageUpload = ({ 
  purchaseItem, 
  onImageUploaded, 
  onClose, 
  isOpen = false 
}) => {
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadMethod, setUploadMethod] = useState('file') // 'file' or 'camera'
  const [previewImage, setPreviewImage] = useState(null)
  const [stream, setStream] = useState(null)
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

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
        const file = new File([blob], 'captured-product.jpg', { type: 'image/jpeg' })
        const reader = new FileReader()
        reader.onload = (e) => {
          setPreviewImage(e.target.result)
          stopCamera()
        }
        reader.readAsDataURL(file)
      }, 'image/jpeg', 0.8)
    }
  }

  const uploadImage = async () => {
    if (!previewImage) {
      toast.error('Please select or capture an image')
      return
    }

    setIsProcessing(true)
    try {
      let imageData, mimeType

      if (uploadMethod === 'file') {
        const file = fileInputRef.current?.files?.[0]
        if (!file) {
          toast.error('Please select an image file')
          setIsProcessing(false)
          return
        }
        
        const reader = new FileReader()
        reader.onload = (e) => {
          const base64 = e.target.result.split(',')[1]
          uploadImageToServer(base64, file.type)
        }
        reader.readAsDataURL(file)
      } else {
        // For camera capture, we need to convert the preview image to base64
        const canvas = canvasRef.current
        if (canvas) {
          const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
          uploadImageToServer(base64, 'image/jpeg')
        } else {
          toast.error('No image captured')
          setIsProcessing(false)
        }
      }
    } catch (error) {
      console.error('Error processing image:', error)
      toast.error('Failed to process image')
      setIsProcessing(false)
    }
  }

  const uploadImageToServer = async (base64Data, mimeType) => {
    try {
      console.log('Uploading image for purchase item:', purchaseItem.id)
      console.log('Image data length:', base64Data.length)
      console.log('MIME type:', mimeType)
      
      const response = await api.post(`/images/purchase-item/${purchaseItem.id}`, {
        imageData: base64Data,
        mimeType: mimeType
      })

      console.log('Upload response:', response.data)
      toast.success('Product image uploaded successfully!')
      onImageUploaded(response.data)
      handleClose()
    } catch (error) {
      console.error('Error uploading image:', error)
      console.error('Error response:', error.response?.data)
      toast.error(error.response?.data?.error || 'Failed to upload image')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    stopCamera()
    setPreviewImage(null)
    setUploadMethod('file')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-4 mx-auto p-5 border w-11/12 max-w-lg shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Upload Product Image
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Product: <span className="font-semibold">{purchaseItem.name}</span>
          </p>
        </div>

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
              <PhotoIcon className="h-6 w-6 mx-auto mb-2" />
              <div className="font-medium">Gallery</div>
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
              <div className="font-medium">Camera</div>
              <div className="text-sm text-gray-600">Take photo</div>
            </button>
          </div>
        </div>

        {/* File Upload */}
        {uploadMethod === 'file' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Image
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100"
              />
            </div>

            {previewImage && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preview
                </label>
                <div className="relative">
                  <img
                    src={previewImage}
                    alt="Product preview"
                    className="w-full h-64 object-contain border rounded-lg"
                  />
                  <button
                    onClick={() => setPreviewImage(null)}
                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Captured Image
                    </label>
                    <div className="relative">
                      <img
                        src={previewImage}
                        alt="Captured product"
                        className="w-full h-64 object-contain border rounded-lg"
                      />
                      <button
                        onClick={() => setPreviewImage(null)}
                        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 mt-6">
          <button
            onClick={handleClose}
            className="btn-secondary"
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            onClick={uploadImage}
            className="btn-primary flex items-center"
            disabled={isProcessing || !previewImage}
          >
            {isProcessing ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Uploading...
              </>
            ) : (
              'Upload Image'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProductImageUpload
