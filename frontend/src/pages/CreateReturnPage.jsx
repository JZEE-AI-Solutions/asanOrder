import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import toast from 'react-hot-toast'
import LoadingSpinner from '../components/LoadingSpinner'
import ModernLayout from '../components/ModernLayout'
import { Card, CardContent } from '../components/ui/Card'

const CreateReturnPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const customerId = searchParams.get('customerId')
  const orderIdParam = searchParams.get('orderId')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [customer, setCustomer] = useState(null)
  const [orders, setOrders] = useState([])
  const [selectedOrderId, setSelectedOrderId] = useState(orderIdParam || '')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [returnType, setReturnType] = useState('CUSTOMER_FULL')
  const [selectedProducts, setSelectedProducts] = useState([])
  const [shippingChargeHandling, setShippingChargeHandling] = useState('FULL_REFUND')
  const [reason, setReason] = useState('')
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0])
  const [calculatedRefund, setCalculatedRefund] = useState(0)
  const [advanceBalance, setAdvanceBalance] = useState(0)
  const [existingReturns, setExistingReturns] = useState([])
  const [orderReturnStatus, setOrderReturnStatus] = useState(null)

  useEffect(() => {
    if (customerId) {
      fetchCustomerData()
    } else if (orderIdParam) {
      fetchOrderData()
    } else {
      setLoading(false)
    }
  }, [customerId, orderIdParam])

  useEffect(() => {
    if (!selectedOrderId) return
    const orderFromList = orders.find(o => o.id === selectedOrderId)
    setOrderReturnStatus(orderFromList?.returnStatus ?? null)
    if (orderFromList?.id) fetchExistingReturns(orderFromList.id)
    // Fetch full order (with orderItems) for return line display and payload
    const fetchFullOrder = async () => {
      try {
        const res = await api.get(`/order/${selectedOrderId}`)
        setSelectedOrder(res.data.order)
      } catch (e) {
        if (orderFromList) setSelectedOrder(orderFromList)
      }
    }
    fetchFullOrder()
  }, [selectedOrderId, orders])

  useEffect(() => {
    if (selectedOrder) calculateRefund()
  }, [selectedOrder, returnType, selectedProducts, shippingChargeHandling])

  const fetchExistingReturns = async (orderId) => {
    try {
      const returnsRes = await api.get('/accounting/order-returns', {
        params: { orderId }
      }).catch(() => ({ data: { data: [] } }))
      
      if (returnsRes.data?.success) {
        const activeReturns = (returnsRes.data.data || []).filter(
          r => r.status !== 'REJECTED'
        )
        setExistingReturns(activeReturns)
      }
    } catch (error) {
      console.error('Failed to fetch existing returns:', error)
    }
  }

  const fetchCustomerData = async () => {
    try {
      setLoading(true)
      const [customerRes, ordersRes, balanceRes] = await Promise.all([
        api.get(`/customer/${customerId}`),
        api.get(`/customer/${customerId}/orders`),
        api.get(`/accounting/balances/customers/${customerId}`).catch(() => ({ data: null }))
      ])

      setCustomer(customerRes.data.customer)
      setOrders(ordersRes.data.orders || [])
      if (balanceRes.data) {
        setAdvanceBalance(balanceRes.data.advanceBalance || 0)
      }

      // Auto-select first order if only one
      if (ordersRes.data.orders?.length === 1) {
        setSelectedOrderId(ordersRes.data.orders[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch customer data:', error)
      toast.error('Failed to load customer data')
      navigate('/business/customers')
    } finally {
      setLoading(false)
    }
  }

  const fetchOrderData = async () => {
    try {
      setLoading(true)
      const orderRes = await api.get(`/order/${orderIdParam}`)
      const order = orderRes.data.order
      
      setSelectedOrder(order)
      setOrders([order])
      setSelectedOrderId(orderIdParam)
      setOrderReturnStatus(order.returnStatus)
      
      // Fetch existing returns for this order
      const returnsRes = await api.get('/accounting/order-returns', {
        params: { orderId: orderIdParam }
      }).catch(() => ({ data: { data: [] } }))
      
      if (returnsRes.data?.success) {
        const activeReturns = (returnsRes.data.data || []).filter(
          r => r.status !== 'REJECTED'
        )
        setExistingReturns(activeReturns)
      }
      
      if (order.customerId) {
        const customerRes = await api.get(`/customer/${order.customerId}`).catch(() => null)
        if (customerRes) {
          setCustomer(customerRes.data.customer)
          setAdvanceBalance(customerRes.data.customer.advanceBalance || 0)
        }
      }
    } catch (error) {
      console.error('Failed to fetch order data:', error)
      toast.error('Failed to load order data')
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
      return {}
    }
  }

  const getLineKey = (line) => {
    const vid = line?.productVariantId ?? line?.variantId
    const pid = line?.id
    if (!pid) return String(line?.name || '')
    return vid ? `${pid}_${vid}` : pid
  }

  const calculateRefund = () => {
    if (!selectedOrder) return

    const qtyMap = parseJSON(selectedOrder.productQuantities) || {}
    const priceMap = parseJSON(selectedOrder.productPrices) || {}
    const shippingCharges = selectedOrder.shippingCharges || 0
    const lines = (selectedOrder.orderItems && selectedOrder.orderItems.length > 0)
      ? selectedOrder.orderItems.map(oi => ({
          id: oi.productId,
          productVariantId: oi.productVariantId,
          variantId: oi.productVariantId,
          quantity: oi.quantity,
          price: oi.price,
          name: oi.productName
        }))
      : (parseJSON(selectedOrder.selectedProducts) || []).map(p => ({ ...p, id: p.id || p }))

    let productsValue = 0
    if (returnType === 'CUSTOMER_FULL') {
      lines.forEach(product => {
        const key = getLineKey(product)
        const quantity = product.quantity ?? qtyMap[key] ?? qtyMap[product.id] ?? 1
        const price = product.price ?? priceMap[key] ?? priceMap[product.id] ?? 0
        productsValue += price * quantity
      })
    } else {
      selectedProducts.forEach(product => {
        const key = getLineKey(product)
        const quantity = product.quantity ?? qtyMap[key] ?? qtyMap[product.id] ?? 1
        const price = product.price ?? priceMap[key] ?? priceMap[product.id] ?? 0
        productsValue += price * quantity
      })
    }

    let finalRefund = productsValue
    let advanceUsed = 0

    // Handle shipping charges
    if (shippingChargeHandling === 'FULL_REFUND') {
      finalRefund += shippingCharges
    } else if (shippingChargeHandling === 'DEDUCT_FROM_ADVANCE') {
      if (advanceBalance >= shippingCharges) {
        advanceUsed = shippingCharges
      } else {
        advanceUsed = advanceBalance
        finalRefund -= (shippingCharges - advanceBalance)
      }
    } else if (shippingChargeHandling === 'CUSTOMER_PAYS') {
      finalRefund -= shippingCharges
    }

    setCalculatedRefund(Math.max(0, finalRefund))
  }

  const handleProductToggle = (line) => {
    if (returnType !== 'CUSTOMER_PARTIAL') return
    const key = getLineKey(line)
    const isSelected = selectedProducts.some(p => getLineKey(p) === key)
    if (isSelected) {
      setSelectedProducts(selectedProducts.filter(p => getLineKey(p) !== key))
    } else {
      setSelectedProducts([...selectedProducts, line])
    }
  }

  const handleReturnTypeChange = (type) => {
    setReturnType(type)
    if (type === 'CUSTOMER_FULL') {
      setSelectedProducts([])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!selectedOrderId) {
      toast.error('Please select an order')
      return
    }

    if (returnType === 'CUSTOMER_PARTIAL' && selectedProducts.length === 0) {
      toast.error('Please select at least one product for partial return')
      return
    }

    if (!reason.trim()) {
      toast.error('Please provide a reason for the return')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        orderId: selectedOrderId,
        returnType,
        reason: reason.trim(),
        returnDate: new Date(returnDate).toISOString(),
        shippingChargeHandling
      }

      if (returnType === 'CUSTOMER_PARTIAL' && selectedProducts.length > 0) {
        const qtyMap = parseJSON(selectedOrder.productQuantities) || {}
        const priceMap = parseJSON(selectedOrder.productPrices) || {}
        payload.selectedProducts = selectedProducts.map(product => {
          const key = getLineKey(product)
          return {
            id: product.id || product,
            productVariantId: product.productVariantId ?? product.variantId ?? null,
            variantId: product.variantId ?? product.productVariantId ?? null,
            name: product.name || 'Product',
            quantity: product.quantity ?? qtyMap[key] ?? qtyMap[product.id] ?? 1,
            price: product.price ?? priceMap[key] ?? priceMap[product.id] ?? 0
          }
        })
      }

      const response = await api.post('/accounting/order-returns', payload)

      if (response.data.success) {
        toast.success(`Return created successfully! Return #: ${response.data.data.returnNumber}`)
        
        // Navigate based on context
        if (customerId) {
          navigate(`/business/customers/${customerId}?tab=returns`)
        } else {
          navigate('/business/accounting/returns')
        }
      }
    } catch (error) {
      console.error('Error creating return:', error)
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || 'Failed to create return'
      toast.error(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <ModernLayout>
        <LoadingSpinner className="min-h-screen" />
      </ModernLayout>
    )
  }

  const orderProducts = (() => {
    if (!selectedOrder) return []
    if (selectedOrder.orderItems && selectedOrder.orderItems.length > 0) {
      return selectedOrder.orderItems.map(oi => ({
        id: oi.productId,
        name: oi.productName,
        productVariantId: oi.productVariantId ?? null,
        variantId: oi.productVariantId ?? null,
        color: oi.color ?? null,
        size: oi.size ?? null,
        quantity: oi.quantity ?? 1,
        price: oi.price ?? 0
      }))
    }
    return parseJSON(selectedOrder.selectedProducts) || []
  })()

  const productQuantities = selectedOrder ? parseJSON(selectedOrder.productQuantities) || {} : {}
  const productPrices = selectedOrder ? parseJSON(selectedOrder.productPrices) || {} : {}
  const shippingCharges = selectedOrder?.shippingCharges || 0

  return (
    <ModernLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => {
              if (customerId) {
                navigate(`/business/customers/${customerId}?tab=returns`)
              } else {
                navigate('/business/accounting/returns')
              }
            }}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-brand-600">Create Return</h1>
            <p className="text-gray-500 mt-1">Create a new customer order return</p>
          </div>
        </div>

        {/* Customer Info */}
        {customer && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{customer.name || 'N/A'}</h3>
                  <p className="text-sm text-gray-600">{customer.phoneNumber}</p>
                </div>
                {advanceBalance > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Advance Balance</p>
                    <p className="text-lg font-semibold text-green-600">Rs. {advanceBalance.toFixed(2)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* Order Selection */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Information</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Order <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedOrderId}
                      onChange={(e) => setSelectedOrderId(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                      required
                      disabled={!!orderIdParam}
                    >
                      <option value="">Select an order...</option>
                      {orders.map(order => (
                        <option key={order.id} value={order.id}>
                          {order.orderNumber} - {new Date(order.createdAt).toLocaleDateString()} - Rs. {(() => {
                            const products = parseJSON(order.selectedProducts) || []
                            const quantities = parseJSON(order.productQuantities) || {}
                            const prices = parseJSON(order.productPrices) || {}
                            let total = 0
                            products.forEach(p => {
                              const id = p.id || p
                              const qty = quantities[id] || 1
                              const price = prices[id] || p.price || 0
                              total += price * qty
                            })
                            return (total + (order.shippingCharges || 0)).toFixed(2)
                          })()}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedOrder && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Order Number</p>
                          <p className="font-semibold text-gray-900">{selectedOrder.orderNumber}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Order Date</p>
                          <p className="font-semibold text-gray-900">
                            {new Date(selectedOrder.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Shipping Charges</p>
                          <p className="font-semibold text-gray-900">Rs. {shippingCharges.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Order Status</p>
                          <p className="font-semibold text-gray-900">{selectedOrder.status}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Existing Returns Warning */}
            {existingReturns.length > 0 && (
              <Card className="bg-yellow-50 border-yellow-200">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3">
                    <XMarkIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-yellow-900 mb-2">
                        Existing Returns Found
                      </h3>
                      <p className="text-sm text-yellow-800 mb-3">
                        This order already has {existingReturns.length} return(s):
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800 mb-3">
                        {existingReturns.map(ret => (
                          <li key={ret.id}>
                            {ret.returnNumber} - {ret.returnType.replace('_', ' ')} - 
                            Rs. {ret.totalAmount.toFixed(2)} - {ret.status}
                          </li>
                        ))}
                      </ul>
                      {orderReturnStatus === 'FULL' && (
                        <p className="text-sm font-semibold text-red-600">
                          ⚠️ This order has already been fully returned. Creating another return may cause issues.
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Return Type */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Return Type</h2>
                
                <div className="space-y-3">
                  <label className={`flex items-center p-4 border-2 rounded-lg transition-colors ${
                    orderReturnStatus === 'FULL' || existingReturns.some(r => r.returnType === 'CUSTOMER_FULL')
                      ? 'opacity-50 cursor-not-allowed bg-gray-100'
                      : 'cursor-pointer hover:bg-gray-50'
                  }`}>
                    <input
                      type="radio"
                      name="returnType"
                      value="CUSTOMER_FULL"
                      checked={returnType === 'CUSTOMER_FULL'}
                      onChange={(e) => handleReturnTypeChange(e.target.value)}
                      disabled={orderReturnStatus === 'FULL' || existingReturns.some(r => r.returnType === 'CUSTOMER_FULL')}
                      className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">Full Return</div>
                      <div className="text-sm text-gray-600">Return all products from the order</div>
                      {(orderReturnStatus === 'FULL' || existingReturns.some(r => r.returnType === 'CUSTOMER_FULL')) && (
                        <div className="text-xs text-red-600 mt-1">
                          Full return already exists for this order
                        </div>
                      )}
                    </div>
                  </label>

                  <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="radio"
                      name="returnType"
                      value="CUSTOMER_PARTIAL"
                      checked={returnType === 'CUSTOMER_PARTIAL'}
                      onChange={(e) => handleReturnTypeChange(e.target.value)}
                      className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">Partial Return</div>
                      <div className="text-sm text-gray-600">Return selected products only</div>
                    </div>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Product Selection (for partial returns) */}
            {returnType === 'CUSTOMER_PARTIAL' && selectedOrder && orderProducts.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Products to Return</h2>
                  
                  <div className="space-y-3">
                    {orderProducts.map((line, index) => {
                      const lineKey = getLineKey(line)
                      const quantity = line.quantity ?? productQuantities[lineKey] ?? productQuantities[line.id] ?? 1
                      const price = line.price ?? productPrices[lineKey] ?? productPrices[line.id] ?? 0
                      const total = price * quantity
                      const isSelected = selectedProducts.some(p => getLineKey(p) === lineKey)
                      const variantLabel = [line.color, line.size].filter(Boolean).join(' · ')

                      return (
                        <label
                          key={lineKey || index}
                          className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                            isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleProductToggle(line)}
                            className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900">
                              {line.name || 'Product'}
                              {variantLabel && <span className="text-gray-600 font-normal"> · {variantLabel}</span>}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              Quantity: {quantity} × Rs. {price.toFixed(2)} = Rs. {total.toFixed(2)}
                            </div>
                          </div>
                          {isSelected && (
                            <CheckIcon className="h-5 w-5 text-blue-600" />
                          )}
                        </label>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Shipping Charge Handling */}
            {selectedOrder && (
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Shipping Charge Handling</h2>
                  
                  <div className="space-y-3">
                    <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="shippingChargeHandling"
                        value="FULL_REFUND"
                        checked={shippingChargeHandling === 'FULL_REFUND'}
                        onChange={(e) => setShippingChargeHandling(e.target.value)}
                        className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">Full Refund</div>
                        <div className="text-sm text-gray-600">
                          Refund shipping charges along with products (Rs. {shippingCharges.toFixed(2)})
                        </div>
                      </div>
                    </label>

                    <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="shippingChargeHandling"
                        value="CUSTOMER_PAYS"
                        checked={shippingChargeHandling === 'CUSTOMER_PAYS'}
                        onChange={(e) => setShippingChargeHandling(e.target.value)}
                        className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">Customer Pays</div>
                        <div className="text-sm text-gray-600">
                          Customer pays shipping charges (deducted from refund)
                        </div>
                      </div>
                    </label>

                    {advanceBalance > 0 && (
                      <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                        <input
                          type="radio"
                          name="shippingChargeHandling"
                          value="DEDUCT_FROM_ADVANCE"
                          checked={shippingChargeHandling === 'DEDUCT_FROM_ADVANCE'}
                          onChange={(e) => setShippingChargeHandling(e.target.value)}
                          className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">Deduct from Advance Balance</div>
                          <div className="text-sm text-gray-600">
                            Deduct shipping charges from customer's advance balance (Rs. {advanceBalance.toFixed(2)} available)
                          </div>
                        </div>
                      </label>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Return Details */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Return Details</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Return Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reason for Return <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter reason for return..."
                      required
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Refund Calculation Preview */}
            {selectedOrder && calculatedRefund > 0 && (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Refund Calculation</h2>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Products Value:</span>
                      <span className="font-semibold text-gray-900">
                        Rs. {(calculatedRefund - (shippingChargeHandling === 'FULL_REFUND' ? shippingCharges : 0) + (shippingChargeHandling === 'CUSTOMER_PAYS' ? shippingCharges : 0)).toFixed(2)}
                      </span>
                    </div>
                    {shippingChargeHandling === 'FULL_REFUND' && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Shipping Refund:</span>
                        <span className="font-semibold text-green-600">+ Rs. {shippingCharges.toFixed(2)}</span>
                      </div>
                    )}
                    {shippingChargeHandling === 'CUSTOMER_PAYS' && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Shipping Deduction:</span>
                        <span className="font-semibold text-red-600">- Rs. {shippingCharges.toFixed(2)}</span>
                      </div>
                    )}
                    {shippingChargeHandling === 'DEDUCT_FROM_ADVANCE' && advanceBalance > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Advance Balance Used:</span>
                        <span className="font-semibold text-blue-600">
                          Rs. {Math.min(advanceBalance, shippingCharges).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="border-t border-blue-300 pt-2 mt-2">
                      <div className="flex justify-between">
                        <span className="text-lg font-semibold text-gray-900">Total Refund Amount:</span>
                        <span className="text-2xl font-bold text-blue-600">Rs. {calculatedRefund.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Submit Buttons */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  if (customerId) {
                    navigate(`/business/customers/${customerId}?tab=returns`)
                  } else {
                    navigate('/business/accounting/returns')
                  }
                }}
                className="flex-1 btn-secondary px-6 py-3"
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 btn-primary px-6 py-3"
                disabled={submitting || !selectedOrderId || (returnType === 'CUSTOMER_PARTIAL' && selectedProducts.length === 0)}
              >
                {submitting ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Creating Return...
                  </>
                ) : (
                  'Create Return'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </ModernLayout>
  )
}

export default CreateReturnPage

