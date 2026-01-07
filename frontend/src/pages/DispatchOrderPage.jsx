import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, CheckIcon, PrinterIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ModernLayout from '../components/ModernLayout'

const DispatchOrderPage = () => {
    const { orderId } = useParams()
    const navigate = useNavigate()
    const [order, setOrder] = useState(null)
    const [loading, setLoading] = useState(true)
    const [logisticsCompanies, setLogisticsCompanies] = useState([])
    
    // Dispatch form state
    const [actualShippingCost, setActualShippingCost] = useState(null)
    const [dispatchLogisticsCompanyId, setDispatchLogisticsCompanyId] = useState(null)
    const [dispatchCodFee, setDispatchCodFee] = useState(null)
    const [dispatchCodFeeOverride, setDispatchCodFeeOverride] = useState(false)
    const [dispatchManualCodFee, setDispatchManualCodFee] = useState(null)
    const [dispatchCodFeeCalculationDetails, setDispatchCodFeeCalculationDetails] = useState(null)
    const [dispatchReceiptType, setDispatchReceiptType] = useState('auto')
    const [dispatching, setDispatching] = useState(false)

    useEffect(() => {
        fetchOrderDetails()
        fetchLogisticsCompanies()
    }, [orderId])

    const fetchOrderDetails = async () => {
        try {
            setLoading(true)
            const response = await api.get(`/order/${orderId}`)
            const orderData = response.data.order
            setOrder(orderData)
            
            // Initialize form with order data
            setActualShippingCost(orderData.shippingCharges || null)
            setDispatchLogisticsCompanyId(orderData.logisticsCompanyId || null)
            setDispatchCodFee(orderData.codFee || null)
            
            // Auto-determine receipt type based on COD
            const codAmount = calculateCodAmount(orderData)
            const hasCodAmount = codAmount > 0
            setDispatchReceiptType(hasCodAmount ? 'withPayment' : 'withoutPayment')
        } catch (error) {
            console.error('Failed to fetch order details:', error)
            toast.error('Failed to load order details')
            navigate(`/business/orders/${orderId}`)
        } finally {
            setLoading(false)
        }
    }

    const fetchLogisticsCompanies = async () => {
        try {
            const response = await api.get('/accounting/logistics-companies')
            if (response.data?.success) {
                setLogisticsCompanies(response.data.data || [])
            } else {
                setLogisticsCompanies(response.data.logisticsCompanies || [])
            }
        } catch (error) {
            console.error('Failed to fetch logistics companies:', error)
        }
    }

    const calculateCodAmount = (orderData = order) => {
        if (!orderData) return 0
        
        let productsTotal = 0
        try {
            const selectedProducts = typeof orderData.selectedProducts === 'string'
                ? JSON.parse(orderData.selectedProducts)
                : (orderData.selectedProducts || [])
            const productQuantities = typeof orderData.productQuantities === 'string'
                ? JSON.parse(orderData.productQuantities)
                : (orderData.productQuantities || {})
            const productPrices = typeof orderData.productPrices === 'string'
                ? JSON.parse(orderData.productPrices)
                : (orderData.productPrices || {})

            if (Array.isArray(selectedProducts)) {
                selectedProducts.forEach(product => {
                    const quantity = productQuantities[product.id] || product.quantity || 1
                    const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0
                    productsTotal += quantity * price
                })
            }
        } catch (e) {
            console.error('Error calculating products total:', e)
        }

        const shippingCharges = parseFloat(orderData.shippingCharges || 0)
        const paymentAmount = parseFloat(orderData.paymentAmount || 0)
        return (productsTotal + shippingCharges) - paymentAmount
    }

    const calculateDispatchCodFee = async () => {
        if (!dispatchLogisticsCompanyId || !order) {
            setDispatchCodFee(null)
            setDispatchCodFeeCalculationDetails(null)
            return
        }

        try {
            const codAmount = calculateCodAmount()
            if (codAmount <= 0) {
                setDispatchCodFee(0)
                setDispatchCodFeeCalculationDetails(null)
                return
            }

            const response = await api.post(`/accounting/logistics-companies/orders/${orderId}/calculate-cod-fee`, {
                logisticsCompanyId: dispatchLogisticsCompanyId
            })

            // Backend returns: { success: true, data: { codFee, codAmount, calculationType, logisticsCompany } }
            const codFeeData = response.data?.data || response.data
            if (codFeeData && codFeeData.codFee !== undefined) {
                setDispatchCodFee(codFeeData.codFee || 0)
                // Create calculation details from the response
                setDispatchCodFeeCalculationDetails({
                    type: codFeeData.calculationType,
                    company: codFeeData.logisticsCompany,
                    codAmount: codFeeData.codAmount
                })
            } else {
                console.error('Unexpected response structure:', response.data)
                setDispatchCodFee(0)
                setDispatchCodFeeCalculationDetails(null)
            }
        } catch (error) {
            console.error('Failed to calculate COD fee:', error)
            console.error('Error details:', error.response?.data || error.message)
            toast.error('Failed to calculate COD fee. Please try again.')
            setDispatchCodFee(null)
            setDispatchCodFeeCalculationDetails(null)
        }
    }

    useEffect(() => {
        if (dispatchLogisticsCompanyId && !dispatchCodFeeOverride && order) {
            // Calculate COD fee when logistics company is selected
            // Use a small delay to ensure order data is fully loaded
            const timer = setTimeout(() => {
                calculateDispatchCodFee()
            }, 100)
            return () => clearTimeout(timer)
        } else if (!dispatchLogisticsCompanyId) {
            // Reset COD fee if logistics company is deselected
            setDispatchCodFee(null)
            setDispatchCodFeeCalculationDetails(null)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dispatchLogisticsCompanyId, dispatchCodFeeOverride, order?.id])

    const handlePrintShippingReceipt = (includePayment = false) => {
        if (!order) return

        const printWindow = window.open('', '_blank')
        if (!printWindow) {
            toast.error('Please allow popups to print the receipt')
            return
        }

        const parseJSON = (data) => {
            if (!data) return {}
            if (typeof data === 'object') return data
            try {
                return JSON.parse(data)
            } catch (e) {
                return {}
            }
        }

        const formData = parseJSON(order.formData)
        
        // Calculate VPP amount for "With Pending Payment" receipt
        // VPP = (Order Pending Amount of Order + Shipping) - COD fee (or overridden COD fee)
        let vppAmount = null
        if (includePayment) {
            // Calculate products total
            const productsTotal = (() => {
                let total = 0
                try {
                    const selectedProducts = parseJSON(order.selectedProducts) || []
                    const productQuantities = parseJSON(order.productQuantities) || {}
                    const productPrices = parseJSON(order.productPrices) || {}
                    selectedProducts.forEach(product => {
                        const quantity = productQuantities[product.id] || 1
                        const price = productPrices[product.id] || product.currentRetailPrice || 0
                        total += quantity * price
                    })
                } catch (e) {}
                return total
            })()
            
            // Amount received from customer (use verified amount if available, otherwise payment amount)
            const amountReceived = order.paymentVerified && order.verifiedPaymentAmount !== null && order.verifiedPaymentAmount !== undefined
                ? parseFloat(order.verifiedPaymentAmount)
                : parseFloat(order.paymentAmount || 0)
            
            // Calculate order pending amount (products - amount received)
            const orderPendingAmount = productsTotal - amountReceived
            
            // Shipping fee
            const shippingFee = parseFloat(order.shippingCharges || 0)
            
            // Get COD fee (use manual override if set, otherwise calculated COD fee, otherwise order's COD fee, otherwise 0)
            const codFee = dispatchCodFeeOverride && dispatchManualCodFee !== null && dispatchManualCodFee !== undefined
                ? parseFloat(dispatchManualCodFee)
                : (dispatchCodFee !== null && dispatchCodFee !== undefined
                    ? parseFloat(dispatchCodFee)
                    : parseFloat(order.codFee || 0))
            
            // VPP = (Order Pending Amount + Shipping) - COD fee
            vppAmount = (orderPendingAmount + shippingFee) - codFee
        }
        
        // Get recipient details
        const customerName = formData['Customer Name'] || formData['Name'] || formData['Full Name'] || 'N/A'
        const phoneNumber = formData['Phone Number'] || formData['Mobile Number'] || formData['Contact Number'] || formData['Phone'] || 'N/A'
        const shippingAddress = formData['Shipping Address'] || formData['Address'] || formData['Delivery Address'] || 'N/A'
        const city = formData['City'] || formData['City Name'] || ''
        
        // Parse address into lines
        const addressLines = shippingAddress.split(/[,\n]/).map(line => line.trim()).filter(line => line)
        
        // Get products information
        const selectedProducts = parseJSON(order.selectedProducts) || []
        const productQuantities = parseJSON(order.productQuantities) || {}
        
        // Format products for display
        let productsDisplay = ''
        if (selectedProducts.length > 0) {
            const productItems = selectedProducts.map(product => {
                const quantity = productQuantities[product.id] || product.quantity || 1
                return `${product.name || 'N/A'} (${quantity})`
            })
            
            const productsText = productItems.join(', ')
            if (productsText.length <= 60) {
                productsDisplay = productsText
            } else {
                const firstLine = []
                const secondLine = []
                let currentLine = firstLine
                let currentLength = 0
                
                productItems.forEach(item => {
                    const itemLength = item.length + 2
                    if (currentLength + itemLength <= 60 && currentLine === firstLine) {
                        currentLine.push(item)
                        currentLength += itemLength
                    } else {
                        if (currentLine === firstLine) {
                            currentLine = secondLine
                            currentLength = 0
                        }
                        currentLine.push(item)
                        currentLength += itemLength
                    }
                })
                
                productsDisplay = firstLine.join(', ')
                if (secondLine.length > 0) {
                    productsDisplay += '<br>' + secondLine.join(', ')
                }
            }
        }
        
        // Get business details
        const businessName = order.tenant?.businessName || 'Business Name'
        const businessAddress = order.tenant?.businessAddress || ''
        const businessPhone = order.tenant?.whatsappNumber || ''

        printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shipping Receipt - Order #${order.orderNumber}</title>
    <style>
        @page {
            size: A5 landscape;
            margin: 0;
        }
        @media print {
            @page {
                size: A5 landscape;
                margin: 0;
            }
        }
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 18px;
            line-height: 1.6;
            color: #000;
            background: #fff;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .container {
            width: 100%;
            height: 100%;
            padding: 6mm 8mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
        }
        .header {
            margin-bottom: 5mm;
            padding-bottom: 3mm;
            border-bottom: 2px solid #000;
            flex-shrink: 0;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }
        .business-name {
            font-size: 32px;
            font-weight: 700;
            color: #000;
            margin-bottom: 0;
            letter-spacing: 0.5px;
            flex: 1;
        }
        .vpp-amount {
            text-align: right;
            font-size: 28px;
            font-weight: 700;
            color: #d32f2f;
            white-space: nowrap;
        }
        .shipping-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            min-height: 0;
        }
        .shipping-info {
            flex: 1;
            min-height: 0;
        }
        .shipping-line {
            margin-bottom: 4px;
            font-size: 22px;
            line-height: 1.5;
        }
        .shipping-label {
            font-weight: 600;
            color: #1a1a1a;
            display: inline-block;
            min-width: 110px;
        }
        .shipping-value {
            color: #000;
            font-weight: 400;
        }
        .address-lines {
            margin-left: 110px;
            margin-top: 2px;
            margin-bottom: 4px;
            line-height: 1.4;
            display: inline-block;
        }
        .address-line {
            display: inline;
            font-size: 22px;
            margin-right: 8px;
        }
        .address-line:not(:last-child)::after {
            content: ", ";
        }
        .order-number {
            margin-top: 8mm;
            font-size: 22px;
            font-weight: 600;
        }
        .products-info {
            margin-top: 4mm;
            margin-bottom: 6mm;
            font-size: 20px;
        }
        .products-list {
            font-weight: 500;
        }
        .business-section {
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            flex-shrink: 0;
        }
        .business-label {
            font-size: 20px;
            font-weight: 600;
            color: #333;
            margin-bottom: 5px;
        }
        .business-value {
            font-size: 18px;
            color: #000;
        }
        .payment-section {
            margin-top: 6mm;
            padding-top: 4mm;
            border-top: 2px solid #000;
            flex-shrink: 0;
        }
        .payment-line {
            margin-bottom: 3px;
            font-size: 20px;
            line-height: 1.4;
        }
        .payment-label {
            font-weight: 600;
            color: #1a1a1a;
            display: inline-block;
            min-width: 140px;
        }
        .payment-value {
            color: #000;
            font-weight: 500;
        }
        .payment-total {
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px solid #666;
            font-size: 22px;
            font-weight: 700;
        }
        .business-address {
            font-size: 20px;
            line-height: 1.6;
            color: #333;
            white-space: pre-line;
            margin-left: 110px;
            margin-top: 2px;
            margin-bottom: 3mm;
        }
        .business-phone {
            font-size: 20px;
            color: #333;
            margin-left: 110px;
            margin-top: 2px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="business-name">${businessName}</div>
            ${includePayment && vppAmount !== null && vppAmount !== undefined ? `
            <div class="vpp-amount">
                VPP : Rs. ${vppAmount.toFixed(2)}
            </div>
            ` : ''}
        </div>
        
        <div class="shipping-section">
            <div class="shipping-info">
                <div class="shipping-line">
                    <span class="shipping-label">To:</span>
                    <span class="shipping-value">${customerName}</span>
                </div>
                <div class="shipping-line">
                    <span class="shipping-label">Phone:</span>
                    <span class="shipping-value">${phoneNumber}</span>
                </div>
                <div class="shipping-line">
                    <span class="shipping-label">Address:</span>
                    <div class="address-lines">
                        ${addressLines.map(line => `<span class="address-line">${line}</span>`).join('')}
                        ${city ? `<span class="address-line">${city}</span>` : ''}
                    </div>
                </div>
                <div class="order-number">Order #${order.orderNumber}</div>
                ${productsDisplay ? `<div class="products-info"><span class="products-list">${productsDisplay}</span></div>` : ''}
            </div>
        </div>
        
        <div class="business-section" style="margin-top: 6mm;">
            <div class="shipping-line">
                <span class="shipping-label">FROM:</span>
                <span class="shipping-value" style="font-weight: 600;">${businessName}</span>
            </div>
            ${businessAddress ? `
            <div class="business-address">${businessAddress}</div>
            ` : ''}
            ${businessPhone ? `
            <div class="business-phone">Phone: ${businessPhone}</div>
            ` : ''}
        </div>
    </div>
</body>
</html>
        `)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => {
            printWindow.print()
        }, 250)
    }

    const dispatchOrder = async () => {
        if (!order) return

        try {
            setDispatching(true)
            const payload = {}
            if (actualShippingCost !== null && actualShippingCost !== undefined) {
                payload.actualShippingCost = parseFloat(actualShippingCost)
            }
            if (dispatchLogisticsCompanyId) {
                payload.logisticsCompanyId = dispatchLogisticsCompanyId
            }
            if (dispatchCodFeeOverride && dispatchManualCodFee !== null) {
                payload.codFee = parseFloat(dispatchManualCodFee)
            }
            
            await api.post(`/order/${orderId}/dispatch`, payload)
            toast.success('Order dispatched successfully!')
            
            // Determine receipt type and print automatically
            const codAmount = calculateCodAmount()
            const hasCodAmount = codAmount > 0
            let receiptType = dispatchReceiptType
            
            if (receiptType === 'auto') {
                receiptType = hasCodAmount ? 'withPayment' : 'withoutPayment'
            }
            
            // Print receipt
            const includePayment = receiptType === 'withPayment'
            handlePrintShippingReceipt(includePayment)
            
            // Navigate back to order details
            navigate(`/business/orders/${orderId}`)
        } catch (error) {
            console.error('Dispatch order error:', error)
            if (error.response?.data?.error) {
                const errorMsg = typeof error.response.data.error === 'string'
                  ? error.response.data.error
                  : error.response.data.error?.message || 'Failed to dispatch order'
                toast.error(errorMsg)
            } else {
                toast.error('Failed to dispatch order')
            }
        } finally {
            setDispatching(false)
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

    if (!order) {
        return (
            <ModernLayout>
                <div className="flex items-center justify-center min-h-screen">
                    <div className="text-center">
                        <p className="text-gray-600">Order not found</p>
                        <button
                            onClick={() => navigate('/business/orders')}
                            className="mt-4 btn-primary"
                        >
                            Back to Orders
                        </button>
                    </div>
                </div>
            </ModernLayout>
        )
    }

    const codAmount = calculateCodAmount()
    const hasCodAmount = codAmount > 0
    const currentCodFee = order?.codFee || 0
    const newCodFee = dispatchCodFeeOverride ? (dispatchManualCodFee || 0) : (dispatchCodFee || 0)
    const codFeeChanged = newCodFee !== currentCodFee
    const currentReceiptType = dispatchReceiptType

    return (
        <ModernLayout>
            <div className="max-w-4xl mx-auto px-4 py-6">
                {/* Header */}
                <div className="mb-6">
                    <button
                        onClick={() => navigate(`/business/orders/${orderId}`)}
                        className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
                    >
                        <ArrowLeftIcon className="h-5 w-5 mr-2" />
                        Back to Order
                    </button>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                        Dispatch Order #{order.orderNumber}
                    </h1>
                    <p className="text-gray-600 mt-1">Complete the dispatch details below</p>
                </div>

                {/* Dispatch Form */}
                <div className="card space-y-6">
                    {/* Estimated Shipping Charges */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Estimated Shipping Charges
                        </label>
                        <input
                            type="number"
                            value={order.shippingCharges || 0}
                            disabled
                            className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700"
                        />
                    </div>

                    {/* Actual Shipping Cost */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Actual Shipping Cost <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={actualShippingCost !== null && actualShippingCost !== undefined ? actualShippingCost : (order.shippingCharges || '')}
                            onChange={(e) => {
                                const value = e.target.value
                                if (value === '' || value === null) {
                                    setActualShippingCost(null)
                                } else {
                                    const numValue = parseFloat(value)
                                    setActualShippingCost(isNaN(numValue) ? null : Math.max(0, numValue))
                                }
                            }}
                            placeholder="Enter actual shipping cost"
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Enter the actual amount paid to logistics company
                        </p>
                    </div>

                    {/* Logistics Company */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Logistics Company
                        </label>
                        <select
                            value={dispatchLogisticsCompanyId || ''}
                            onChange={async (e) => {
                                const selectedId = e.target.value || null
                                setDispatchLogisticsCompanyId(selectedId)
                                setDispatchCodFeeOverride(false)
                                setDispatchManualCodFee(null)
                                // Reset COD fee when deselecting
                                if (!selectedId) {
                                    setDispatchCodFee(null)
                                    setDispatchCodFeeCalculationDetails(null)
                                }
                            }}
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[48px] text-lg"
                        >
                            <option value="">Select Logistics Company</option>
                            {logisticsCompanies.filter(c => c.status === 'ACTIVE').map(company => (
                                <option key={company.id} value={company.id}>
                                    {company.name} ({company.codFeeCalculationType?.replace('_', ' ')})
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                            Select the logistics company used to dispatch this order
                        </p>
                    </div>

                    {/* COD Fee Section */}
                    {hasCodAmount && (
                        <div className="pt-4 border-t border-gray-200 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-3">
                                    COD Fee Information
                                </label>
                                
                                {/* Current COD Fee */}
                                {currentCodFee > 0 && (
                                    <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-600">Current COD Fee:</span>
                                            <span className="text-sm font-medium text-gray-900">Rs. {currentCodFee.toFixed(2)}</span>
                                        </div>
                                    </div>
                                )}
                                
                                {/* New Calculated COD Fee */}
                                {dispatchLogisticsCompanyId && dispatchCodFee !== null && !dispatchCodFeeOverride && (
                                    <div className={`mb-3 p-4 rounded-lg border-2 ${
                                        codFeeChanged
                                            ? dispatchCodFee > currentCodFee
                                                ? 'bg-yellow-50 border-yellow-300'
                                                : 'bg-blue-50 border-blue-300'
                                            : 'bg-gray-50 border-gray-300'
                                    }`}>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-sm font-medium text-gray-700">New COD Fee:</span>
                                            <span className={`text-lg font-bold ${
                                                codFeeChanged
                                                    ? dispatchCodFee > currentCodFee
                                                        ? 'text-yellow-600'
                                                        : 'text-blue-600'
                                                    : 'text-gray-600'
                                            }`}>
                                                Rs. {dispatchCodFee.toFixed(2)}
                                            </span>
                                        </div>
                                        {codFeeChanged && (
                                            <div className="text-xs text-gray-600 mt-1">
                                                {dispatchCodFee > currentCodFee 
                                                    ? `Increase of Rs. ${(dispatchCodFee - currentCodFee).toFixed(2)}`
                                                    : `Decrease of Rs. ${(currentCodFee - dispatchCodFee).toFixed(2)}`
                                                }
                                            </div>
                                        )}
                                        {dispatchCodFeeCalculationDetails && (
                                            <div className="text-xs text-gray-500 mt-1">
                                                Calculation: {dispatchCodFeeCalculationDetails.type?.replace('_', ' ')} 
                                                {dispatchCodFeeCalculationDetails.type === 'PERCENTAGE' && dispatchCodFeeCalculationDetails.company?.codFeePercentage && (
                                                    ` (${dispatchCodFeeCalculationDetails.company.codFeePercentage}%)`
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {/* Manual Override Option */}
                                <div className="flex items-center gap-2 mb-2">
                                    <input
                                        type="checkbox"
                                        id="dispatchCodFeeOverride"
                                        checked={dispatchCodFeeOverride}
                                        onChange={(e) => {
                                            setDispatchCodFeeOverride(e.target.checked)
                                            if (!e.target.checked) {
                                                setDispatchManualCodFee(null)
                                            } else {
                                                // Initialize with calculated or current COD fee
                                                const initialValue = dispatchCodFee !== null && dispatchCodFee !== undefined
                                                    ? dispatchCodFee
                                                    : (currentCodFee || 0)
                                                setDispatchManualCodFee(initialValue)
                                            }
                                        }}
                                        className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <label htmlFor="dispatchCodFeeOverride" className="text-sm text-gray-700 cursor-pointer">
                                        Manually override COD fee
                                    </label>
                                </div>
                                
                                {/* Manual COD Fee Input */}
                                {dispatchCodFeeOverride && (
                                    <div>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={dispatchManualCodFee !== null && dispatchManualCodFee !== undefined ? dispatchManualCodFee : ''}
                                            onChange={(e) => {
                                                const inputValue = e.target.value
                                                // Handle empty input
                                                if (inputValue === '') {
                                                    setDispatchManualCodFee(null)
                                                } else {
                                                    // Parse and validate - always update if it's a valid number
                                                    const parsedValue = parseFloat(inputValue)
                                                    if (!isNaN(parsedValue) && isFinite(parsedValue) && parsedValue >= 0) {
                                                        setDispatchManualCodFee(parsedValue)
                                                    }
                                                }
                                            }}
                                            placeholder="Enter COD fee amount"
                                            className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                                            autoFocus={dispatchCodFeeOverride}
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Enter the COD fee amount manually
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Shipping Variance */}
                    {actualShippingCost !== null && order.shippingCharges && (
                        <div className={`p-4 rounded-lg border-2 ${
                            actualShippingCost < order.shippingCharges 
                                ? 'bg-green-50 border-green-300' 
                                : actualShippingCost > order.shippingCharges
                                ? 'bg-red-50 border-red-300'
                                : 'bg-gray-50 border-gray-300'
                        }`}>
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-700">Variance:</span>
                                <span className={`text-lg font-bold ${
                                    actualShippingCost < order.shippingCharges 
                                        ? 'text-green-600' 
                                        : actualShippingCost > order.shippingCharges
                                        ? 'text-red-600'
                                        : 'text-gray-600'
                                }`}>
                                    {actualShippingCost < order.shippingCharges 
                                        ? `+Rs. ${(order.shippingCharges - actualShippingCost).toFixed(2)} (Income)`
                                        : actualShippingCost > order.shippingCharges
                                        ? `-Rs. ${(actualShippingCost - order.shippingCharges).toFixed(2)} (Expense)`
                                        : 'No variance'}
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {actualShippingCost < order.shippingCharges 
                                    ? 'Actual cost was less than estimated - this increases profit' 
                                    : actualShippingCost > order.shippingCharges
                                    ? 'Actual cost was more than estimated - this decreases profit'
                                    : 'No difference between estimated and actual'}
                            </p>
                        </div>
                    )}

                    {/* Receipt Printing Section */}
                    <div className="pt-4 border-t border-gray-200">
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                            Shipping Receipt
                        </label>
                        <div className="space-y-3">
                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-gray-700">Receipt Type:</span>
                                    <span className="text-xs text-blue-600 font-semibold">
                                        {hasCodAmount ? 'COD Order' : 'Prepaid Order'}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-600 mb-3">
                                    {hasCodAmount 
                                        ? `Default: "With Pending Payment" (Rs. ${codAmount.toFixed(2)} pending)`
                                        : 'Default: "Without Payment Amount" (Fully paid)'
                                    }
                                </p>
                                
                                <div className="space-y-3">
                                    <label className="flex items-center space-x-3 cursor-pointer p-3 bg-white rounded-lg border-2 border-gray-200 hover:border-blue-300 transition-colors">
                                        <input
                                            type="radio"
                                            name="receiptType"
                                            value="withPayment"
                                            checked={currentReceiptType === 'withPayment'}
                                            onChange={(e) => setDispatchReceiptType(e.target.value)}
                                            className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300"
                                        />
                                        <div className="flex-1">
                                            <span className="text-sm font-medium text-gray-900">With Pending Payment</span>
                                            <p className="text-xs text-gray-500">Includes payment details (COD orders)</p>
                                        </div>
                                    </label>
                                    <label className="flex items-center space-x-3 cursor-pointer p-3 bg-white rounded-lg border-2 border-gray-200 hover:border-blue-300 transition-colors">
                                        <input
                                            type="radio"
                                            name="receiptType"
                                            value="withoutPayment"
                                            checked={currentReceiptType === 'withoutPayment'}
                                            onChange={(e) => setDispatchReceiptType(e.target.value)}
                                            className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300"
                                        />
                                        <div className="flex-1">
                                            <span className="text-sm font-medium text-gray-900">Without Payment Amount</span>
                                            <p className="text-xs text-gray-500">Standard receipt (no payment info)</p>
                                            {hasCodAmount && (
                                                <p className="text-xs text-yellow-600 mt-1 font-medium">
                                                    ⚠️ Pending amount will remain in customer balance
                                                </p>
                                            )}
                                        </div>
                                    </label>
                                </div>
                            </div>
                            
                            {/* Preview button to print before dispatch */}
                            <button
                                onClick={() => {
                                    const includePayment = currentReceiptType === 'withPayment'
                                    handlePrintShippingReceipt(includePayment)
                                }}
                                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center text-lg"
                            >
                                <PrinterIcon className="h-5 w-5 mr-2" />
                                Print Receipt Now
                            </button>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                        <button
                            onClick={() => navigate(`/business/orders/${orderId}`)}
                            className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-lg"
                            disabled={dispatching}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={dispatchOrder}
                            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-lg flex items-center justify-center"
                            disabled={dispatching}
                        >
                            {dispatching ? (
                                <>
                                    <LoadingSpinner size="sm" className="mr-2" />
                                    Dispatching...
                                </>
                            ) : (
                                <>
                                    <CheckIcon className="h-5 w-5 mr-2" />
                                    Dispatch Order
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </ModernLayout>
    )
}

export default DispatchOrderPage

