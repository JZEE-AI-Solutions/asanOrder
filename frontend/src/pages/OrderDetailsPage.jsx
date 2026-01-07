import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { 
    ArrowLeftIcon, 
    ArrowPathIcon,
    CheckIcon, 
    UserIcon, 
    CurrencyDollarIcon, 
    PhotoIcon,
    PencilIcon,
    XMarkIcon,
    PrinterIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import api, { getImageUrl } from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ModernLayout from '../components/ModernLayout'
import OrderProductSelector from '../components/OrderProductSelector'
import PaymentAccountSelector from '../components/accounting/PaymentAccountSelector'
import WhatsAppConfirmationModal from '../components/WhatsAppConfirmationModal'

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
    const [paymentAmountTouched, setPaymentAmountTouched] = useState(false) // Track if user interacted with payment input
    const [shippingCharges, setShippingCharges] = useState(0)
    const [formData, setFormData] = useState({})
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [paymentInput, setPaymentInput] = useState('')
    const [processingPayment, setProcessingPayment] = useState(false)
    const [whatsappModal, setWhatsappModal] = useState({ isOpen: false, url: null, phone: null })
    const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState(null)
    const [showDispatchModal, setShowDispatchModal] = useState(false)
    const [actualShippingCost, setActualShippingCost] = useState(null)
    const [dispatchLogisticsCompanyId, setDispatchLogisticsCompanyId] = useState(null)
    const [dispatchCodFee, setDispatchCodFee] = useState(null)
    const [dispatchCodFeeOverride, setDispatchCodFeeOverride] = useState(false)
    const [dispatchManualCodFee, setDispatchManualCodFee] = useState(null)
    const [dispatchCodFeeCalculationDetails, setDispatchCodFeeCalculationDetails] = useState(null)
    const [codFeePaidBy, setCodFeePaidBy] = useState('BUSINESS_OWNER')
    const [showShippingAdjustmentModal, setShowShippingAdjustmentModal] = useState(false)
    const [adjustmentActualCost, setAdjustmentActualCost] = useState(null)
    const [paymentReceiveAccountId, setPaymentReceiveAccountId] = useState(null)
    const [payments, setPayments] = useState([])
    const [loadingPayments, setLoadingPayments] = useState(false)
    const [showVerifyPaymentModal, setShowVerifyPaymentModal] = useState(false)
    const [verifyPaymentAmount, setVerifyPaymentAmount] = useState('')
    const [verifyPaymentAccountId, setVerifyPaymentAccountId] = useState(null)
    const [verifyingPayment, setVerifyingPayment] = useState(false)
    const [showConfirmWithPaymentModal, setShowConfirmWithPaymentModal] = useState(false)
    const [confirmPaymentAmount, setConfirmPaymentAmount] = useState('')
    const [confirmPaymentAccountId, setConfirmPaymentAccountId] = useState(null)
    const [confirmingOrder, setConfirmingOrder] = useState(false)
    const [showUpdateVerifiedPaymentModal, setShowUpdateVerifiedPaymentModal] = useState(false)
    const [updateVerifiedPaymentAmount, setUpdateVerifiedPaymentAmount] = useState('')
    const [updateVerifiedPaymentAccountId, setUpdateVerifiedPaymentAccountId] = useState(null)
    const [dispatchReceiptType, setDispatchReceiptType] = useState('auto') // 'auto', 'withPayment', 'withoutPayment'
    const [updatingVerifiedPayment, setUpdatingVerifiedPayment] = useState(false)
    
    // COD fee management state
    const [logisticsCompanies, setLogisticsCompanies] = useState([])
    const [selectedLogisticsCompanyId, setSelectedLogisticsCompanyId] = useState(null)
    const [calculatedCodFee, setCalculatedCodFee] = useState(null)
    const [codFeeOverride, setCodFeeOverride] = useState(false)
    const [manualCodFee, setManualCodFee] = useState(null)
    const [codFeeCalculationDetails, setCodFeeCalculationDetails] = useState(null)

    useEffect(() => {
        fetchOrderDetails()
        fetchLogisticsCompanies()
    }, [orderId])

    useEffect(() => {
        if (orderId) {
            fetchOrderPayments()
        }
    }, [orderId])

    const fetchLogisticsCompanies = async () => {
        try {
            const response = await api.get('/accounting/logistics-companies')
            if (response.data?.success) {
                setLogisticsCompanies(response.data.data || [])
            }
        } catch (error) {
            console.error('Error fetching logistics companies:', error)
        }
    }

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
            
            // Initialize payment amount: use order's paymentAmount if exists, otherwise default to 0
            // This ensures the input always has a value and prevents auto-setting issues
            setPaymentAmount(orderData.paymentAmount !== null && orderData.paymentAmount !== undefined ? orderData.paymentAmount : 0)
            setPaymentAmountTouched(false) // Reset touched flag when loading order
            setShippingCharges(orderData.shippingCharges || 0)
            setSelectedPaymentAccountId(orderData.paymentAccountId || null)
            setActualShippingCost(orderData.actualShippingCost || null)
            setCodFeePaidBy(orderData.codFeePaidBy || 'BUSINESS_OWNER')
            setSelectedLogisticsCompanyId(orderData.logisticsCompanyId || null)
            setDispatchLogisticsCompanyId(orderData.logisticsCompanyId || null) // Initialize dispatch logistics company
            setDispatchCodFee(orderData.codFee || null) // Initialize dispatch COD fee
            setCalculatedCodFee(orderData.codFee || null)
            setCodFeeOverride(false)
            setManualCodFee(null)
            setCodFeeCalculationDetails({
                type: orderData.codFeeCalculationType,
                company: orderData.logisticsCompany
            })
            
            // Initialize verify payment amount if unverified prepayment exists
            if (orderData.paymentAmount > 0 && !orderData.paymentVerified) {
                setVerifyPaymentAmount(orderData.paymentAmount.toString())
            }
        } catch (error) {
            toast.error('Failed to fetch order details')
            navigate('/business/orders')
        } finally {
            setLoading(false)
        }
    }

    const fetchOrderPayments = async () => {
        if (!orderId) return
        try {
            setLoadingPayments(true)
            const response = await api.get('/accounting/payments', {
                params: {
                    orderId: orderId,
                    type: 'CUSTOMER_PAYMENT'
                }
            })
            if (response.data?.success) {
                setPayments(response.data.data || [])
            }
        } catch (error) {
            console.error('Error fetching payments:', error)
            setPayments([])
        } finally {
            setLoadingPayments(false)
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
            const quantity = productQuantities[product.id] || product.quantity || 1
            const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0
            total += price * quantity
        })
        return total
    }

    const handleSaveOrder = async () => {
        try {
            setSaving(true)
            
            // Determine final payment amount:
            // The key principle: Only change paymentAmount if the user explicitly modified it
            // If user only changed prices/shipping, preserve the original paymentAmount
            const originalPaymentAmount = order?.paymentAmount !== null && order?.paymentAmount !== undefined 
                ? order.paymentAmount 
                : 0 // Default to 0 if no payment was claimed
            
            // Only use the state value if user explicitly touched/changed the payment input
            // This prevents auto-setting when user only changes prices/shipping
            let finalPaymentAmount
            if (paymentAmountTouched) {
                // User explicitly interacted with payment input - use the current state value
                // Convert null/undefined to 0 for consistency
                finalPaymentAmount = paymentAmount !== null && paymentAmount !== undefined ? paymentAmount : 0
            } else {
                // User did NOT touch payment input - always preserve original value
                // This handles the case where user only changed prices/shipping
                finalPaymentAmount = originalPaymentAmount
            }
            
            // Note: Shipping variance for DISPATCHED/COMPLETED orders should be handled via adjust-shipping-cost endpoint
            // Only calculate variance here for non-dispatched orders (if needed)
            let shippingVariance = null
            let shippingVarianceDate = null
            if (actualShippingCost !== null && actualShippingCost !== undefined && shippingCharges > 0 && 
                order.status !== 'DISPATCHED' && order.status !== 'COMPLETED') {
                shippingVariance = shippingCharges - actualShippingCost
                if (shippingVariance !== 0) {
                    shippingVarianceDate = new Date().toISOString()
                }
            }

            const finalCodFee = codFeeOverride ? (manualCodFee || null) : (calculatedCodFee || null)
            
            const updatedOrder = {
                formData: JSON.stringify(formData),
                selectedProducts: JSON.stringify(selectedProducts),
                productQuantities: JSON.stringify(productQuantities),
                productPrices: JSON.stringify(productPrices),
                paymentAmount: finalPaymentAmount,
                // paymentAccountId is only set when receiving/verifying payment, not during order edit
                shippingCharges: shippingCharges || 0,
                actualShippingCost: actualShippingCost !== null && actualShippingCost !== undefined ? actualShippingCost : undefined,
                shippingVariance: shippingVariance !== null ? shippingVariance : undefined,
                shippingVarianceDate: shippingVarianceDate || undefined,
                codFeePaidBy: codFeePaidBy || undefined,
                logisticsCompanyId: selectedLogisticsCompanyId || undefined,
                codFee: finalCodFee !== null && finalCodFee !== undefined ? finalCodFee : undefined
            }

            await api.put(`/order/${orderId}`, updatedOrder)
            
            toast.success('Order updated successfully!')
            setIsEditing(false)
            fetchOrderDetails()
        } catch (error) {
            console.error('Failed to update order:', error)
            const errorMsg = typeof error.response?.data?.error === 'string' 
              ? error.response?.data?.error 
              : error.response?.data?.error?.message || 'Failed to update order'
            toast.error(errorMsg)
        } finally {
            setSaving(false)
        }
    }

    const handleCancelEdit = () => {
        setIsEditing(false)
        fetchOrderDetails() // Reset to original state
    }

    const confirmOrder = async () => {
        // If order has claimed payment, show payment verification modal first
        if (order.paymentAmount && order.paymentAmount > 0) {
            setConfirmPaymentAmount(order.paymentAmount.toString())
            setConfirmPaymentAccountId(order.paymentAccountId || null)
            setShowConfirmWithPaymentModal(true)
            return
        }
        
        // Otherwise, confirm order directly
        await doConfirmOrder()
    }

    const doConfirmOrder = async (verifiedAmount = null, paymentAccountId = null) => {
        try {
            setConfirmingOrder(true)
            // Calculate COD amount to determine if COD fee is applicable
            const orderTotal = calculateOrderTotal()
            const codAmount = orderTotal - (order.paymentAmount || 0)
            
            const payload = {}
            
            // If COD order, include COD fee payment preference
            if (codAmount > 0 && order.codFee) {
                payload.codFeePaidBy = codFeePaidBy
                // Note: logisticsCompanyId should be selected separately if needed
                // For now, we'll use the one from order if it exists
                if (order.logisticsCompanyId) {
                    payload.logisticsCompanyId = order.logisticsCompanyId
                }
            }
            
            // Include payment verification if provided
            if (verifiedAmount !== null && paymentAccountId) {
                payload.verifiedAmount = parseFloat(verifiedAmount)
                payload.paymentAccountId = paymentAccountId
            }
            
            const response = await api.post(`/order/${orderId}/confirm`, payload)
            
            const message = response.data.payment 
                ? `Order confirmed and payment of Rs. ${response.data.payment.amount.toFixed(2)} verified successfully!`
                : 'Order confirmed successfully!'
            toast.success(message)
            
            // Show WhatsApp confirmation modal if URL is available
            if (response.data.whatsappUrl) {
                setWhatsappModal({
                    isOpen: true,
                    url: response.data.whatsappUrl,
                    phone: response.data.customerPhone || 'customer'
                })
            }
            
            setShowConfirmWithPaymentModal(false)
            setConfirmPaymentAmount('')
            setConfirmPaymentAccountId(null)
            fetchOrderDetails()
        } catch (error) {
            console.error('Confirm order error:', error)
            const errorMsg = error.response?.data?.error 
                ? (typeof error.response.data.error === 'string' 
                    ? error.response.data.error 
                    : error.response.data.error?.message || 'Failed to confirm order')
                : error.message || 'Failed to confirm order'
            toast.error(errorMsg)
        } finally {
            setConfirmingOrder(false)
        }
    }

    const handleWhatsAppConfirm = () => {
        if (whatsappModal.url) {
            const whatsappWindow = window.open(whatsappModal.url, '_blank', 'noopener,noreferrer')
            if (whatsappWindow) {
                toast.success('Opening WhatsApp...', { duration: 2000 })
            } else {
                toast.error('Please allow popups to open WhatsApp', { duration: 3000 })
            }
        }
        setWhatsappModal({ isOpen: false, url: null, phone: null })
    }

    const handleWhatsAppCancel = () => {
        setWhatsappModal({ isOpen: false, url: null, phone: null })
    }

    const calculateDispatchCodFee = async () => {
        if (!order || !dispatchLogisticsCompanyId) {
            setDispatchCodFee(null)
            setDispatchCodFeeCalculationDetails(null)
            return
        }

        // If override is enabled, don't recalculate
        if (dispatchCodFeeOverride) {
            return
        }

        try {
            const codAmount = calculateCodAmount()
            if (codAmount <= 0) {
                setDispatchCodFee(null)
                setDispatchCodFeeCalculationDetails(null)
                return
            }

            const response = await api.post(`/accounting/logistics-companies/orders/${orderId}/calculate-cod-fee`, {
                logisticsCompanyId: dispatchLogisticsCompanyId
            })
            
            if (response.data?.success) {
                const result = response.data.data
                setDispatchCodFee(result.codFee)
                setDispatchCodFeeCalculationDetails({
                    type: result.calculationType,
                    company: result.logisticsCompany,
                    codAmount: codAmount
                })
            }
        } catch (error) {
            console.error('Error calculating COD fee for dispatch:', error)
            setDispatchCodFee(null)
            setDispatchCodFeeCalculationDetails(null)
        }
    }

    // Recalculate COD fee when logistics company changes in dispatch modal
    useEffect(() => {
        if (showDispatchModal && dispatchLogisticsCompanyId && !dispatchCodFeeOverride) {
            calculateDispatchCodFee()
        }
    }, [dispatchLogisticsCompanyId, showDispatchModal, dispatchCodFeeOverride])

    const adjustShippingCost = async () => {
        if (adjustmentActualCost === null || adjustmentActualCost === undefined) {
            toast.error('Please enter the actual shipping cost')
            return
        }

        try {
            const response = await api.post(`/order/${orderId}/adjust-shipping-cost`, {
                actualShippingCost: parseFloat(adjustmentActualCost)
            })
            
            toast.success(response.data?.message || 'Shipping cost adjusted successfully!')
            setShowShippingAdjustmentModal(false)
            setAdjustmentActualCost(null)
            fetchOrderDetails()
        } catch (error) {
            console.error('Adjust shipping cost error:', error)
            if (error.response?.data?.error) {
                const errorMsg = typeof error.response.data.error === 'string'
                  ? error.response.data.error
                  : error.response.data.error?.message || 'Failed to adjust shipping cost'
                toast.error(errorMsg)
            } else {
                toast.error('Failed to adjust shipping cost')
            }
        }
    }

    const dispatchOrder = async () => {
        try {
            const payload = {}
            if (actualShippingCost !== null && actualShippingCost !== undefined) {
                payload.actualShippingCost = parseFloat(actualShippingCost)
            }
            if (dispatchLogisticsCompanyId) {
                payload.logisticsCompanyId = dispatchLogisticsCompanyId
            }
            // Include COD fee if manually overridden
            if (dispatchCodFeeOverride && dispatchManualCodFee !== null) {
                payload.codFee = parseFloat(dispatchManualCodFee)
            }
            
            await api.post(`/order/${orderId}/dispatch`, payload)
            toast.success('Order dispatched successfully!')
            
            // Determine receipt type and print automatically
            const codAmount = calculateCodAmount()
            const hasCodAmount = codAmount > 0
            let receiptType = dispatchReceiptType
            
            // If auto, determine based on COD
            if (receiptType === 'auto') {
                receiptType = hasCodAmount ? 'withPayment' : 'withoutPayment'
            }
            
            // Print receipt
            const includePayment = receiptType === 'withPayment'
            handlePrintShippingReceipt(includePayment)
            
            setShowDispatchModal(false)
            setActualShippingCost(null)
            setDispatchLogisticsCompanyId(null)
            setDispatchCodFee(null)
            setDispatchCodFeeOverride(false)
            setDispatchManualCodFee(null)
            setDispatchCodFeeCalculationDetails(null)
            setDispatchReceiptType('auto')
            fetchOrderDetails()
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
        }
    }

    const calculateCodAmount = () => {
        const productsTotal = calculateProductsTotal()
        const currentShippingCharges = isEditing ? shippingCharges : (order?.shippingCharges || 0)
        const baseOrderTotal = productsTotal + currentShippingCharges
        const currentPaymentAmount = isEditing ? (paymentAmount || 0) : (order?.paymentAmount || 0)
        return baseOrderTotal - currentPaymentAmount
    }

    const recalculateCodFee = async () => {
        if (!isEditing && !order) return
        
        const codAmount = calculateCodAmount()
        
        // If no COD amount or no logistics company, clear COD fee
        if (codAmount <= 0 || !selectedLogisticsCompanyId) {
            setCalculatedCodFee(null)
            setCodFeeCalculationDetails(null)
            return
        }

        // If override is enabled, don't recalculate
        if (codFeeOverride) {
            return
        }

        try {
            const response = await api.post(`/accounting/logistics-companies/orders/${orderId}/calculate-cod-fee`, {
                logisticsCompanyId: selectedLogisticsCompanyId
            })
            
            if (response.data?.success) {
                const result = response.data.data
                setCalculatedCodFee(result.codFee)
                setCodFeeCalculationDetails({
                    type: result.calculationType,
                    company: result.logisticsCompany,
                    codAmount: codAmount
                })
            }
        } catch (error) {
            console.error('Error calculating COD fee:', error)
            // Don't show error toast, just clear the fee
            setCalculatedCodFee(null)
            setCodFeeCalculationDetails(null)
        }
    }

    // Auto-recalculate COD fee when relevant values change
    useEffect(() => {
        if (isEditing && selectedLogisticsCompanyId && !codFeeOverride) {
            recalculateCodFee()
        }
    }, [selectedProducts, productQuantities, productPrices, paymentAmount, shippingCharges, selectedLogisticsCompanyId, isEditing, codFeeOverride])

    const calculateOrderTotal = () => {
        if (!order) return 0
        
        // Use state variables when editing, otherwise use order data
        let productsToCalculate = []
        let quantitiesToUse = {}
        let pricesToUse = {}
        
        if (isEditing) {
            // Use current state when editing
            productsToCalculate = selectedProducts
            quantitiesToUse = productQuantities
            pricesToUse = productPrices
        } else {
            // Use order data when viewing
            productsToCalculate = parseJSON(order.selectedProducts) || []
            quantitiesToUse = parseJSON(order.productQuantities) || {}
            pricesToUse = parseJSON(order.productPrices) || {}
        }
        
        let total = 0
        productsToCalculate.forEach(product => {
            const quantity = quantitiesToUse[product.id] || product.quantity || 1
            const price = pricesToUse[product.id] || product.price || product.currentRetailPrice || 0
            total += price * quantity
        })
        
        // Add shipping charges (use state if editing, otherwise use order data)
        const currentShippingCharges = isEditing ? shippingCharges : (order?.shippingCharges || 0)
        total += currentShippingCharges
        
        // Add COD fee if customer pays (use state if editing, otherwise use order data)
        const currentCodFeePaidBy = isEditing ? codFeePaidBy : (order?.codFeePaidBy || 'BUSINESS_OWNER')
        const currentCodFee = isEditing 
            ? (codFeeOverride ? (manualCodFee || 0) : (calculatedCodFee || 0))
            : (order?.codFee || 0)
        if (currentCodFeePaidBy === 'CUSTOMER' && currentCodFee > 0) {
            total += currentCodFee
        }
        
        return total
    }

    const getPaymentStatus = () => {
        if (!order) return { total: 0, paid: 0, remaining: 0, isFullyPaid: false, isPartiallyPaid: false, isUnpaid: true, claimed: 0, verified: 0 }
        const total = calculateOrderTotal()
        // Use verified payment amount if verified, otherwise use 0 (unverified payments don't count as paid)
        const claimed = order.paymentAmount || 0
        const verified = order.paymentVerified ? (order.verifiedPaymentAmount || 0) : 0
        const paid = verified // Only use verified amount - unverified claims don't count as paid
        const remaining = total - paid
        
        return {
            total,
            paid,
            remaining,
            claimed,
            verified,
            isFullyPaid: paid >= total,
            isPartiallyPaid: paid > 0 && paid < total,
            isUnpaid: paid === 0,
            isVerified: order.paymentVerified || false
        }
    }

    const handleReceivePayment = () => {
        if (!order) return
        // Calculate total order amount
        const paymentStatus = getPaymentStatus()
        
        // Set initial payment input to remaining balance or total
        setPaymentInput(paymentStatus.remaining > 0 ? paymentStatus.remaining.toString() : paymentStatus.total.toString())
        setPaymentReceiveAccountId(null) // Reset account selection
        setShowPaymentModal(true)
    }

    const handleSubmitPayment = async () => {
        const paymentValue = parseFloat(paymentInput) || 0
        if (paymentValue <= 0) {
            toast.error('Payment amount must be greater than 0')
            return
        }

        if (!paymentReceiveAccountId) {
            toast.error('Please select a payment account')
            return
        }

        if (!order?.customerId) {
            toast.error('Order customer information is missing')
            return
        }

        setProcessingPayment(true)
        try {
            // Use proper payment recording endpoint
            const response = await api.post('/accounting/payments', {
                date: new Date().toISOString(),
                type: 'CUSTOMER_PAYMENT',
                amount: paymentValue,
                paymentAccountId: paymentReceiveAccountId,
                customerId: order.customerId,
                orderId: orderId
            })

            if (response.data?.success) {
                const paymentStatus = getPaymentStatus()
                const newPaymentAmount = (order.paymentAmount || 0) + paymentValue
                const isFullyPaid = newPaymentAmount >= paymentStatus.total

                if (isFullyPaid) {
                    toast.success(`Payment of Rs. ${paymentValue.toFixed(2)} received. Order is now fully paid!`)
                } else {
                    toast.success(`Payment of Rs. ${paymentValue.toFixed(2)} received. Remaining balance: Rs. ${(paymentStatus.total - newPaymentAmount).toFixed(2)}`)
                }

                setShowPaymentModal(false)
                setPaymentInput('')
                setPaymentReceiveAccountId(null)
                fetchOrderDetails() // This will refresh order and payments
                fetchOrderPayments() // Refresh payment history
            }
        } catch (error) {
            console.error('Receive payment error:', error)
            if (error.response?.data?.error) {
                const errorMsg = typeof error.response.data.error === 'string'
                  ? error.response.data.error
                  : error.response.data.error?.message || 'Failed to record payment'
                toast.error(errorMsg)
            } else {
                toast.error('Failed to record payment')
            }
        } finally {
            setProcessingPayment(false)
        }
    }

    const handleVerifyPayment = async () => {
        const amount = parseFloat(verifyPaymentAmount) || 0
        if (amount <= 0) {
            toast.error('Verified amount must be greater than 0')
            return
        }

        if (!verifyPaymentAccountId) {
            toast.error('Please select a payment account')
            return
        }

        setVerifyingPayment(true)
        try {
            const response = await api.post(`/order/${orderId}/verify-payment`, {
                verifiedAmount: amount,
                paymentAccountId: verifyPaymentAccountId
            })

            if (response.data?.success) {
                toast.success(response.data.message || 'Payment verified successfully!')
                setShowVerifyPaymentModal(false)
                setVerifyPaymentAmount('')
                setVerifyPaymentAccountId(null)
                fetchOrderDetails()
                fetchOrderPayments()
            }
        } catch (error) {
            console.error('Verify payment error:', error)
            if (error.response?.data?.error) {
                const errorMsg = typeof error.response.data.error === 'string'
                  ? error.response.data.error
                  : error.response.data.error?.message || 'Failed to verify payment'
                toast.error(errorMsg)
            } else {
                toast.error('Failed to verify payment')
            }
        } finally {
            setVerifyingPayment(false)
        }
    }

    const handleUpdateVerifiedPayment = async () => {
        const amount = parseFloat(updateVerifiedPaymentAmount) || 0
        if (amount <= 0) {
            toast.error('Verified amount must be greater than 0')
            return
        }

        if (!updateVerifiedPaymentAccountId) {
            toast.error('Please select a payment account')
            return
        }

        setUpdatingVerifiedPayment(true)
        try {
            const response = await api.patch(`/order/${orderId}/update-verified-payment`, {
                verifiedAmount: amount,
                paymentAccountId: updateVerifiedPaymentAccountId
            })

            if (response.data?.success) {
                toast.success(response.data.message || 'Verified payment updated successfully!')
                setShowUpdateVerifiedPaymentModal(false)
                setUpdateVerifiedPaymentAmount('')
                setUpdateVerifiedPaymentAccountId(null)
                fetchOrderDetails()
                fetchOrderPayments()
            }
        } catch (error) {
            console.error('Update verified payment error:', error)
            if (error.response?.data?.error) {
                const errorMsg = typeof error.response.data.error === 'string'
                  ? error.response.data.error
                  : error.response.data.error?.message || 'Failed to update verified payment'
                toast.error(errorMsg)
            } else {
                toast.error('Failed to update verified payment')
            }
        } finally {
            setUpdatingVerifiedPayment(false)
        }
    }

    const handlePrintShippingReceipt = (includePayment = false) => {
        const printWindow = window.open('', '_blank')
        if (!printWindow) {
            toast.error('Please allow popups to print the receipt')
            return
        }

        const formData = parseJSON(order.formData)
        
        // Calculate payment information if needed
        let paymentInfo = null
        if (includePayment) {
            const paymentStatus = getPaymentStatus()
            paymentInfo = {
                total: paymentStatus.total,
                paid: paymentStatus.paid,
                remaining: paymentStatus.remaining
            }
        }
        
        // Get recipient details
        const customerName = formData['Customer Name'] || formData['Name'] || formData['Full Name'] || 'N/A'
        const phoneNumber = formData['Phone Number'] || formData['Mobile Number'] || formData['Contact Number'] || formData['Phone'] || 'N/A'
        const shippingAddress = formData['Shipping Address'] || formData['Address'] || formData['Delivery Address'] || 'N/A'
        const city = formData['City'] || formData['City Name'] || ''
        
        // Parse address into lines (split by newline or comma)
        const addressLines = shippingAddress.split(/[,\n]/).map(line => line.trim()).filter(line => line)
        
        // Get products information
        const selectedProducts = parseJSON(order.selectedProducts) || []
        const productQuantities = parseJSON(order.productQuantities) || {}
        
        // Format products for display (max 2 lines)
        let productsDisplay = ''
        if (selectedProducts.length > 0) {
            const productItems = selectedProducts.map(product => {
                const quantity = productQuantities[product.id] || product.quantity || 1
                return `${product.name || 'N/A'} (${quantity})`
            })
            
            // Try to fit in 1-2 lines, max 60 characters per line
            const productsText = productItems.join(', ')
            if (productsText.length <= 60) {
                productsDisplay = productsText
            } else {
                // Split into 2 lines
                const firstLine = []
                const secondLine = []
                let currentLine = firstLine
                let currentLength = 0
                
                productItems.forEach(item => {
                    const itemLength = item.length + 2 // +2 for ", "
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
        }
        .business-name {
            font-size: 32px;
            font-weight: 700;
            color: #000;
            margin-bottom: 0;
            letter-spacing: 0.5px;
            text-decoration: none;
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
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .business-address {
            font-size: 20px;
            line-height: 1.6;
            color: #333;
            white-space: pre-line;
            margin-bottom: 3mm;
        }
        .business-phone {
            font-size: 20px;
            color: #333;
            margin-top: 2px;
        }
        @media print {
            body {
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .container {
                padding: 5mm 7mm;
                height: 100%;
                overflow: hidden;
            }
            body {
                height: 100vh;
                overflow: hidden;
            }
            * {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
        @media screen {
            body {
                background: #f5f5f5;
            }
            .container {
                max-width: 500px;
                margin: 20px auto;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header" style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div class="business-name">${businessName}</div>
            ${paymentInfo && paymentInfo.remaining > 0 ? `
            <div style="text-align: right; font-size: 28px; font-weight: 700; color: #d32f2f;">
                VPP : Rs. ${paymentInfo.remaining.toFixed(2)}
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
                    <span class="shipping-label">Mobile #:</span>
                    <span class="shipping-value">${phoneNumber}</span>
                </div>
                
                <div class="shipping-line">
                    <span class="shipping-label">Address:</span>
                    <span class="shipping-value" style="margin-left: 0;">
                        ${addressLines.join(', ')}
                    </span>
                </div>
                
                ${city ? `
                <div class="shipping-line">
                    <span class="shipping-label">City:</span>
                    <span class="shipping-value">${city}</span>
                </div>
                ` : ''}
                
                <div class="shipping-line order-number">
                    <span class="shipping-label">Order Number:</span>
                    <span class="shipping-value">${order.orderNumber}</span>
                </div>
                
                ${productsDisplay ? `
                <div class="shipping-line products-info">
                    <span class="shipping-label">Products:</span>
                    <span class="shipping-value products-list">${productsDisplay}</span>
                </div>
                ` : ''}
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
        
        // Wait for content to load, then trigger print
        // Improved mobile support
        const triggerPrint = () => {
            try {
                printWindow.focus()
                setTimeout(() => {
                    printWindow.print()
                }, 300)
            } catch (error) {
                console.error('Print error:', error)
                toast.error('Failed to open print dialog. Please try again.')
            }
        }
        
        // Wait for document to be ready
        if (printWindow.document.readyState === 'complete') {
            triggerPrint()
        } else {
            printWindow.onload = triggerPrint
            // Fallback timeout
            setTimeout(triggerPrint, 1000)
        }
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
            <style>{`
                /* Mobile touch targets - minimum 44x44px */
                @media (max-width: 640px) {
                    button, a, input[type="button"], input[type="submit"] {
                        min-height: 44px;
                    }
                }
                /* Prevent zoom on input focus (iOS) */
                @media (max-width: 640px) {
                    input[type="number"],
                    input[type="text"],
                    select {
                        font-size: 16px !important;
                    }
                }
            `}</style>
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
                                            onClick={() => {
                                                navigate(`/business/orders/${orderId}/dispatch`)
                                            }}
                                            className="btn-primary flex items-center px-6 py-2.5 bg-green-600 hover:bg-green-700"
                                        >
                                            <CheckIcon className="h-5 w-5 mr-2" />
                                            Dispatch Order
                                        </button>
                                    </>
                                )}
                                {(order.status === 'DISPATCHED' || order.status === 'COMPLETED') && (
                                    <button
                                        onClick={() => {
                                            setAdjustmentActualCost(order.actualShippingCost || null)
                                            setShowShippingAdjustmentModal(true)
                                        }}
                                        className="btn-primary flex items-center px-6 py-2.5 bg-orange-600 hover:bg-orange-700"
                                    >
                                        <PencilIcon className="h-5 w-5 mr-2" />
                                        Adjust Shipping Cost
                                    </button>
                                )}
                                {(order.status === 'DISPATCHED' || order.status === 'COMPLETED') && (
                                    <button
                                        onClick={() => navigate(`/business/returns/new?orderId=${orderId}`)}
                                        className="btn-primary flex items-center px-6 py-2.5 bg-purple-600 hover:bg-purple-700"
                                    >
                                        <ArrowPathIcon className="h-5 w-5 mr-2" />
                                        Create Return
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
                                    <>
                                        {/* COD Fee Payment Preference */}
                                        {(() => {
                                            const orderTotal = calculateOrderTotal()
                                            const codAmount = orderTotal - (order.paymentAmount || 0)
                                            const hasCodFee = order.codFee && order.codFee > 0
                                            
                                            if (codAmount > 0 && hasCodFee) {
                                                return (
                                                    <div className="w-full sm:w-auto mt-4 p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                                                        <label className="block text-sm font-semibold text-gray-900 mb-3">
                                                            COD Fee Payment Preference
                                                        </label>
                                                        <div className="space-y-2">
                                                            <label className="flex items-center cursor-pointer">
                                                                <input
                                                                    type="radio"
                                                                    name="codFeePaidBy"
                                                                    value="BUSINESS_OWNER"
                                                                    checked={codFeePaidBy === 'BUSINESS_OWNER'}
                                                                    onChange={(e) => setCodFeePaidBy(e.target.value)}
                                                                    className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500"
                                                                />
                                                                <div className="flex-1">
                                                                    <span className="text-sm font-medium text-gray-900">
                                                                        Business Owner Pays
                                                                    </span>
                                                                    <p className="text-xs text-gray-600">
                                                                        COD Fee: Rs. {order.codFee.toFixed(2)} (Expense)
                                                                    </p>
                                                                </div>
                                                            </label>
                                                            <label className="flex items-center cursor-pointer">
                                                                <input
                                                                    type="radio"
                                                                    name="codFeePaidBy"
                                                                    value="CUSTOMER"
                                                                    checked={codFeePaidBy === 'CUSTOMER'}
                                                                    onChange={(e) => setCodFeePaidBy(e.target.value)}
                                                                    className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500"
                                                                />
                                                                <div className="flex-1">
                                                                    <span className="text-sm font-medium text-gray-900">
                                                                        Customer Pays
                                                                    </span>
                                                                    <p className="text-xs text-gray-600">
                                                                        COD Fee: Rs. {order.codFee.toFixed(2)} (Added to Order Total)
                                                                    </p>
                                                                </div>
                                                            </label>
                                                        </div>
                                                        {codFeePaidBy === 'CUSTOMER' && (
                                                            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded">
                                                                <p className="text-xs text-blue-800">
                                                                    <strong>New Order Total:</strong> Rs. {(orderTotal + order.codFee).toFixed(2)}
                                                                </p>
                                                                <p className="text-xs text-blue-700 mt-1">
                                                                    Customer will pay Rs. {order.codFee.toFixed(2)} as COD fee
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            }
                                            return null
                                        })()}
                                        
                                        <button
                                            onClick={confirmOrder}
                                            className="btn-primary flex items-center px-6 py-2.5 mt-4"
                                        >
                                            <CheckIcon className="h-5 w-5 mr-2" />
                                            Confirm Order
                                        </button>
                                    </>
                                )}
                            </>
                        ) : (
                            <>
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
                                            <div className="mt-4 pt-4 border-t-2 border-gray-300 space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-lg font-bold text-gray-900">Products Total:</span>
                                                    <span className="text-2xl font-bold text-green-600">
                                                        Rs. {calculateProductsTotal().toLocaleString()}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm font-semibold text-gray-700">Shipping Charges:</span>
                                                    <span className="text-lg font-bold text-blue-600">
                                                        Rs. {(order.shippingCharges || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                                    <span className="text-lg font-bold text-gray-900">Total Amount:</span>
                                                    <span className="text-2xl font-bold text-pink-600">
                                                        Rs. {calculateOrderTotal().toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                )}

                            {/* COD Fee Display */}
                            {!isEditing && order.codFee && order.codFee > 0 && (
                                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-semibold text-gray-900">COD Fee Information</h4>
                                        <span className="text-xl font-bold text-blue-600">
                                            Rs. {order.codFee.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="space-y-1 text-sm text-gray-600">
                                        {order.logisticsCompany && (
                                            <p>
                                                <strong>Logistics Company:</strong> {order.logisticsCompany.name}
                                            </p>
                                        )}
                                        {order.codFeeCalculationType && (
                                            <p>
                                                <strong>Calculation Method:</strong> {order.codFeeCalculationType.replace('_', ' ')}
                                            </p>
                                        )}
                                        {order.codAmount && (
                                            <p>
                                                <strong>COD Amount:</strong> Rs. {order.codAmount.toFixed(2)}
                                            </p>
                                        )}
                                        {order.codFeePaidBy && (
                                            <p>
                                                <strong>Paid By:</strong> {order.codFeePaidBy === 'CUSTOMER' ? 'Customer' : 'Business Owner'}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Shipping Variance Display */}
                            {order.shippingVariance !== null && order.shippingVariance !== undefined && !isEditing && (order.status === 'DISPATCHED' || order.status === 'COMPLETED') && (
                                <div className={`mt-4 p-4 rounded-lg border-2 ${
                                    order.shippingVariance > 0 
                                        ? 'bg-green-50 border-green-300' 
                                        : 'bg-red-50 border-red-300'
                                }`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div>
                                            <h4 className="font-semibold text-gray-900">Shipping Variance</h4>
                                            <p className="text-sm text-gray-600 mt-1">
                                                Customer Charged: Rs. {(order.shippingCharges || 0).toFixed(2)} | 
                                                Actual Cost: Rs. {(order.actualShippingCost || 0).toFixed(2)}
                                            </p>
                                        </div>
                                        <div className={`text-xl font-bold ${
                                            order.shippingVariance > 0 
                                                ? 'text-green-600' 
                                                : 'text-red-600'
                                        }`}>
                                            {order.shippingVariance > 0 
                                                ? `+Rs. ${order.shippingVariance.toFixed(2)}` 
                                                : `-Rs. ${Math.abs(order.shippingVariance).toFixed(2)}`}
                                        </div>
                                    </div>
                                    <p className={`text-xs font-medium ${
                                        order.shippingVariance > 0 
                                            ? 'text-green-700' 
                                            : 'text-red-700'
                                    }`}>
                                        {order.shippingVariance > 0 
                                            ? '✓ Business Income: Actual cost was less than charged (increases profit)' 
                                            : '✗ Business Expense: Actual cost was more than charged (decreases profit)'}
                                    </p>
                                    {order.shippingVarianceDate && (
                                        <p className="text-xs text-gray-500 mt-1">
                                            Recorded: {new Date(order.shippingVarianceDate).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            )}
                            </div>
                        )}

                        {/* Order Summary Section - Always visible when editing or when there are products */}
                        {(isEditing || selectedProducts.length > 0) && (
                            <div className="card p-6">
                                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                                    <CurrencyDollarIcon className="h-5 w-5 mr-2 text-gray-700" />
                                    Order Summary
                                </h2>
                                <div className="space-y-3">
                                    {selectedProducts.length > 0 && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-lg font-bold text-gray-900">Products Total:</span>
                                            <span className="text-2xl font-bold text-green-600">
                                                Rs. {calculateProductsTotal().toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center">
                                        <span className="text-lg font-semibold text-gray-700">Shipping Charges:</span>
                                        {isEditing ? (
                                            <div className="flex items-center space-x-2">
                                                <input
                                                    type="number"
                                                    value={shippingCharges}
                                                    onChange={(e) => setShippingCharges(Math.max(0, parseFloat(e.target.value) || 0))}
                                                    min="0"
                                                    step="0.01"
                                                    className="w-40 px-3 py-2 text-lg font-bold text-blue-600 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShippingCharges(0)}
                                                    className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                                                    title="Waive shipping charges"
                                                >
                                                    Waive
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-lg font-bold text-blue-600">
                                                Rs. {(order.shippingCharges || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                            </span>
                                        )}
                                    </div>
                                    
                                    
                                    {/* Enhanced COD Fee Section in Edit Mode */}
                                    {isEditing && (() => {
                                        const codAmount = calculateCodAmount()
                                        const currentCodFee = codFeeOverride ? (manualCodFee || 0) : (calculatedCodFee || 0)
                                        const hasCodAmount = codAmount > 0
                                        
                                        return hasCodAmount && (
                                            <div className="mt-4 space-y-4 pt-3 border-t border-gray-200">
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                        Logistics Company
                                                    </label>
                                                    <select
                                                        value={selectedLogisticsCompanyId || ''}
                                                        onChange={(e) => {
                                                            setSelectedLogisticsCompanyId(e.target.value || null)
                                                            setCodFeeOverride(false)
                                                            setManualCodFee(null)
                                                        }}
                                                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 min-h-[44px]"
                                                    >
                                                        <option value="">Select Logistics Company</option>
                                                        {logisticsCompanies.filter(c => c.status === 'ACTIVE').map(company => (
                                                            <option key={company.id} value={company.id}>
                                                                {company.name} ({company.codFeeCalculationType?.replace('_', ' ')})
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        Select the logistics company to calculate COD fee automatically
                                                    </p>
                                                </div>

                                                {selectedLogisticsCompanyId && (
                                                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                                        <div className="flex justify-between items-center mb-2">
                                                            <span className="text-sm font-semibold text-gray-900">COD Amount:</span>
                                                            <span className="text-lg font-bold text-blue-600">
                                                                Rs. {codAmount.toFixed(2)}
                                                            </span>
                                                        </div>
                                                        
                                                        {codFeeCalculationDetails && (
                                                            <div className="mt-2 text-xs text-gray-600">
                                                                <p>
                                                                    <strong>Calculation:</strong> {codFeeCalculationDetails.type?.replace('_', ' ')}
                                                                    {codFeeCalculationDetails.company && ` - ${codFeeCalculationDetails.company.name}`}
                                                                </p>
                                                            </div>
                                                        )}

                                                        <div className="mt-3 flex items-center space-x-2">
                                                            <input
                                                                type="checkbox"
                                                                id="codFeeOverride"
                                                                checked={codFeeOverride}
                                                                onChange={(e) => {
                                                                    setCodFeeOverride(e.target.checked)
                                                                    if (e.target.checked) {
                                                                        setManualCodFee(calculatedCodFee || 0)
                                                                    }
                                                                }}
                                                                className="h-4 w-4 text-pink-600 focus:ring-pink-500 border-gray-300 rounded"
                                                            />
                                                            <label htmlFor="codFeeOverride" className="text-sm font-medium text-gray-700">
                                                                Override calculated COD fee
                                                            </label>
                                                        </div>

                                                        {codFeeOverride ? (
                                                            <div className="mt-3">
                                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                                    Manual COD Fee <span className="text-red-500">*</span>
                                                                </label>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    min="0"
                                                                    value={manualCodFee || ''}
                                                                    onChange={(e) => setManualCodFee(parseFloat(e.target.value) || 0)}
                                                                    className="w-full px-3 py-2 border-2 border-pink-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 min-h-[44px]"
                                                                    placeholder="Enter COD fee"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className="mt-3">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-sm font-semibold text-gray-900">Calculated COD Fee:</span>
                                                                    <span className="text-lg font-bold text-green-600">
                                                                        Rs. {(calculatedCodFee || 0).toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="mt-4 pt-3 border-t border-blue-300">
                                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                                COD Fee Payment Preference
                                                            </label>
                                                            <div className="space-y-2">
                                                                <label className="flex items-center cursor-pointer p-2 rounded border-2 border-gray-200 hover:border-blue-300">
                                                                    <input
                                                                        type="radio"
                                                                        name="codFeePaidByEdit"
                                                                        value="BUSINESS_OWNER"
                                                                        checked={codFeePaidBy === 'BUSINESS_OWNER'}
                                                                        onChange={(e) => setCodFeePaidBy(e.target.value)}
                                                                        className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500"
                                                                    />
                                                                    <div className="flex-1">
                                                                        <span className="text-sm font-medium text-gray-900">
                                                                            Business Owner Pays
                                                                        </span>
                                                                        <p className="text-xs text-gray-600">
                                                                            COD Fee: Rs. {currentCodFee.toFixed(2)} (Expense only)
                                                                        </p>
                                                                    </div>
                                                                </label>
                                                                <label className="flex items-center cursor-pointer p-2 rounded border-2 border-gray-200 hover:border-blue-300">
                                                                    <input
                                                                        type="radio"
                                                                        name="codFeePaidByEdit"
                                                                        value="CUSTOMER"
                                                                        checked={codFeePaidBy === 'CUSTOMER'}
                                                                        onChange={(e) => setCodFeePaidBy(e.target.value)}
                                                                        className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500"
                                                                    />
                                                                    <div className="flex-1">
                                                                        <span className="text-sm font-medium text-gray-900">
                                                                            Customer Pays
                                                                        </span>
                                                                        <p className="text-xs text-gray-600">
                                                                            COD Fee: Rs. {currentCodFee.toFixed(2)} (Added to Order Total)
                                                                        </p>
                                                                    </div>
                                                                </label>
                                                            </div>
                                                            {codFeePaidBy === 'CUSTOMER' && currentCodFee > 0 && (
                                                                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                                                                    <p className="text-xs text-blue-800">
                                                                        <strong>New Order Total:</strong> Rs. {(calculateOrderTotal() + currentCodFee).toFixed(2)}
                                                                    </p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {!selectedLogisticsCompanyId && hasCodAmount && (
                                                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                                        <p className="text-sm text-yellow-800">
                                                            <strong>Note:</strong> Select a logistics company to calculate COD fee automatically, or leave blank if no COD fee applies.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })()}
                                    <div className="flex justify-between items-center pt-3 border-t-2 border-gray-300">
                                        <span className="text-xl font-bold text-gray-900">Total Amount:</span>
                                        <span className="text-3xl font-bold text-pink-600">
                                            Rs. {calculateOrderTotal().toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Payment Section in Edit Mode - Mobile Optimized */}
                        {isEditing && (
                            <div className="card p-4 sm:p-6 mb-6">
                                <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center">
                                    <CurrencyDollarIcon className="h-5 w-5 sm:h-6 sm:w-6 mr-2 text-gray-700" />
                                    Payment Information
                                </h2>

                                {/* Payment Amount Input - Mobile Optimized */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm sm:text-base font-bold text-gray-900 mb-2 sm:mb-3">
                                            Payment Amount Received (Rs.)
                                            <span className="text-xs text-gray-500 font-normal ml-2 block sm:inline sm:ml-2">
                                                Amount customer has paid
                                            </span>
                                            {order.status === 'PENDING' && (
                                                <span className="text-xs text-blue-600 font-semibold ml-2 block sm:inline sm:ml-2 mt-1 sm:mt-0">
                                                    ⓘ Will be verified when order is confirmed
                                                </span>
                                            )}
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 font-semibold text-lg sm:text-xl">
                                                Rs.
                                            </span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={paymentAmount === null || paymentAmount === undefined ? 0 : paymentAmount}
                                                onChange={(e) => {
                                                    setPaymentAmountTouched(true) // Mark as touched when user types
                                                    const value = e.target.value
                                                    if (value === '' || value === null || value === undefined) {
                                                        setPaymentAmount(0) // Default to 0 if cleared
                                                    } else {
                                                        const numValue = parseFloat(value)
                                                        setPaymentAmount(isNaN(numValue) ? 0 : Math.max(0, numValue))
                                                    }
                                                }}
                                                className="w-full pl-14 sm:pl-16 pr-4 py-3 sm:py-4 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg sm:text-xl font-semibold"
                                                placeholder="0.00"
                                                inputMode="decimal"
                                            />
                                        </div>
                                        
                                        {/* Quick Action Buttons - Mobile Optimized */}
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPaymentAmountTouched(true) // Mark as touched when user clicks
                                                    setPaymentAmount(calculateProductsTotal())
                                                }}
                                                className="flex-1 sm:flex-none px-4 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-sm sm:text-base font-semibold border border-blue-200 active:scale-95 transition-transform"
                                            >
                                                Use Products Total
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPaymentAmountTouched(true) // Mark as touched when user clicks
                                                    setPaymentAmount(0)
                                                }}
                                                className="flex-1 sm:flex-none px-4 py-2.5 bg-gray-50 text-gray-700 hover:bg-gray-100 rounded-lg text-sm sm:text-base font-semibold border border-gray-200 active:scale-95 transition-transform"
                                            >
                                                Set to Zero
                                            </button>
                                        </div>
                                    </div>


                                    {/* Real-time Calculation Preview - Mobile Optimized */}
                                    {selectedProducts.length > 0 && (
                                        <div className="mt-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 sm:p-5 border-2 border-blue-200">
                                            <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-3 uppercase tracking-wide">
                                                Order Summary
                                            </h3>
                                            <div className="space-y-2 sm:space-y-3">
                                                <div className="flex justify-between items-center text-sm sm:text-base">
                                                    <span className="text-gray-700 font-medium">Products Total:</span>
                                                    <span className="font-bold text-gray-900">Rs. {calculateProductsTotal().toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm sm:text-base">
                                                    <span className="text-gray-700 font-medium">Shipping Charges:</span>
                                                    <span className="font-bold text-blue-600">Rs. {shippingCharges.toLocaleString()}</span>
                                                </div>
                                                <div className="pt-2 border-t-2 border-blue-300">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-base sm:text-lg font-bold text-gray-900">Order Total:</span>
                                                        <span className="text-xl sm:text-2xl font-bold text-green-600">
                                                            Rs. {calculateOrderTotal().toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
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

            {/* Unified Payment Center - All payment info and actions in one place */}
            {!isEditing && order && (
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
                    <div className="card p-4 sm:p-6">
                        {/* Payment Center Header */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 pb-4 border-b-2 border-gray-200 gap-4">
                            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
                                <CurrencyDollarIcon className="h-6 w-6 sm:h-7 sm:w-7 mr-2 text-blue-600" />
                                Payment Center
                            </h2>
                            {/* Quick Action Button - Mobile Optimized */}
                            {order.status === 'DISPATCHED' && (
                                <button
                                    onClick={handleReceivePayment}
                                    className="btn-primary flex items-center px-4 py-2.5 sm:px-6 bg-purple-600 hover:bg-purple-700 text-sm sm:text-base font-semibold rounded-lg shadow-md active:scale-95 transition-transform w-full sm:w-auto justify-center"
                                >
                                    <CurrencyDollarIcon className="h-5 w-5 mr-2" />
                                    <span className="hidden sm:inline">Receive Payment</span>
                                    <span className="sm:hidden">Receive Payment</span>
                                </button>
                            )}
                        </div>

                        {/* Payment Summary Cards - Mobile Grid */}
                        {(() => {
                            const paymentStatus = getPaymentStatus()
                            return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                    {/* Order Total */}
                                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 sm:p-5 border-2 border-blue-200">
                                        <p className="text-xs sm:text-sm font-semibold text-blue-800 uppercase tracking-wide mb-2">Order Total</p>
                                        <p className="text-2xl sm:text-3xl font-bold text-blue-700">
                                            Rs. {paymentStatus.total.toLocaleString()}
                                        </p>
                                    </div>

                                    {/* Paid Amount */}
                                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 sm:p-5 border-2 border-green-200">
                                        <p className="text-xs sm:text-sm font-semibold text-green-800 uppercase tracking-wide mb-2">Paid</p>
                                        <p className="text-2xl sm:text-3xl font-bold text-green-700">
                                            Rs. {paymentStatus.paid.toLocaleString()}
                                        </p>
                                    </div>

                                    {/* Remaining Balance */}
                                    <div className={`bg-gradient-to-br rounded-xl p-4 sm:p-5 border-2 ${
                                        paymentStatus.remaining > 0 
                                            ? 'from-red-50 to-red-100 border-red-200' 
                                            : 'from-green-50 to-green-100 border-green-200'
                                    }`}>
                                        <p className={`text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2 ${
                                            paymentStatus.remaining > 0 ? 'text-red-800' : 'text-green-800'
                                        }`}>Remaining</p>
                                        <p className={`text-2xl sm:text-3xl font-bold ${
                                            paymentStatus.remaining > 0 ? 'text-red-700' : 'text-green-700'
                                        }`}>
                                            Rs. {paymentStatus.remaining.toLocaleString()}
                                        </p>
                                    </div>

                                    {/* Payment Status Badge */}
                                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4 sm:p-5 border-2 border-gray-200 flex flex-col justify-center">
                                        <p className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wide mb-2">Status</p>
                                        <div className="flex items-center gap-2">
                                            {paymentStatus.isFullyPaid && (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800">
                                                    <CheckIcon className="h-4 w-4 mr-1" />
                                                    Fully Paid
                                                </span>
                                            )}
                                            {paymentStatus.isPartiallyPaid && (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-yellow-100 text-yellow-800">
                                                    ⚠ Partially Paid
                                                </span>
                                            )}
                                            {paymentStatus.isUnpaid && (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-800">
                                                    ✗ Unpaid
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Payment Details - Collapsible Sections for Mobile */}
                        <div className="space-y-4">
                            {/* Payment Claims & Verification - Only show if customer submitted order with a claimed payment amount */}
                            {/* This section only appears when order.paymentAmount > 0, meaning customer claimed they paid something */}
                            {order.paymentAmount && order.paymentAmount > 0 && (
                                <div className="bg-gray-50 rounded-lg p-4 sm:p-5 border border-gray-200">
                                    <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Payment Claims & Verification</h3>
                                    <div className="space-y-3">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white rounded-lg p-3 sm:p-4 border border-gray-200">
                                            <div className="flex-1">
                                                <p className="text-xs sm:text-sm font-semibold text-gray-600 mb-1">Claimed Payment</p>
                                                <p className={`text-lg sm:text-xl font-bold ${
                                                    order.paymentVerified ? 'text-gray-500 line-through' : 'text-yellow-700'
                                                }`}>
                                                    Rs. {(order.paymentAmount || 0).toLocaleString()}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Customer claimed they paid this amount
                                                </p>
                                            </div>
                                            {!order.paymentVerified && order.status !== 'PENDING' && (
                                                <button
                                                    onClick={() => {
                                                        setVerifyPaymentAmount(order.paymentAmount?.toString() || '')
                                                        setVerifyPaymentAccountId(order.paymentAccountId || null)
                                                        setShowVerifyPaymentModal(true)
                                                    }}
                                                    className="btn-primary px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-sm sm:text-base font-semibold rounded-lg whitespace-nowrap active:scale-95 transition-transform w-full sm:w-auto"
                                                >
                                                    <CheckIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2 inline" />
                                                    Verify Payment
                                                </button>
                                            )}
                                        </div>

                                        {order.paymentVerified ? (
                                            <>
                                                <div className="bg-green-50 rounded-lg p-3 sm:p-4 border border-green-200">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <p className="text-xs sm:text-sm font-semibold text-gray-700">Verified Payment</p>
                                                        <button
                                                            onClick={() => {
                                                                setUpdateVerifiedPaymentAmount((order.verifiedPaymentAmount || 0).toString())
                                                                setUpdateVerifiedPaymentAccountId(order.paymentAccountId || null)
                                                                setShowUpdateVerifiedPaymentModal(true)
                                                            }}
                                                            className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-semibold flex items-center"
                                                        >
                                                            <PencilIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                                            Edit
                                                        </button>
                                                    </div>
                                                    <p className="text-lg sm:text-xl font-bold text-green-700">
                                                        Rs. {(order.verifiedPaymentAmount || 0).toLocaleString()}
                                                    </p>
                                                    {order.paymentVerifiedAt && (
                                                        <p className="text-xs text-gray-500 mt-2">
                                                            Verified on {new Date(order.paymentVerifiedAt).toLocaleString()}
                                                        </p>
                                                    )}
                                                </div>
                                                {/* Show warning if verified amount differs from claimed amount */}
                                                {order.verifiedPaymentAmount < (order.paymentAmount || 0) && (
                                                    <div className="bg-orange-50 rounded-lg p-3 sm:p-4 border border-orange-200 mt-3">
                                                        <div className="flex items-start">
                                                            <ExclamationTriangleIcon className="h-5 w-5 text-orange-600 mr-2 flex-shrink-0 mt-0.5" />
                                                            <div className="flex-1">
                                                                <p className="text-xs sm:text-sm font-semibold text-orange-800 mb-1">Payment Discrepancy</p>
                                                                <div className="space-y-1 text-xs text-orange-700">
                                                                    <p>Customer claimed: <strong>Rs. {(order.paymentAmount || 0).toLocaleString()}</strong></p>
                                                                    <p>Actually received: <strong>Rs. {(order.verifiedPaymentAmount || 0).toLocaleString()}</strong></p>
                                                                    <p className="font-semibold text-orange-800 mt-2">
                                                                        Shortfall: Rs. {((order.paymentAmount || 0) - (order.verifiedPaymentAmount || 0)).toLocaleString()}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : order.status !== 'PENDING' && (
                                            <div className="bg-red-50 rounded-lg p-3 sm:p-4 border border-red-200">
                                                <p className="text-xs sm:text-sm font-semibold text-gray-700 mb-1">Verified Payment</p>
                                                <p className="text-lg sm:text-xl font-bold text-red-600">
                                                    Rs. 0.00 (Not Verified)
                                                </p>
                                                <p className="text-xs text-gray-600 mt-1">
                                                    Please verify the claimed payment was actually received
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Payment History - Collapsible */}
                            <div className="bg-white rounded-lg border border-gray-200">
                                <div className="p-4 sm:p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center">
                                            <CurrencyDollarIcon className="h-5 w-5 mr-2 text-gray-700" />
                                            Payment History
                                        </h3>
                                        {payments.length > 0 && (
                                            <span className="text-xs sm:text-sm font-semibold text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                                                {payments.length} {payments.length === 1 ? 'payment' : 'payments'}
                                            </span>
                                        )}
                                    </div>

                                    {loadingPayments ? (
                                        <div className="flex justify-center py-8">
                                            <LoadingSpinner />
                                        </div>
                                    ) : payments.length === 0 ? (
                                        <div className="text-center py-8 text-gray-500">
                                            <CurrencyDollarIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                                            <p className="text-sm sm:text-base">No payment records found</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {payments.map((payment) => (
                                                <div key={payment.id} className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200">
                                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="font-semibold text-gray-900 text-sm sm:text-base">
                                                                    {payment.paymentNumber}
                                                                </span>
                                                                {payment.paymentMethod && (
                                                                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">
                                                                        {payment.paymentMethod}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs sm:text-sm text-gray-600">
                                                                {new Date(payment.date).toLocaleDateString('en-US', {
                                                                    year: 'numeric',
                                                                    month: 'short',
                                                                    day: 'numeric',
                                                                    hour: '2-digit',
                                                                    minute: '2-digit'
                                                                })}
                                                            </p>
                                                            {payment.account && (
                                                                <p className="text-xs text-gray-500 mt-1">
                                                                    {payment.account.name} ({payment.account.code})
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="text-left sm:text-right">
                                                            <p className="text-xl sm:text-2xl font-bold text-green-600">
                                                                Rs. {payment.amount.toLocaleString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Payment Summary Footer */}
                                            <div className="mt-4 pt-4 border-t-2 border-gray-300 bg-gray-50 rounded-lg p-4">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="font-semibold text-gray-900 text-base sm:text-lg">Total Paid:</span>
                                                    <span className="text-xl sm:text-2xl font-bold text-green-600">
                                                        Rs. {payments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
                                                    </span>
                                                </div>
                                                {(() => {
                                                    const paymentStatus = getPaymentStatus()
                                                    return paymentStatus.remaining > 0 && (
                                                        <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                                                            <span className="text-sm sm:text-base text-gray-600">Remaining Balance:</span>
                                                            <span className="text-lg sm:text-xl font-semibold text-red-600">
                                                                Rs. {paymentStatus.remaining.toLocaleString()}
                                                            </span>
                                                        </div>
                                                    )
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Payment Receipt */}
                            {order.paymentReceipt && (
                                <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
                                    <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3">Payment Receipt</h3>
                                    <div className="relative group rounded-lg overflow-hidden border-2 border-gray-300">
                                        <img
                                            src={order.paymentReceipt}
                                            alt="Receipt"
                                            className="w-full h-auto cursor-pointer hover:opacity-95 transition-opacity"
                                            onClick={() => window.open(order.paymentReceipt, '_blank')}
                                        />
                                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity flex items-center justify-center">
                                            <span className="text-white opacity-0 group-hover:opacity-100 text-sm font-semibold">
                                                Click to view full size
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
                                    setPaymentReceiveAccountId(null)
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

                            {/* Payment Account Selection */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Payment Account <span className="text-red-500">*</span>
                                </label>
                                <PaymentAccountSelector
                                    value={paymentReceiveAccountId}
                                    onChange={setPaymentReceiveAccountId}
                                    showQuickAdd={true}
                                    required={true}
                                    className="w-full"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Select the account where payment was received (Cash or Bank)
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => {
                                        setShowPaymentModal(false)
                                        setPaymentInput('')
                                        setPaymentReceiveAccountId(null)
                                    }}
                                    className="flex-1 btn-secondary px-6 py-3"
                                    disabled={processingPayment}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmitPayment}
                                    className="flex-1 btn-primary px-6 py-3 bg-purple-600 hover:bg-purple-700"
                                    disabled={processingPayment || !paymentInput || parseFloat(paymentInput) <= 0 || !paymentReceiveAccountId}
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

            {/* Shipping Cost Adjustment Modal */}
            {showShippingAdjustmentModal && order && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-gray-900 mb-4">Adjust Shipping Cost</h3>
                            <div className="space-y-4">
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-700">Customer Charged:</span>
                                        <span className="text-lg font-bold text-blue-600">
                                            Rs. {(order.shippingCharges || 0).toFixed(2)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        This is the amount committed to the customer and will not change
                                    </p>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Actual Shipping Cost <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={adjustmentActualCost !== null && adjustmentActualCost !== undefined ? adjustmentActualCost : ''}
                                        onChange={(e) => {
                                            const value = e.target.value
                                            if (value === '' || value === null) {
                                                setAdjustmentActualCost(null)
                                            } else {
                                                const numValue = parseFloat(value)
                                                setAdjustmentActualCost(isNaN(numValue) ? null : Math.max(0, numValue))
                                            }
                                        }}
                                        placeholder="Enter actual shipping cost"
                                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Enter the actual amount paid to logistics company
                                    </p>
                                </div>

                                {adjustmentActualCost !== null && adjustmentActualCost !== undefined && order.shippingCharges > 0 && (() => {
                                    const variance = (order.shippingCharges || 0) - adjustmentActualCost
                                    const isExpense = variance < 0
                                    const isIncome = variance > 0
                                    
                                    return (
                                        <div className={`p-3 rounded-lg border-2 ${
                                            isExpense
                                                ? 'bg-red-50 border-red-300' 
                                                : isIncome
                                                ? 'bg-green-50 border-green-300'
                                                : 'bg-gray-50 border-gray-300'
                                        }`}>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-sm font-medium text-gray-700">Variance:</span>
                                                <span className={`text-lg font-bold ${
                                                    isExpense
                                                        ? 'text-red-600' 
                                                        : isIncome
                                                        ? 'text-green-600'
                                                        : 'text-gray-600'
                                                }`}>
                                                    {isExpense
                                                        ? `-Rs. ${Math.abs(variance).toFixed(2)} (Business Expense)`
                                                        : isIncome
                                                        ? `+Rs. ${variance.toFixed(2)} (Business Income)`
                                                        : 'No variance'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-600 mt-1">
                                                {isExpense
                                                    ? `Business will bear Rs. ${Math.abs(variance).toFixed(2)} as expense`
                                                    : isIncome
                                                    ? `Business will gain Rs. ${variance.toFixed(2)} as income`
                                                    : 'No difference between charged and actual cost'}
                                            </p>
                                        </div>
                                    )
                                })()}

                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-xs text-yellow-800">
                                        <strong>Note:</strong> This records the actual cost paid. Customer commitment remains unchanged at Rs. {(order.shippingCharges || 0).toFixed(2)}.
                                    </p>
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={() => {
                                            setShowShippingAdjustmentModal(false)
                                            setAdjustmentActualCost(null)
                                        }}
                                        className="flex-1 px-4 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={adjustShippingCost}
                                        disabled={adjustmentActualCost === null || adjustmentActualCost === undefined}
                                        className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                                    >
                                        Record Shipping Cost
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Verify Payment Modal */}
            {showVerifyPaymentModal && order && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-gray-900 mb-4">Verify Payment</h3>
                            <div className="space-y-4">
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-700">Customer Claimed:</span>
                                        <span className="text-lg font-bold text-yellow-700">
                                            Rs. {(order.paymentAmount || 0).toFixed(2)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        This is the amount the customer claimed to have paid
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Verified Amount (Rs.) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={verifyPaymentAmount}
                                        onChange={(e) => setVerifyPaymentAmount(e.target.value)}
                                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 bg-white text-gray-900 text-lg font-semibold"
                                        placeholder="0.00"
                                        disabled={verifyingPayment}
                                        autoFocus
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Enter the actual amount you received and verified
                                    </p>
                                </div>

                                {/* Warning if verified amount differs from claimed */}
                                {parseFloat(verifyPaymentAmount) > 0 && parseFloat(verifyPaymentAmount) < (order.paymentAmount || 0) && (
                                    <div className="p-3 bg-orange-50 border border-orange-300 rounded-lg">
                                        <div className="flex items-start">
                                            <ExclamationTriangleIcon className="h-5 w-5 text-orange-600 mr-2 flex-shrink-0 mt-0.5" />
                                            <div className="flex-1">
                                                <p className="text-sm font-semibold text-orange-800">Payment Shortfall Detected</p>
                                                <p className="text-xs text-orange-700 mt-1">
                                                    Customer claimed <strong>Rs. {(order.paymentAmount || 0).toFixed(2)}</strong>, 
                                                    but you're verifying only <strong>Rs. {parseFloat(verifyPaymentAmount).toFixed(2)}</strong>.
                                                </p>
                                                <p className="text-xs text-orange-700 mt-1">
                                                    Shortfall: <strong>Rs. {((order.paymentAmount || 0) - parseFloat(verifyPaymentAmount)).toFixed(2)}</strong>
                                                </p>
                                                <p className="text-xs text-orange-600 mt-2 font-medium">
                                                    The customer will still owe the remaining balance after verification.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Payment Account <span className="text-red-500">*</span>
                                    </label>
                                    <PaymentAccountSelector
                                        value={verifyPaymentAccountId}
                                        onChange={setVerifyPaymentAccountId}
                                        showQuickAdd={true}
                                        required={true}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Select the account where payment was received
                                    </p>
                                </div>

                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <p className="text-xs text-blue-800">
                                        <strong>Note:</strong> This will create accounting entries (Debit Cash/Bank, Credit AR) 
                                        and record the payment in payment history.
                                    </p>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => {
                                            setShowVerifyPaymentModal(false)
                                            setVerifyPaymentAmount('')
                                            setVerifyPaymentAccountId(null)
                                        }}
                                        className="flex-1 btn-secondary px-6 py-3"
                                        disabled={verifyingPayment}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleVerifyPayment}
                                        className="flex-1 btn-primary px-6 py-3 bg-yellow-600 hover:bg-yellow-700"
                                        disabled={verifyingPayment || !verifyPaymentAmount || parseFloat(verifyPaymentAmount) <= 0 || !verifyPaymentAccountId}
                                    >
                                        {verifyingPayment ? (
                                            <>
                                                <LoadingSpinner size="sm" className="mr-2" />
                                                Verifying...
                                            </>
                                        ) : (
                                            <>
                                                <CheckIcon className="h-5 w-5 mr-2" />
                                                Verify Payment
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Update Verified Payment Modal */}
            {showUpdateVerifiedPaymentModal && order && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-gray-900 mb-4">Update Verified Payment</h3>
                            <div className="space-y-4">
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-700">Current Verified Amount:</span>
                                        <span className="text-lg font-bold text-blue-700">
                                            Rs. {(order.verifiedPaymentAmount || 0).toFixed(2)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        This will reverse the old accounting entries and create new ones with the updated amount
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        New Verified Amount (Rs.) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={updateVerifiedPaymentAmount}
                                        onChange={(e) => setUpdateVerifiedPaymentAmount(e.target.value)}
                                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 text-lg font-semibold"
                                        placeholder="0.00"
                                        disabled={updatingVerifiedPayment}
                                        autoFocus
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Enter the corrected verified amount
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Payment Account <span className="text-red-500">*</span>
                                    </label>
                                    <PaymentAccountSelector
                                        value={updateVerifiedPaymentAccountId}
                                        onChange={setUpdateVerifiedPaymentAccountId}
                                        showQuickAdd={true}
                                        required={true}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Select the account where payment was received (can be different from original)
                                    </p>
                                </div>

                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-xs text-yellow-800">
                                        <strong>Warning:</strong> This will:
                                        <ul className="list-disc list-inside mt-1 space-y-1">
                                            <li>Reverse the previous accounting transaction</li>
                                            <li>Create a new accounting transaction with the updated amount</li>
                                            <li>Update the payment record</li>
                                            <li>Update customer balance accordingly</li>
                                        </ul>
                                    </p>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => {
                                            setShowUpdateVerifiedPaymentModal(false)
                                            setUpdateVerifiedPaymentAmount('')
                                            setUpdateVerifiedPaymentAccountId(null)
                                        }}
                                        className="flex-1 btn-secondary px-6 py-3"
                                        disabled={updatingVerifiedPayment}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleUpdateVerifiedPayment}
                                        className="flex-1 btn-primary px-6 py-3 bg-blue-600 hover:bg-blue-700"
                                        disabled={updatingVerifiedPayment || !updateVerifiedPaymentAmount || parseFloat(updateVerifiedPaymentAmount) <= 0 || !updateVerifiedPaymentAccountId}
                                    >
                                        {updatingVerifiedPayment ? (
                                            <>
                                                <LoadingSpinner size="sm" className="mr-2" />
                                                Updating...
                                            </>
                                        ) : (
                                            <>
                                                <PencilIcon className="h-5 w-5 mr-2" />
                                                Update Payment
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Order with Payment Verification Modal */}
            {showConfirmWithPaymentModal && order && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-gray-900 mb-4">Confirm Order & Verify Payment</h3>
                            <div className="space-y-4">
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-700">Customer Claimed:</span>
                                        <span className="text-lg font-bold text-yellow-700">
                                            Rs. {(order.paymentAmount || 0).toFixed(2)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                        This is the amount the customer claimed to have paid
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Verified Amount (Rs.) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={confirmPaymentAmount}
                                        onChange={(e) => {
                                            setConfirmPaymentAmount(e.target.value)
                                        }}
                                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 bg-white text-gray-900 text-lg font-semibold"
                                        placeholder="0.00"
                                        disabled={confirmingOrder}
                                        autoFocus
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Enter the actual amount you received and verified
                                    </p>
                                </div>

                                {/* Warning if verified amount differs from claimed */}
                                {parseFloat(confirmPaymentAmount) > 0 && parseFloat(confirmPaymentAmount) < (order.paymentAmount || 0) && (
                                    <div className="p-3 bg-orange-50 border border-orange-300 rounded-lg">
                                        <div className="flex items-start">
                                            <ExclamationTriangleIcon className="h-5 w-5 text-orange-600 mr-2 flex-shrink-0 mt-0.5" />
                                            <div className="flex-1">
                                                <p className="text-sm font-semibold text-orange-800">Payment Shortfall Detected</p>
                                                <p className="text-xs text-orange-700 mt-1">
                                                    Customer claimed <strong>Rs. {(order.paymentAmount || 0).toFixed(2)}</strong>, 
                                                    but you're verifying only <strong>Rs. {parseFloat(confirmPaymentAmount).toFixed(2)}</strong>.
                                                </p>
                                                <p className="text-xs text-orange-700 mt-1">
                                                    Shortfall: <strong>Rs. {((order.paymentAmount || 0) - parseFloat(confirmPaymentAmount)).toFixed(2)}</strong>
                                                </p>
                                                <p className="text-xs text-orange-600 mt-2 font-medium">
                                                    The customer will still owe the remaining balance after confirmation.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Payment Account <span className="text-red-500">*</span>
                                    </label>
                                    <PaymentAccountSelector
                                        value={confirmPaymentAccountId}
                                        onChange={setConfirmPaymentAccountId}
                                        showQuickAdd={true}
                                        required={true}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Select the account where payment was received (Cash or Bank)
                                    </p>
                                </div>

                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <p className="text-xs text-blue-800">
                                        <strong>Note:</strong> This will:
                                        <ul className="list-disc list-inside mt-1 space-y-1">
                                            <li>Confirm the order and update status to CONFIRMED</li>
                                            <li>Create accounting entries (Debit Cash/Bank, Credit AR)</li>
                                            <li>Record the payment in payment history</li>
                                            <li>Update customer balance</li>
                                        </ul>
                                    </p>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => {
                                            setShowConfirmWithPaymentModal(false)
                                            setConfirmPaymentAmount('')
                                            setConfirmPaymentAccountId(null)
                                        }}
                                        className="flex-1 btn-secondary px-6 py-3"
                                        disabled={confirmingOrder}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            const amount = parseFloat(confirmPaymentAmount) || 0
                                            if (amount <= 0) {
                                                toast.error('Verified amount must be greater than 0')
                                                return
                                            }
                                            if (!confirmPaymentAccountId) {
                                                toast.error('Please select a payment account')
                                                return
                                            }
                                            doConfirmOrder(amount, confirmPaymentAccountId)
                                        }}
                                        className="flex-1 btn-primary px-6 py-3 bg-yellow-600 hover:bg-yellow-700"
                                        disabled={confirmingOrder || !confirmPaymentAmount || parseFloat(confirmPaymentAmount) <= 0 || !confirmPaymentAccountId}
                                    >
                                        {confirmingOrder ? (
                                            <>
                                                <LoadingSpinner size="sm" className="mr-2" />
                                                Confirming...
                                            </>
                                        ) : (
                                            <>
                                                <CheckIcon className="h-5 w-5 mr-2" />
                                                Confirm & Verify Payment
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Sticky Action Bar - Mobile Optimized */}
            {isEditing && (
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 shadow-2xl z-50">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
                                <PencilIcon className="h-4 w-4" />
                                <span className="font-semibold">Editing Order #{order.orderNumber}</span>
                            </div>
                            <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                                <button
                                    onClick={handleCancelEdit}
                                    className="flex-1 sm:flex-none px-4 sm:px-6 py-3 sm:py-2.5 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 active:scale-95 transition-transform text-sm sm:text-base"
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveOrder}
                                    disabled={saving}
                                    className="flex-1 sm:flex-none px-4 sm:px-6 py-3 sm:py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform text-sm sm:text-base flex items-center justify-center gap-2"
                                >
                                    {saving ? (
                                        <>
                                            <ArrowPathIcon className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                                            <span>Saving...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                                            <span>Save Changes</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add bottom padding when editing to prevent content from being hidden behind sticky bar */}
            {isEditing && (
                <div className="h-20 sm:h-24"></div>
            )}

            {/* WhatsApp Confirmation Modal */}
            <WhatsAppConfirmationModal
                isOpen={whatsappModal.isOpen}
                onClose={handleWhatsAppCancel}
                onConfirm={handleWhatsAppConfirm}
                customerPhone={whatsappModal.phone}
            />
        </ModernLayout>
    )
}

export default OrderDetailsPage
