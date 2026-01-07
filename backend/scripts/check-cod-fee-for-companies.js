const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkCodFeeForCompanies() {
    try {
        const orderNumber = '1004-JAN-26-004'
        
        console.log(`\n=== Checking COD Fee Calculation for Order: ${orderNumber} ===\n`)
        
        // Find the order
        const order = await prisma.order.findUnique({
            where: { orderNumber },
            include: {
                tenant: {
                    select: {
                        businessName: true
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
        console.log(`  Payment Amount: ${order.paymentAmount || 0}`)
        console.log(`  Verified Payment Amount: ${order.verifiedPaymentAmount || 0}`)
        console.log(`  Shipping Charges: ${order.shippingCharges || 0}`)
        
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
        
        const shippingCharges = parseFloat(order.shippingCharges || 0)
        const orderTotal = productsTotal + shippingCharges
        const amountReceived = order.paymentVerified && order.verifiedPaymentAmount !== null && order.verifiedPaymentAmount !== undefined
            ? parseFloat(order.verifiedPaymentAmount)
            : parseFloat(order.paymentAmount || 0)
        
        const codAmount = orderTotal - amountReceived
        
        console.log(`\nProducts Total: Rs. ${productsTotal.toFixed(2)}`)
        console.log(`Shipping Charges: Rs. ${shippingCharges.toFixed(2)}`)
        console.log(`Order Total: Rs. ${orderTotal.toFixed(2)}`)
        console.log(`Amount Received: Rs. ${amountReceived.toFixed(2)}`)
        console.log(`\nCOD Amount: Rs. ${codAmount.toFixed(2)}`)
        
        if (codAmount <= 0) {
            console.log(`\n⚠️  No COD amount (order is fully paid or prepaid)`)
            return
        }
        
        // Find logistics companies
        const tenantId = order.tenantId
        const logisticsCompanies = await prisma.logisticsCompany.findMany({
            where: {
                tenantId: tenantId,
                name: {
                    in: ['POS', 'TCS']
                }
            }
        })
        
        console.log(`\n=== Logistics Companies Found ===`)
        console.log(`Found ${logisticsCompanies.length} companies\n`)
        
        if (logisticsCompanies.length === 0) {
            console.log('❌ No logistics companies found with names POS or TCS')
            return
        }
        
        // Calculate COD fee for each company
        for (const company of logisticsCompanies) {
            console.log(`\n--- ${company.name} ---`)
            console.log(`  ID: ${company.id}`)
            console.log(`  Calculation Type: ${company.codFeeCalculationType}`)
            console.log(`  Status: ${company.status}`)
            
            let codFee = 0
            let calculationDetails = null
            
            if (company.codFeeCalculationType === 'FIXED') {
                codFee = parseFloat(company.fixedCodFee || 0)
                calculationDetails = `Fixed fee: Rs. ${codFee.toFixed(2)}`
            } else if (company.codFeeCalculationType === 'PERCENTAGE') {
                const percentage = parseFloat(company.codFeePercentage || 0)
                codFee = (codAmount * percentage) / 100
                calculationDetails = `Percentage: ${percentage}% of Rs. ${codAmount.toFixed(2)} = Rs. ${codFee.toFixed(2)}`
            } else if (company.codFeeCalculationType === 'RANGE_BASED') {
                let codFeeRules = null
                try {
                    codFeeRules = typeof company.codFeeRules === 'string'
                        ? JSON.parse(company.codFeeRules)
                        : (company.codFeeRules || [])
                } catch (e) {
                    console.log(`  ⚠️  Error parsing COD fee rules: ${e.message}`)
                }
                
                if (Array.isArray(codFeeRules) && codFeeRules.length > 0) {
                    // Sort rules by min amount
                    const sortedRules = [...codFeeRules].sort((a, b) => a.min - b.min)
                    
                    // Find matching rule
                    let matchedRule = null
                    for (const rule of sortedRules) {
                        if (codAmount >= rule.min && codAmount <= rule.max) {
                            matchedRule = rule
                            break
                        }
                    }
                    
                    if (matchedRule) {
                        if (matchedRule.type === 'FIXED') {
                            codFee = parseFloat(matchedRule.fee || 0)
                            calculationDetails = `Range [${matchedRule.min}-${matchedRule.max}]: Fixed fee = Rs. ${codFee.toFixed(2)}`
                        } else if (matchedRule.type === 'PERCENTAGE') {
                            const percentage = parseFloat(matchedRule.percentage || 0)
                            codFee = (codAmount * percentage) / 100
                            calculationDetails = `Range [${matchedRule.min}-${matchedRule.max}]: ${percentage}% of Rs. ${codAmount.toFixed(2)} = Rs. ${codFee.toFixed(2)}`
                        }
                    } else {
                        calculationDetails = `No matching rule found for COD amount Rs. ${codAmount.toFixed(2)}`
                    }
                } else {
                    calculationDetails = `No COD fee rules configured`
                }
            }
            
            console.log(`  COD Fee: Rs. ${codFee.toFixed(2)}`)
            if (calculationDetails) {
                console.log(`  Calculation: ${calculationDetails}`)
            }
        }
        
        console.log(`\n✅ COD fee calculation completed`)
        
    } catch (error) {
        console.error('Error:', error)
    } finally {
        await prisma.$disconnect()
    }
}

checkCodFeeForCompanies()

