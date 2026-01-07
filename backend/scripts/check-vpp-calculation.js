const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkVPPCalculation() {
    try {
        const orderNumber = '1004-JAN-26-004'
        
        console.log(`\n=== Checking VPP Calculation for Order: ${orderNumber} ===\n`)
        
        // Find the order
        const order = await prisma.order.findUnique({
            where: { orderNumber },
            include: {
                tenant: {
                    select: {
                        businessName: true,
                        businessAddress: true,
                        whatsappNumber: true
                    }
                }
            }
        })
        
        if (!order) {
            console.log(`❌ Order ${orderNumber} not found`)
            return
        }
        
        console.log('Order Details:')
        console.log(`  Order ID: ${order.id}`)
        console.log(`  Status: ${order.status}`)
        console.log(`  Payment Amount (claimed): ${order.paymentAmount || 0}`)
        console.log(`  Payment Verified: ${order.paymentVerified}`)
        console.log(`  Verified Payment Amount: ${order.verifiedPaymentAmount || 0}`)
        console.log(`  Shipping Charges (estimated): ${order.shippingCharges || 0}`)
        console.log(`  Actual Shipping Cost: ${order.actualShippingCost || 'Not set'}`)
        console.log(`  Logistics Company ID: ${order.logisticsCompanyId || 'Not set'}`)
        
        // Calculate products total
        let productsTotal = 0
        try {
            const selectedProducts = typeof order.selectedProducts === 'string'
                ? JSON.parse(order.selectedProducts)
                : (order.selectedProducts || [])
            const productQuantities = typeof order.productQuantities === 'string'
                ? JSON.parse(order.productQuantities)
                : (order.productQuantities || {})
            const productPrices = typeof order.productPrices === 'string'
                ? JSON.parse(order.productPrices)
                : (order.productPrices || {})
            
            if (Array.isArray(selectedProducts)) {
                selectedProducts.forEach(product => {
                    const quantity = productQuantities[product.id] || product.quantity || 1
                    const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0
                    productsTotal += quantity * price
                })
            }
        } catch (e) {
            console.log(`  ⚠️  Error parsing products: ${e.message}`)
        }
        
        console.log(`\nProducts Total: Rs. ${productsTotal.toFixed(2)}`)
        
        // Amount received from customer
        const amountReceived = order.paymentVerified && order.verifiedPaymentAmount !== null && order.verifiedPaymentAmount !== undefined
            ? parseFloat(order.verifiedPaymentAmount)
            : parseFloat(order.paymentAmount || 0)
        
        console.log(`\nAmount Received from Customer: Rs. ${amountReceived.toFixed(2)}`)
        console.log(`  (Using ${order.paymentVerified ? 'verified' : 'claimed'} amount)`)
        
        // Calculate total pending amount (products - amount received)
        const totalPendingAmount = productsTotal - amountReceived
        
        // Shipping fee
        const shippingFee = parseFloat(order.shippingCharges || 0)
        
        // Logistic fee (only if logistics company is configured/selected)
        const hasLogisticsCompany = order.logisticsCompanyId !== null && order.logisticsCompanyId !== undefined
        const actualCost = order.actualShippingCost !== null && order.actualShippingCost !== undefined
            ? order.actualShippingCost
            : null
        
        // Logistic fee = 0 if no logistics company is configured/selected/overridden
        const logisticFee = (hasLogisticsCompany && actualCost !== null && actualCost !== undefined)
            ? parseFloat(actualCost)
            : 0
        
        console.log(`\n=== VPP Calculation ===`)
        console.log(`Products Total: Rs. ${productsTotal.toFixed(2)}`)
        console.log(`Amount Received: Rs. ${amountReceived.toFixed(2)}`)
        console.log(`Total Pending Amount (Products - Received): Rs. ${totalPendingAmount.toFixed(2)}`)
        console.log(`Shipping Fee: Rs. ${shippingFee.toFixed(2)}`)
        console.log(`Has Logistics Company: ${hasLogisticsCompany}`)
        console.log(`Actual Shipping Cost: ${actualCost !== null ? actualCost : 'Not set'}`)
        console.log(`Logistic Fee: Rs. ${logisticFee.toFixed(2)}`)
        console.log(`VPP = (Total Pending Amount + Shipping Fee) - Logistic Fee`)
        console.log(`VPP = (Rs. ${totalPendingAmount.toFixed(2)} + Rs. ${shippingFee.toFixed(2)}) - Rs. ${logisticFee.toFixed(2)}`)
        
        // VPP = (Total pending amount of order + Shipping Fee) - Logistic fee
        const vppAmount = (totalPendingAmount + shippingFee) - logisticFee
        
        console.log(`VPP = Rs. ${vppAmount.toFixed(2)}`)
        
        console.log(`\n=== Additional Info ===`)
        
        if (order.logisticsCompanyId) {
            const logisticsCompany = await prisma.logisticsCompany.findUnique({
                where: { id: order.logisticsCompanyId }
            })
            if (logisticsCompany) {
                console.log(`\nLogistics Company: ${logisticsCompany.name}`)
            }
        }
        
        console.log(`\n✅ VPP for order ${orderNumber} should be: Rs. ${vppAmount.toFixed(2)}`)
        
    } catch (error) {
        console.error('Error:', error)
    } finally {
        await prisma.$disconnect()
    }
}

checkVPPCalculation()

