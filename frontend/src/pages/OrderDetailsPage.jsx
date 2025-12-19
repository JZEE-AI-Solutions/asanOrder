import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
    ArrowLeftIcon, 
    CheckIcon, 
    UserIcon, 
    CurrencyDollarIcon, 
    PhotoIcon,
    PencilIcon,
    XMarkIcon,
    PrinterIcon
} from '@heroicons/react/24/outline'
import api, { getImageUrl } from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ModernLayout from '../components/ModernLayout'
import OrderProductSelector from '../components/OrderProductSelector'

const OrderDetailsPage = () => {
    const { orderId } = useParams()
    const navigate = useNavigate()
    const [order, setOrder] = useState(null)
    const [profit, setProfit] = useState(null)
    const [loading, setLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)
    const [saving, setSaving] = useState(false)
    
    // Edit state
    const [selectedProducts, setSelectedProducts] = useState([])
    const [productQuantities, setProductQuantities] = useState({})
    const [productPrices, setProductPrices] = useState({})
    const [paymentAmount, setPaymentAmount] = useState(null)
    const [formData, setFormData] = useState({})
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [paymentInput, setPaymentInput] = useState('')
    const [processingPayment, setProcessingPayment] = useState(false)

    useEffect(() => {
        fetchOrderDetails()
    }, [orderId])

    const fetchOrderDetails = async () => {
        try {
            setLoading(true)
            const response = await api.get(`/order/${orderId}`)
            const orderData = response.data.order
            setOrder(orderData)
            setProfit(response.data.profit || null)
            
            // Initialize edit state
            const parsedFormData = parseJSON(orderData.formData)
            setFormData(parsedFormData)
            
            if (orderData.selectedProducts) {
                const products = parseJSON(orderData.selectedProducts)
                setSelectedProducts(products)
            }
            
            if (orderData.productQuantities) {
                const quantities = parseJSON(orderData.productQuantities)
                setProductQuantities(quantities)
            }
            
            if (orderData.productPrices) {
                const prices = parseJSON(orderData.productPrices)
                setProductPrices(prices)
            }
            
            setPaymentAmount(orderData.paymentAmount !== null && orderData.paymentAmount !== undefined ? orderData.paymentAmount : null)
        } catch (error) {
            toast.error('Failed to fetch order details')
            navigate('/business/orders')
        } finally {
            setLoading(false)
        }
    }

    const parseJSON = (data) => {
        if (!data) return {}
        if (typeof data === 'object') return data
        try {
            return JSON.parse(data)
        } catch (e) {
            console.error('Failed to parse JSON:', e)
            return {}
        }
    }

    const handleProductQuantityChange = (productId, quantity) => {
        setProductQuantities(prev => ({
            ...prev,
            [productId]: Math.max(1, quantity)
        }))
    }

    const handleProductPriceChange = (productId, price) => {
        setProductPrices(prev => ({
            ...prev,
            [productId]: Math.max(0, parseFloat(price) || 0)
        }))
    }

    const handleProductsChange = (newSelectedProducts) => {
        setSelectedProducts(newSelectedProducts)
        
        // Clean up quantities and prices for removed products
        const newQuantities = { ...productQuantities }
        const newPrices = { ...productPrices }
        
        Object.keys(newQuantities).forEach(productId => {
            if (!newSelectedProducts.some(p => p.id === productId)) {
                delete newQuantities[productId]
            }
        })
        
        Object.keys(newPrices).forEach(productId => {
            if (!newSelectedProducts.some(p => p.id === productId)) {
                delete newPrices[productId]
            }
        })
        
        setProductQuantities(newQuantities)
        setProductPrices(newPrices)
    }

    const calculateProductsTotal = () => {
        let total = 0
        selectedProducts.forEach(product => {
            const quantity = productQuantities[product.id] || 1
            const price = productPrices[product.id] || 0
            total += quantity * price
        })
        return total
    }

    const handleSaveOrder = async () => {
        try {
            setSaving(true)
            
            // If paymentAmount is null/undefined, use products total, otherwise use the value (including 0)
            const finalPaymentAmount = paymentAmount !== null && paymentAmount !== undefined 
                ? paymentAmount 
                : (selectedProducts.length > 0 ? calculateProductsTotal() : 0)
            
            const updatedOrder = {
                formData: JSON.stringify(formData),
                selectedProducts: JSON.stringify(selectedProducts),
                productQuantities: JSON.stringify(productQuantities),
                productPrices: JSON.stringify(productPrices),
                paymentAmount: finalPaymentAmount
            }

            await api.put(`/order/${orderId}`, updatedOrder)
            
            toast.success('Order updated successfully!')
            setIsEditing(false)
            fetchOrderDetails()
        } catch (error) {
            console.error('Failed to update order:', error)
            toast.error(error.response?.data?.error || 'Failed to update order')
        } finally {
            setSaving(false)
        }
    }

    const handleCancelEdit = () => {
        setIsEditing(false)
        fetchOrderDetails() // Reset to original state
    }

    const confirmOrder = async () => {
        try {
            await api.post(`/order/${orderId}/confirm`)
            toast.success('Order confirmed successfully!')
            fetchOrderDetails()
        } catch (error) {
            toast.error('Failed to confirm order')
        }
    }

    const dispatchOrder = async () => {
        try {
            await api.post(`/order/${orderId}/dispatch`)
            toast.success('Order dispatched successfully!')
            fetchOrderDetails()
        } catch (error) {
            console.error('Dispatch order error:', error)
            if (error.response?.data?.error) {
                toast.error(error.response.data.error)
            } else {
                toast.error('Failed to dispatch order')
            }
        }
    }

    const calculateOrderTotal = () => {
        if (!order) return 0
        const selectedProducts = parseJSON(order.selectedProducts) || []
        const productQuantities = parseJSON(order.productQuantities) || {}
        const productPrices = parseJSON(order.productPrices) || {}
        
        let total = 0
        selectedProducts.forEach(product => {
            const quantity = productQuantities[product.id] || product.quantity || 1
            const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0
            total += price * quantity
        })
        return total
    }

    const getPaymentStatus = () => {
        if (!order) return { total: 0, paid: 0, remaining: 0, isFullyPaid: false, isPartiallyPaid: false, isUnpaid: true }
        const total = calculateOrderTotal()
        const paid = order.paymentAmount || 0
        const remaining = total - paid
        
        return {
            total,
            paid,
            remaining,
            isFullyPaid: paid >= total,
            isPartiallyPaid: paid > 0 && paid < total,
            isUnpaid: paid === 0
        }
    }

    const handleReceivePayment = () => {
        if (!order) return
        // Calculate total order amount
        const paymentStatus = getPaymentStatus()
        
        // Set initial payment input to remaining balance or total
        setPaymentInput(paymentStatus.remaining > 0 ? paymentStatus.remaining.toString() : paymentStatus.total.toString())
        setShowPaymentModal(true)
    }

    const handleSubmitPayment = async () => {
        const paymentValue = parseFloat(paymentInput) || 0
        if (paymentValue <= 0) {
            toast.error('Payment amount must be greater than 0')
            return
        }

        setProcessingPayment(true)
        try {
            // Calculate total order amount
            const paymentStatus = getPaymentStatus()

            // Add to existing payment amount
            const currentPayment = order.paymentAmount || 0
            const newPaymentAmount = currentPayment + paymentValue

            // Update payment amount
            await api.put(`/order/${orderId}`, {
                paymentAmount: newPaymentAmount
            })

            // If full payment received, show success message
            const isFullyPaid = newPaymentAmount >= paymentStatus.total
            if (isFullyPaid) {
                toast.success(`Payment of Rs. ${paymentValue.toFixed(2)} received. Order is now fully paid!`)
            } else {
                toast.success(`Payment of Rs. ${paymentValue.toFixed(2)} received. Remaining balance: Rs. ${(paymentStatus.total - newPaymentAmount).toFixed(2)}`)
            }

            setShowPaymentModal(false)
            setPaymentInput('')
            fetchOrderDetails()
        } catch (error) {
            console.error('Receive payment error:', error)
            if (error.response?.data?.error) {
                toast.error(error.response.data.error)
            } else {
                toast.error('Failed to record payment')
            }
        } finally {
            setProcessingPayment(false)
        }
    }

    const handlePrintShippingReceipt = () => {
        const printWindow = window.open('', '_blank')
        if (!printWindow) {
            toast.error('Please allow popups to print the receipt')
            return
        }

        const formData = parseJSON(order.formData)
        const selectedProducts = parseJSON(order.selectedProducts) || []
        const productQuantities = parseJSON(order.productQuantities) || {}
        const productPrices = parseJSON(order.productPrices) || {}

        // Calculate totals
        let totalAmount = 0
        selectedProducts.forEach(product => {
            const quantity = productQuantities[product.id] || product.quantity || 1
            const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0
            totalAmount += price * quantity
        })

        // Get recipient details
        const customerName = formData['Customer Name'] || formData['Name'] || formData['Full Name'] || 'N/A'
        const phoneNumber = formData['Phone Number'] || formData['Mobile Number'] || formData['Contact Number'] || formData['Phone'] || 'N/A'
        const email = formData['Email Address'] || formData['Email'] || ''
        const shippingAddress = formData['Shipping Address'] || formData['Address'] || formData['Delivery Address'] || 'N/A'

        printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Shipping Receipt - Order #${order.orderNumber}</title>
    <style>
        @page {
            size: A5;
            margin: 10mm;
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Arial, sans-serif;
            font-size: 11px;
            line-height: 1.4;
            color: #000;
            background: #fff;
        }
        .receipt {
            width: 100%;
            max-width: 148mm;
            margin: 0 auto;
            padding: 8mm;
        }
        .header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 8px;
            margin-bottom: 12px;
        }
        .header h1 {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 4px;
        }
        .header p {
            font-size: 10px;
            color: #666;
        }
        .section {
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #ddd;
        }
        .section:last-child {
            border-bottom: none;
        }
        .section-title {
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 6px;
            text-transform: uppercase;
            color: #000;
        }
        .info-row {
            display: flex;
            margin-bottom: 4px;
            font-size: 10px;
        }
        .info-label {
            font-weight: bold;
            width: 35mm;
            flex-shrink: 0;
        }
        .info-value {
            flex: 1;
        }
        .products-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
            font-size: 9px;
        }
        .products-table th {
            background: #f0f0f0;
            padding: 4px;
            text-align: left;
            font-weight: bold;
            border: 1px solid #ddd;
        }
        .products-table td {
            padding: 4px;
            border: 1px solid #ddd;
        }
        .products-table tr:nth-child(even) {
            background: #f9f9f9;
        }
        .text-right {
            text-align: right;
        }
        .total-row {
            font-weight: bold;
            font-size: 11px;
            background: #f0f0f0;
        }
        .footer {
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px solid #000;
            text-align: center;
            font-size: 9px;
            color: #666;
        }
        @media print {
            body {
                margin: 0;
                padding: 0;
            }
            .receipt {
                padding: 0;
            }
        }
    </style>
</head>
<body>
    <div class="receipt">
        <div class="header">
            <h1>${order.tenant?.businessName || 'Business Name'}</h1>
            <p>SHIPPING RECEIPT</p>
        </div>

        <div class="section">
            <div class="section-title">Order Information</div>
            <div class="info-row">
                <span class="info-label">Order Number:</span>
                <span class="info-value">#${order.orderNumber}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Order Date:</span>
                <span class="info-value">${new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="info-value">${order.status}</span>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Recipient Details</div>
            <div class="info-row">
                <span class="info-label">Name:</span>
                <span class="info-value">${customerName}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Phone:</span>
                <span class="info-value">${phoneNumber}</span>
            </div>
            ${email ? `
            <div class="info-row">
                <span class="info-label">Email:</span>
                <span class="info-value">${email}</span>
            </div>
            ` : ''}
        </div>

        <div class="section">
            <div class="section-title">Shipping Address</div>
            <div class="info-value" style="margin-top: 4px; white-space: pre-line;">${shippingAddress}</div>
        </div>

        <div class="section">
            <div class="section-title">Order Items</div>
            <table class="products-table">
                <thead>
                    <tr>
                        <th style="width: 40%;">Product</th>
                        <th style="width: 15%;" class="text-right">Qty</th>
                        <th style="width: 22%;" class="text-right">Price</th>
                        <th style="width: 23%;" class="text-right">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${selectedProducts.map(product => {
                        const quantity = productQuantities[product.id] || product.quantity || 1
                        const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0
                        const total = price * quantity
                        return `
                            <tr>
                                <td>${product.name || 'N/A'}</td>
                                <td class="text-right">${quantity}</td>
                                <td class="text-right">Rs. ${price.toFixed(2)}</td>
                                <td class="text-right">Rs. ${total.toFixed(2)}</td>
                            </tr>
                        `
                    }).join('')}
                    <tr class="total-row">
                        <td colspan="3" class="text-right"><strong>Total Amount:</strong></td>
                        <td class="text-right"><strong>Rs. ${totalAmount.toFixed(2)}</strong></td>
                    </tr>
                    ${order.paymentAmount !== null && order.paymentAmount !== undefined ? `
                    <tr>
                        <td colspan="3" class="text-right">Paid Amount:</td>
                        <td class="text-right">Rs. ${parseFloat(order.paymentAmount).toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td colspan="3" class="text-right"><strong>Balance:</strong></td>
                        <td class="text-right"><strong>Rs. ${(totalAmount - parseFloat(order.paymentAmount)).toFixed(2)}</strong></td>
                    </tr>
                    ` : ''}
                </tbody>
            </table>
        </div>

        <div class="footer">
            <p>Thank you for your order!</p>
            <p>For inquiries, contact: ${order.tenant?.whatsappNumber || 'N/A'}</p>
        </div>
    </div>
</body>
</html>
        `)

        printWindow.document.close()
        setTimeout(() => {
            printWindow.print()
        }, 250)
    }

    const getStatusBadge = (status) => {
        const styles = {
            PENDING: 'bg-yellow-100 text-yellow-800',
            CONFIRMED: 'bg-green-100 text-green-800',
            DISPATCHED: 'bg-blue-100 text-blue-800',
            CANCELLED: 'bg-red-100 text-red-800',
            COMPLETED: 'bg-purple-100 text-purple-800'
        }
        return `px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${styles[status] || 'bg-gray-100 text-gray-800'}`
    }

    if (loading) {
        return (
            <ModernLayout>
                <LoadingSpinner className="min-h-screen" />
            </ModernLayout>
        )
    }

    if (!order) return null

    const images = order.images ? (typeof order.images === 'string' ? JSON.parse(order.images) : order.images) : []
    const displayFormData = isEditing ? formData : parseJSON(order.formData)

    return (
        <ModernLayout>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => navigate('/business/orders')}
                            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <ArrowLeftIcon className="h-6 w-6" />
                        </button>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                                    Order #{order.orderNumber}
                                </h1>
                                <span className={getStatusBadge(order.status)}>
                                    {order.status}
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                Placed on {new Date(order.createdAt).toLocaleString()}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {!isEditing ? (
                            <>
                                {order.status === 'CONFIRMED' && (
                                    <>
                                        <button
                                            onClick={handlePrintShippingReceipt}
                                            className="btn-primary flex items-center px-6 py-2.5 bg-blue-600 hover:bg-blue-700"
                                        >
                                            <PrinterIcon className="h-5 w-5 mr-2" />
                                            Print Shipping Receipt
                                        </button>
                                        <button
                                            onClick={dispatchOrder}
                                            className="btn-primary flex items-center px-6 py-2.5 bg-green-600 hover:bg-green-700"
                                        >
                                            <CheckIcon className="h-5 w-5 mr-2" />
                                            Dispatch Order
                                        </button>
                                    </>
                                )}
                                {order.status === 'DISPATCHED' && (
                                    <button
                                        onClick={handleReceivePayment}
                                        className="btn-primary flex items-center px-6 py-2.5 bg-purple-600 hover:bg-purple-700"
                                    >
                                        <CurrencyDollarIcon className="h-5 w-5 mr-2" />
                                        Receive Payment
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="btn-secondary flex items-center px-6 py-2.5"
                                >
                                    <PencilIcon className="h-5 w-5 mr-2" />
                                    Edit Order
                                </button>
                                {order.status === 'PENDING' && (
                                    <button
                                        onClick={confirmOrder}
                                        className="btn-primary flex items-center px-6 py-2.5"
                                    >
                                        <CheckIcon className="h-5 w-5 mr-2" />
                                        Confirm Order
                                    </button>
                                )}
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={handleCancelEdit}
                                    className="btn-secondary flex items-center px-6 py-2.5"
                                    disabled={saving}
                                >
                                    <XMarkIcon className="h-5 w-5 mr-2" />
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveOrder}
                                    className="btn-primary flex items-center px-6 py-2.5"
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <>
                                            <LoadingSpinner size="sm" className="mr-2" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <CheckIcon className="h-5 w-5 mr-2" />
                                            Save Changes
                                        </>
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Customer Details */}
                        <div className="card p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                                <UserIcon className="h-5 w-5 mr-2 text-gray-700" />
                                Customer Information
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {Object.entries(displayFormData).map(([key, value]) => {
                                    if (!value || typeof value === 'object' || key === 'Dress Size' || key === 'Dress Quantity') return null
                                    return (
                                        <div key={key}>
                                            <p className="text-sm font-semibold text-gray-700 mb-1">{key}</p>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={value || ''}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, [key]: e.target.value }))}
                                                    className="mt-1 w-full px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                                />
                                            ) : (
                                                <p className="mt-1 text-base text-gray-900 font-semibold">{value}</p>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Products Section */}
                        {(isEditing || selectedProducts.length > 0) && (
                            <div className="card p-6">
                                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                                    <CurrencyDollarIcon className="h-5 w-5 mr-2 text-gray-700" />
                                    Products {selectedProducts.length > 0 && `(${selectedProducts.length})`}
                                </h2>
                                
                                {isEditing ? (
                                    <OrderProductSelector
                                        tenantId={order.tenantId}
                                        selectedProducts={selectedProducts}
                                        productQuantities={productQuantities}
                                        productPrices={productPrices}
                                        onProductsChange={handleProductsChange}
                                        onQuantityChange={handleProductQuantityChange}
                                        onPriceChange={handleProductPriceChange}
                                        maxProducts={50}
                                        showSearch={true}
                                    />
                                ) : (
                                    selectedProducts.length > 0 && (
                                        <div className="space-y-4">
                                            {selectedProducts.map((product) => {
                                                const quantity = productQuantities[product.id] || 1
                                                const price = productPrices[product.id] || 0
                                                const total = quantity * price
                                                
                                                return (
                                                    <div key={product.id} className="border-2 border-gray-300 rounded-lg p-4 bg-white shadow-sm">
                                                        <div className="flex items-start space-x-4">
                                                            <img
                                                                src={getImageUrl('product', product.id)}
                                                                alt={product.name}
                                                                className="w-16 h-16 rounded-lg object-cover border-2 border-gray-300"
                                                                onError={(e) => {
                                                                    e.target.style.display = 'none'
                                                                }}
                                                            />
                                                            <div className="flex-1">
                                                                <h3 className="font-bold text-gray-900 text-lg">{product.name}</h3>
                                                                {product.description && (
                                                                    <p className="text-sm text-gray-700 mt-1">{product.description}</p>
                                                                )}
                                                                {product.category && (
                                                                    <span className="inline-block mt-2 px-3 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full">
                                                                        {product.category}
                                                                    </span>
                                                                )}
                                                                <div className="mt-3 grid grid-cols-3 gap-4">
                                                                    <div>
                                                                        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Quantity</p>
                                                                        <p className="text-base font-bold text-gray-900 mt-1">{quantity}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Unit Price</p>
                                                                        <p className="text-base font-bold text-gray-900 mt-1">Rs. {parseFloat(price).toLocaleString()}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Total</p>
                                                                        <p className="text-base font-bold text-green-600 mt-1">Rs. {total.toLocaleString()}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                            <div className="mt-4 pt-4 border-t-2 border-gray-300">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-lg font-bold text-gray-900">Products Total:</span>
                                                    <span className="text-2xl font-bold text-green-600">
                                                        Rs. {calculateProductsTotal().toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        )}

                        {/* Order Items / Images */}
                        <div className="card p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                                <PhotoIcon className="h-5 w-5 mr-2 text-gray-700" />
                                Order Images
                            </h2>

                            {images.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {images.map((image, index) => (
                                        <div key={index} className="relative group aspect-square">
                                            <img
                                                src={getImageUrl('order-image', image)}
                                                alt={`Item ${index + 1}`}
                                                className="w-full h-full object-cover rounded-lg border border-gray-200 cursor-pointer hover:shadow-md transition-all"
                                                onClick={() => window.open(getImageUrl('order-image', image), '_blank')}
                                                onError={(e) => {
                                                    if (!e.target.src.includes('localhost:5000')) {
                                                        e.target.src = `http://localhost:5000/uploads/${image}`
                                                    } else {
                                                        e.target.style.display = 'none'
                                                    }
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-700 font-medium text-center py-4">No images attached to this order.</p>
                            )}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Profit Info - Only show for confirmed/dispatched/completed orders */}
                        {profit && profit.profit !== undefined && ['CONFIRMED', 'DISPATCHED', 'COMPLETED'].includes(order.status) && (
                            <div className="card p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
                                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                                    <CurrencyDollarIcon className="h-5 w-5 mr-2 text-green-700" />
                                    Profit Analysis
                                </h2>
                                <div className="space-y-3">
                                    <div className="bg-white rounded-lg p-4 border border-green-200">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm font-semibold text-gray-600">Total Revenue:</span>
                                            <span className="text-lg font-bold text-blue-600">Rs. {profit.totalRevenue.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm font-semibold text-gray-600">Total Cost:</span>
                                            <span className="text-lg font-bold text-red-600">Rs. {profit.totalCost.toFixed(2)}</span>
                                        </div>
                                        <div className="border-t border-gray-300 pt-2 mt-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm font-bold text-gray-700">Net Profit:</span>
                                                <span className={`text-xl font-bold ${profit.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    Rs. {profit.profit.toFixed(2)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center mt-1">
                                                <span className="text-xs text-gray-500">Profit Margin:</span>
                                                <span className={`text-sm font-semibold ${profit.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {profit.profitMargin.toFixed(2)}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Payment Info */}
                        <div className="card p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                                <CurrencyDollarIcon className="h-5 w-5 mr-2 text-gray-700" />
                                Payment Details
                            </h2>

                            {selectedProducts.length > 0 && (() => {
                                const paymentStatus = getPaymentStatus()
                                return (
                                    <div className="mb-4 space-y-3">
                                        <div className="text-center bg-blue-100 rounded-xl p-4 border-2 border-blue-300 shadow-sm">
                                            <p className="text-sm text-blue-800 font-bold mb-1 uppercase tracking-wide">Products Total</p>
                                            <p className="text-2xl font-bold text-blue-700">
                                                Rs. {paymentStatus.total.toFixed(2)}
                                            </p>
                                        </div>
                                        {order.status === 'DISPATCHED' && (
                                            <div className="bg-gray-50 rounded-lg p-4 space-y-2 border border-gray-300">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-600 font-semibold">Paid Amount:</span>
                                                    <span className="font-bold text-green-600">Rs. {paymentStatus.paid.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-gray-600 font-semibold">Remaining Balance:</span>
                                                    <span className={`font-bold ${paymentStatus.remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                        Rs. {paymentStatus.remaining.toFixed(2)}
                                                    </span>
                                                </div>
                                                {paymentStatus.isFullyPaid && (
                                                    <div className="mt-2 pt-2 border-t border-gray-300">
                                                        <p className="text-sm font-bold text-green-600 text-center">✓ Fully Paid</p>
                                                    </div>
                                                )}
                                                {paymentStatus.isPartiallyPaid && (
                                                    <div className="mt-2 pt-2 border-t border-gray-300">
                                                        <p className="text-sm font-bold text-yellow-600 text-center">⚠ Partially Paid</p>
                                                    </div>
                                                )}
                                                {paymentStatus.isUnpaid && (
                                                    <div className="mt-2 pt-2 border-t border-gray-300">
                                                        <p className="text-sm font-bold text-red-600 text-center">✗ Unpaid</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })()}

                            <div className="mb-6">
                                <label className="block text-sm font-bold text-gray-900 mb-2">
                                    Payment Amount (Rs.)
                                </label>
                                {isEditing ? (
                                    <div className="space-y-2">
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={paymentAmount === null || paymentAmount === undefined ? '' : paymentAmount}
                                            onChange={(e) => {
                                                const value = e.target.value
                                                // Allow empty string, 0, or any positive number
                                                if (value === '' || value === null || value === undefined) {
                                                    setPaymentAmount(null)
                                                } else {
                                                    const numValue = parseFloat(value)
                                                    setPaymentAmount(isNaN(numValue) ? null : Math.max(0, numValue))
                                                }
                                            }}
                                            className="w-full px-4 py-3 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-lg font-bold"
                                            placeholder="Enter payment amount"
                                        />
                                        {selectedProducts.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setPaymentAmount(calculateProductsTotal())}
                                                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
                                            >
                                                Set as Products Total (Rs. {calculateProductsTotal().toLocaleString()})
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setPaymentAmount(0)}
                                            className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors text-sm"
                                        >
                                            Set to Zero (Rs. 0)
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center bg-green-100 rounded-xl p-6 border-2 border-green-300 shadow-sm">
                                        <p className="text-sm text-green-800 font-bold mb-2 uppercase tracking-wide">Total Amount</p>
                                        <p className="text-4xl font-bold text-green-700">
                                            Rs. {parseFloat(paymentAmount !== null && paymentAmount !== undefined ? paymentAmount : (order.paymentAmount || 0)).toLocaleString()}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {order.paymentReceipt && (
                                <div>
                                    <p className="text-sm font-bold text-gray-900 mb-2">Payment Receipt</p>
                                    <div className="relative group rounded-lg overflow-hidden border-2 border-gray-300 shadow-sm">
                                        <img
                                            src={order.paymentReceipt}
                                            alt="Receipt"
                                            className="w-full h-auto cursor-pointer hover:opacity-95 transition-opacity"
                                            onClick={() => window.open(order.paymentReceipt, '_blank')}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Order Meta */}
                        <div className="card p-6">
                            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
                                Order Metadata
                            </h2>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                                    <span className="text-gray-700 font-semibold">Order ID</span>
                                    <span className="font-mono text-gray-900 font-bold">{order.id.slice(0, 8)}...</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                                    <span className="text-gray-700 font-semibold">Form Source</span>
                                    <span className="text-gray-900 font-bold">{order.form?.name || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-gray-700 font-semibold">Last Updated</span>
                                    <span className="text-gray-900 font-bold">{new Date(order.updatedAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment Modal */}
            {showPaymentModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
                    <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Receive Payment</h3>
                            <button
                                onClick={() => {
                                    setShowPaymentModal(false)
                                    setPaymentInput('')
                                }}
                                className="text-gray-400 hover:text-gray-600"
                                disabled={processingPayment}
                            >
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Payment Summary */}
                            {(() => {
                                const paymentStatus = getPaymentStatus()
                                return (
                                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Total Order Amount:</span>
                                            <span className="font-bold text-gray-900">Rs. {paymentStatus.total.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Already Paid:</span>
                                            <span className="font-bold text-green-600">Rs. {paymentStatus.paid.toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm border-t border-gray-300 pt-2">
                                            <span className="text-gray-600 font-semibold">Remaining Balance:</span>
                                            <span className="font-bold text-red-600">Rs. {paymentStatus.remaining.toFixed(2)}</span>
                                        </div>
                                    </div>
                                )
                            })()}

                            {/* Payment Input */}
                            <div>
                                <label className="block text-sm font-bold text-gray-900 mb-2">
                                    Payment Amount (Rs.)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={paymentInput}
                                    onChange={(e) => setPaymentInput(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white text-gray-900 text-lg font-semibold"
                                    placeholder="0.00"
                                    disabled={processingPayment}
                                    autoFocus
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Enter the payment amount received
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowPaymentModal(false)
                                        setPaymentInput('')
                                    }}
                                    className="flex-1 btn-secondary px-6 py-3"
                                    disabled={processingPayment}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmitPayment}
                                    className="flex-1 btn-primary px-6 py-3 bg-purple-600 hover:bg-purple-700"
                                    disabled={processingPayment || !paymentInput || parseFloat(paymentInput) <= 0}
                                >
                                    {processingPayment ? (
                                        <>
                                            <LoadingSpinner size="sm" className="mr-2" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <CurrencyDollarIcon className="h-5 w-5 mr-2" />
                                            Record Payment
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </ModernLayout>
    )
}

export default OrderDetailsPage
