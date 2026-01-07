/**
 * Comprehensive Unit Tests for COD Fee Payment Configuration Feature
 * 
 * Tests the complete flow including:
 * - Order confirmation with COD fee payment preference (Business Owner vs Customer)
 * - Order editing with COD fee payment preference change
 * - Accounting entries validation
 * - Profit calculation validation
 * - Order total calculations
 * 
 * Run with: npm test -- cod-fee-payment.test.js
 */

const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals')
const prisma = require('../lib/db')
const accountingService = require('../services/accountingService')
const profitService = require('../services/profitService')
const codFeeService = require('../services/codFeeService')
const balanceService = require('../services/balanceService')
const {
  createTestTenant: createTestTenantHelper,
  cleanupTestData
} = require('./helpers/testHelpers')

// Test configuration
const TEST_CONFIG = {
  timeout: 30000,
  cleanup: true
}

// Helper function to create test logistics company
async function createTestLogisticsCompany(tenantId) {
  const company = await prisma.logisticsCompany.create({
    data: {
      name: 'Test Logistics Co',
      tenantId: tenantId,
      codFeeCalculationType: 'PERCENTAGE',
      codFeePercentage: 2.5, // 2.5% COD fee
      status: 'ACTIVE'
    }
  })
  
  return company
}

// Helper function to create test product
async function createTestProduct(tenantId) {
  const product = await prisma.product.create({
    data: {
      name: 'Test Product',
      sku: `TEST-SKU-${Date.now()}`,
      tenantId: tenantId,
      currentRetailPrice: 1000,
      lastPurchasePrice: 600,
      currentQuantity: 100
    }
  })
  
  return product
}

// Helper function to create test form
async function createTestForm(tenantId) {
  const form = await prisma.form.create({
    data: {
      name: 'Test Order Form',
      description: 'Test form for COD fee testing',
      formCategory: 'SHOPPING_CART',
      tenantId: tenantId,
      formLink: `test-form-${Date.now()}`,
      isPublished: true
    }
  })
  
  // Add form fields
  await prisma.formField.createMany({
    data: [
      {
        formId: form.id,
        label: 'Customer Name',
        fieldType: 'TEXT',
        isRequired: true,
        order: 0
      },
      {
        formId: form.id,
        label: 'Phone Number',
        fieldType: 'PHONE',
        isRequired: true,
        order: 1
      }
    ]
  })
  
  return form
}

// Helper function to create test customer
async function createTestCustomer(tenantId) {
  const customer = await prisma.customer.create({
    data: {
      name: 'Test Customer',
      phoneNumber: `123456789${Date.now() % 10000}`,
      tenantId: tenantId
    }
  })
  
  return customer
}

// Helper function to create test order (PENDING status)
async function createTestOrder(tenantId, formId, customerId, product, logisticsCompanyId = null) {
  const selectedProducts = JSON.stringify([{ id: product.id, name: product.name, price: product.currentRetailPrice }])
  const productQuantities = JSON.stringify({ [product.id]: 2 })
  const productPrices = JSON.stringify({ [product.id]: product.currentRetailPrice })
  const formData = JSON.stringify({
    'Customer Name': 'Test Customer',
    'Phone Number': '1234567890'
  })
  
  const order = await prisma.order.create({
    data: {
      orderNumber: `TEST-ORD-${Date.now()}`,
      formData: formData,
      status: 'PENDING',
      formId: formId,
      tenantId: tenantId,
      customerId: customerId,
      selectedProducts: selectedProducts,
      productQuantities: productQuantities,
      productPrices: productPrices,
      paymentAmount: 500, // Partial payment
      shippingCharges: 200,
      logisticsCompanyId: logisticsCompanyId
    }
  })
  
  return order
}

// Helper function to confirm order (simulating the API endpoint)
async function confirmOrder(orderId, codFeePaidBy = 'BUSINESS_OWNER', paymentAccountId = null, verifiedAmount = null) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      tenant: {
        select: {
          ownerId: true,
          businessName: true
        }
      }
    }
  })
  
  if (!order) {
    throw new Error('Order not found')
  }
  
  // Calculate order totals
  let productsTotal = 0
  const selectedProducts = JSON.parse(order.selectedProducts || '[]')
  const productQuantities = JSON.parse(order.productQuantities || '{}')
  const productPrices = JSON.parse(order.productPrices || '{}')
  
  selectedProducts.forEach(product => {
    const quantity = productQuantities[product.id] || 1
    const price = productPrices[product.id] || product.price || 0
    productsTotal += price * quantity
  })
  
  const shippingCharges = order.shippingCharges || 0
  const baseOrderTotal = productsTotal + shippingCharges
  const paymentAmount = order.paymentAmount || 0
  const codAmount = baseOrderTotal - paymentAmount
  
  // Calculate COD fee if applicable
  let codFee = null
  let codFeeCalculationType = null
  
  if (codAmount > 0 && order.logisticsCompanyId) {
    try {
      const codFeeResult = await codFeeService.calculateCODFee(order.logisticsCompanyId, codAmount)
      codFee = codFeeResult.codFee
      codFeeCalculationType = codFeeResult.calculationType
    } catch (codError) {
      console.error('Error calculating COD fee:', codError)
    }
  }
  
  // Calculate final order total based on payment preference
  let finalOrderTotal = baseOrderTotal
  if (codFeePaidBy === 'CUSTOMER' && codFee && codFee > 0) {
    finalOrderTotal = baseOrderTotal + codFee
  }
  
  // Update order
  const updatedOrder = await prisma.$transaction(async (tx) => {
    const updateData = {
      status: 'CONFIRMED',
      businessOwnerId: order.tenant.ownerId,
      codFee,
      codAmount: codAmount > 0 ? codAmount : null,
      codFeeCalculationType,
      codFeePaidBy: codFeePaidBy,
      logisticsCompanyId: order.logisticsCompanyId
    }
    
    if (paymentAccountId && !verifiedAmount) {
      // Only set paymentAccountId if not verifying payment (backward compatibility)
      updateData.paymentAccountId = paymentAccountId
    }
    
    // Create accounting entries
    const arAccount = await accountingService.getAccountByCode('1200', order.tenantId) ||
      await accountingService.getOrCreateAccount({
        code: '1200',
        name: 'Accounts Receivable',
        type: 'ASSET',
        tenantId: order.tenantId,
        balance: 0
      })
    
    const salesRevenueAccount = await accountingService.getAccountByCode('4000', order.tenantId) ||
      await accountingService.getOrCreateAccount({
        code: '4000',
        name: 'Sales Revenue',
        type: 'INCOME',
        tenantId: order.tenantId,
        balance: 0
      })
    
    const shippingRevenueAccount = await accountingService.getAccountByCode('4200', order.tenantId) ||
      await accountingService.getOrCreateAccount({
        code: '4200',
        name: 'Shipping Revenue',
        type: 'INCOME',
        tenantId: order.tenantId,
        balance: 0
      })
    
    const transactionLines = [
      {
        accountId: arAccount.id,
        debitAmount: finalOrderTotal,
        creditAmount: 0
      },
      {
        accountId: salesRevenueAccount.id,
        debitAmount: 0,
        creditAmount: productsTotal
      },
      {
        accountId: shippingRevenueAccount.id,
        debitAmount: 0,
        creditAmount: shippingCharges
      }
    ]
    
    // If customer pays COD fee, add it as revenue
    if (codFeePaidBy === 'CUSTOMER' && codFee && codFee > 0) {
      const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', order.tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '4400',
          name: 'COD Fee Revenue',
          type: 'INCOME',
          tenantId: order.tenantId,
          balance: 0
        })
      
      transactionLines.push({
        accountId: codFeeRevenueAccount.id,
        debitAmount: 0,
        creditAmount: codFee
      })
    }
    
    // Create AR transaction
    await accountingService.createTransaction(
      {
        transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now()}`,
        date: new Date(),
        description: `Order Confirmed: ${order.orderNumber}`,
        tenantId: order.tenantId,
        orderId: order.id
      },
      transactionLines
    )
    
    // Handle payment verification if verifiedAmount and paymentAccountId are provided
    let verifiedPayment = null
    if (verifiedAmount !== null && verifiedAmount !== undefined && paymentAccountId) {
      const verifiedAmountValue = parseFloat(verifiedAmount)
      
      if (verifiedAmountValue > 0) {
        // Validate payment account
        const paymentAccount = await tx.account.findFirst({
          where: {
            id: paymentAccountId,
            tenantId: order.tenantId,
            type: 'ASSET',
            accountSubType: { in: ['CASH', 'BANK'] }
          }
        })

        if (!paymentAccount) {
          throw new Error('Invalid payment account. Must be a Cash or Bank account.')
        }

        const paymentMethod = paymentAccount.accountSubType === 'BANK' ? 'Bank Transfer' : 'Cash'

        // Create payment accounting transaction
        const paymentTransactionNumber = `TXN-${new Date().getFullYear()}-${Date.now() + 1}`
        
        const paymentTransaction = await accountingService.createTransaction(
          {
            transactionNumber: paymentTransactionNumber,
            date: new Date(),
            description: `Payment Verified: ${order.orderNumber}`,
            tenantId: order.tenantId,
            orderId: order.id
          },
          [
            {
              accountId: paymentAccount.id,
              debitAmount: verifiedAmountValue,
              creditAmount: 0
            },
            {
              accountId: arAccount.id,
              debitAmount: 0,
              creditAmount: verifiedAmountValue
            }
          ]
        )

        // Create Payment record
        const paymentCount = await tx.payment.count({
          where: { tenantId: order.tenantId }
        })
        const paymentNumber = `PAY-${new Date().getFullYear()}-${String(paymentCount + 1).padStart(4, '0')}`

        verifiedPayment = await tx.payment.create({
          data: {
            paymentNumber,
            date: new Date(),
            type: 'CUSTOMER_PAYMENT',
            amount: verifiedAmountValue,
            paymentMethod: paymentMethod,
            accountId: paymentAccount.id,
            tenantId: order.tenantId,
            customerId: order.customerId,
            orderId: order.id,
            transactionId: paymentTransaction.id
          }
        })

        // Update order with verification details
        updateData.verifiedPaymentAmount = verifiedAmountValue
        updateData.paymentVerified = true
        updateData.paymentVerifiedAt = new Date()
        updateData.paymentVerifiedBy = order.tenant.ownerId
        updateData.paymentAccountId = paymentAccountId
      }
    } else if (paymentAmount > 0) {
      // Handle prepayment if exists (old behavior for backward compatibility)
      let paymentAccount = null
      if (paymentAccountId) {
        paymentAccount = await tx.account.findUnique({
          where: { id: paymentAccountId }
        })
      }
      
      if (!paymentAccount) {
        paymentAccount = await accountingService.getAccountByCode('1000', order.tenantId) ||
          await accountingService.getOrCreateAccount({
            code: '1000',
            name: 'Cash',
            type: 'ASSET',
            tenantId: order.tenantId,
            balance: 0
          })
      }
      
      await accountingService.createTransaction(
        {
          transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now() + 1}`,
          date: new Date(),
          description: `Prepayment: ${order.orderNumber}`,
          tenantId: order.tenantId,
          orderId: order.id
        },
        [
          {
            accountId: paymentAccount.id,
            debitAmount: paymentAmount,
            creditAmount: 0
          },
          {
            accountId: arAccount.id,
            debitAmount: 0,
            creditAmount: paymentAmount
          }
        ]
      )
    }
    
    // Handle COD fee expense (business always pays logistics)
    if (codFee && codFee > 0) {
      const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', order.tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '5200',
          name: 'COD Fee Expense',
          type: 'EXPENSE',
          tenantId: order.tenantId,
          balance: 0
        })
      
      const codFeePayableAccount = await accountingService.getAccountByCode('2200', order.tenantId) ||
        await accountingService.getOrCreateAccount({
          code: '2200',
          name: 'COD Fee Payable',
          type: 'LIABILITY',
          tenantId: order.tenantId,
          balance: 0
        })
      
      await accountingService.createTransaction(
        {
          transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now() + 2}`,
          date: new Date(),
          description: `COD Fee ${codFeePaidBy === 'CUSTOMER' ? 'Expense' : 'Accrued'}: ${order.orderNumber}`,
          tenantId: order.tenantId,
          orderId: order.id
        },
        [
          {
            accountId: codFeeExpenseAccount.id,
            debitAmount: codFee,
            creditAmount: 0
          },
          {
            accountId: codFeePayableAccount.id,
            debitAmount: 0,
            creditAmount: codFee
          }
        ]
      )
    }
    
    // Update order with all changes (including payment verification if applicable)
    const updated = await tx.order.update({
      where: { id: orderId },
      data: updateData
    })
    
    return { order: updated, payment: verifiedPayment }
  })
  
  return updatedOrder.order
}

// Helper function to update order (simulating edit mode)
async function updateOrder(orderId, updates) {
  const existingOrder = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      form: {
        include: {
          tenant: {
            select: {
              defaultCodFeePaidBy: true
            }
          }
        }
      }
    }
  })
  
  if (!existingOrder) {
    throw new Error('Order not found')
  }
  
  const updateData = {}
  
  if (updates.codFeePaidBy !== undefined) {
    updateData.codFeePaidBy = updates.codFeePaidBy
  }
  
  if (updates.logisticsCompanyId !== undefined) {
    updateData.logisticsCompanyId = updates.logisticsCompanyId
  }
  
  if (updates.codFee !== undefined) {
    updateData.codFee = updates.codFee
  }
  
  if (updates.shippingCharges !== undefined) {
    updateData.shippingCharges = updates.shippingCharges
  }
  
  if (updates.paymentAmount !== undefined) {
    updateData.paymentAmount = updates.paymentAmount
  }
  
  // Recalculate COD fee if logistics company changed
  if (updates.logisticsCompanyId !== undefined && updates.logisticsCompanyId) {
    try {
      // Calculate COD amount
      const selectedProducts = JSON.parse(existingOrder.selectedProducts || '[]')
      const productQuantities = JSON.parse(existingOrder.productQuantities || '{}')
      const productPrices = JSON.parse(existingOrder.productPrices || '{}')
      
      let productsTotal = 0
      selectedProducts.forEach(product => {
        const quantity = productQuantities[product.id] || 1
        const price = productPrices[product.id] || product.price || 0
        productsTotal += price * quantity
      })
      
      const shippingCharges = existingOrder.shippingCharges || 0
      const paymentAmount = existingOrder.paymentAmount || 0
      const codAmount = productsTotal + shippingCharges - paymentAmount
      
      if (codAmount > 0) {
        const codFeeResult = await codFeeService.calculateCODFee(updates.logisticsCompanyId, codAmount)
        updateData.codFee = codFeeResult.codFee
        updateData.codFeeCalculationType = codFeeResult.calculationType
        updateData.codAmount = codAmount
        
        if (!updateData.codFeePaidBy) {
          updateData.codFeePaidBy = existingOrder.codFeePaidBy || existingOrder.form.tenant.defaultCodFeePaidBy || 'BUSINESS_OWNER'
        }
      }
    } catch (error) {
      console.error('Error recalculating COD fee:', error)
    }
  }
  
  // Store old values for accounting
  const oldCodFee = existingOrder.codFee || 0
  const oldCodFeePaidBy = existingOrder.codFeePaidBy || null
  const newCodFee = updateData.codFee !== undefined ? (updateData.codFee || 0) : oldCodFee
  const newCodFeePaidBy = updateData.codFeePaidBy !== undefined ? updateData.codFeePaidBy : oldCodFeePaidBy
  
  // Use transaction to handle accounting entries (matching real endpoint logic)
  const updatedOrder = await prisma.$transaction(async (tx) => {
    const order = await tx.order.update({
      where: { id: orderId },
      data: updateData
    })
    
    // Handle COD fee accounting entries if order is confirmed/dispatched/completed
    const orderStatus = order.status
    if (['CONFIRMED', 'DISPATCHED', 'COMPLETED'].includes(orderStatus)) {
      try {
        const existingCodTransactions = await tx.transaction.findMany({
          where: {
            orderId: orderId,
            description: { contains: 'COD Fee' }
          }
        })

        const codFeeChanged = newCodFee !== oldCodFee
        const codFeePaidByChanged = newCodFeePaidBy !== oldCodFeePaidBy
        const finalCodFeePaidBy = newCodFeePaidBy || existingOrder.form.tenant.defaultCodFeePaidBy || 'BUSINESS_OWNER'

        if (codFeeChanged || codFeePaidByChanged) {
          const codFeeDifference = newCodFee - oldCodFee

          // Case 1: COD fee removed
          if (newCodFee === 0 && oldCodFee > 0 && existingCodTransactions.length > 0) {
            const arAccount = await accountingService.getAccountByCode('1200', existingOrder.tenantId)
            const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', existingOrder.tenantId)
            const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', existingOrder.tenantId)
            const codFeePayableAccount = await accountingService.getAccountByCode('2200', existingOrder.tenantId)

            if (oldCodFeePaidBy === 'CUSTOMER' && codFeeRevenueAccount && arAccount) {
              await accountingService.createTransaction(
                {
                  transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now()}`,
                  date: new Date(),
                  description: `COD Fee Revenue Reversal (Edit): ${existingOrder.orderNumber}`,
                  tenantId: existingOrder.tenantId,
                  orderId: orderId
                },
                [
                  { accountId: codFeeRevenueAccount.id, debitAmount: oldCodFee, creditAmount: 0 },
                  { accountId: arAccount.id, debitAmount: 0, creditAmount: oldCodFee }
                ]
              )
            }

            if (codFeeExpenseAccount && codFeePayableAccount) {
              await accountingService.createTransaction(
                {
                  transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now() + 1}`,
                  date: new Date(),
                  description: `COD Fee Expense Reversal (Edit): ${existingOrder.orderNumber}`,
                  tenantId: existingOrder.tenantId,
                  orderId: orderId
                },
                [
                  { accountId: codFeePayableAccount.id, debitAmount: oldCodFee, creditAmount: 0 },
                  { accountId: codFeeExpenseAccount.id, debitAmount: 0, creditAmount: oldCodFee }
                ]
              )
            }
          }
          // Case 2: COD fee added
          else if (oldCodFee === 0 && newCodFee > 0) {
            const arAccount = await accountingService.getAccountByCode('1200', existingOrder.tenantId)
            
            if (finalCodFeePaidBy === 'CUSTOMER' && arAccount) {
              const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', existingOrder.tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '4400', name: 'COD Fee Revenue', type: 'INCOME', tenantId: existingOrder.tenantId, balance: 0
                })

              await accountingService.createTransaction(
                {
                  transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now()}`,
                  date: new Date(),
                  description: `COD Fee Revenue (Edit): ${existingOrder.orderNumber}`,
                  tenantId: existingOrder.tenantId,
                  orderId: orderId
                },
                [
                  { accountId: arAccount.id, debitAmount: newCodFee, creditAmount: 0 },
                  { accountId: codFeeRevenueAccount.id, debitAmount: 0, creditAmount: newCodFee }
                ]
              )
            }

            const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', existingOrder.tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '5200', name: 'COD Fee Expense', type: 'EXPENSE', tenantId: existingOrder.tenantId, balance: 0
              })

            const codFeePayableAccount = await accountingService.getAccountByCode('2200', existingOrder.tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '2200', name: 'COD Fee Payable', type: 'LIABILITY', tenantId: existingOrder.tenantId, balance: 0
              })

            await accountingService.createTransaction(
              {
                transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now() + 1}`,
                date: new Date(),
                description: `COD Fee ${finalCodFeePaidBy === 'CUSTOMER' ? 'Expense' : 'Accrued'} (Edit): ${existingOrder.orderNumber}`,
                tenantId: existingOrder.tenantId,
                orderId: orderId
              },
              [
                { accountId: codFeeExpenseAccount.id, debitAmount: newCodFee, creditAmount: 0 },
                { accountId: codFeePayableAccount.id, debitAmount: 0, creditAmount: newCodFee }
              ]
            )
          }
          // Case 3: COD fee amount changed
          else if (codFeeChanged && codFeeDifference !== 0) {
            const arAccount = await accountingService.getAccountByCode('1200', existingOrder.tenantId)
            
            if (finalCodFeePaidBy === 'CUSTOMER' && arAccount) {
              const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', existingOrder.tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '4400', name: 'COD Fee Revenue', type: 'INCOME', tenantId: existingOrder.tenantId, balance: 0
                })

              await accountingService.createTransaction(
                {
                  transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now()}`,
                  date: new Date(),
                  description: `COD Fee Revenue Adjustment (Edit): ${existingOrder.orderNumber}`,
                  tenantId: existingOrder.tenantId,
                  orderId: orderId
                },
                [
                  {
                    accountId: arAccount.id,
                    debitAmount: codFeeDifference > 0 ? codFeeDifference : Math.abs(codFeeDifference),
                    creditAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0
                  },
                  {
                    accountId: codFeeRevenueAccount.id,
                    debitAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0,
                    creditAmount: codFeeDifference > 0 ? codFeeDifference : 0
                  }
                ]
              )
            }

            const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', existingOrder.tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '5200', name: 'COD Fee Expense', type: 'EXPENSE', tenantId: existingOrder.tenantId, balance: 0
              })

            const codFeePayableAccount = await accountingService.getAccountByCode('2200', existingOrder.tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '2200', name: 'COD Fee Payable', type: 'LIABILITY', tenantId: existingOrder.tenantId, balance: 0
              })

            await accountingService.createTransaction(
              {
                transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now() + 1}`,
                date: new Date(),
                description: `COD Fee Expense Adjustment (Edit): ${existingOrder.orderNumber}`,
                tenantId: existingOrder.tenantId,
                orderId: orderId
              },
              [
                {
                  accountId: codFeeExpenseAccount.id,
                  debitAmount: codFeeDifference > 0 ? codFeeDifference : 0,
                  creditAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0
                },
                {
                  accountId: codFeePayableAccount.id,
                  debitAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0,
                  creditAmount: codFeeDifference > 0 ? codFeeDifference : 0
                }
              ]
            )
          }
          // Case 4: Payment preference changed
          else if (!codFeeChanged && codFeePaidByChanged && newCodFee > 0) {
            const arAccount = await accountingService.getAccountByCode('1200', existingOrder.tenantId)
            const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', existingOrder.tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '4400', name: 'COD Fee Revenue', type: 'INCOME', tenantId: existingOrder.tenantId, balance: 0
              })

            if (oldCodFeePaidBy !== 'CUSTOMER' && finalCodFeePaidBy === 'CUSTOMER' && arAccount) {
              await accountingService.createTransaction(
                {
                  transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now()}`,
                  date: new Date(),
                  description: `COD Fee Revenue Added (Preference Change): ${existingOrder.orderNumber}`,
                  tenantId: existingOrder.tenantId,
                  orderId: orderId
                },
                [
                  { accountId: arAccount.id, debitAmount: newCodFee, creditAmount: 0 },
                  { accountId: codFeeRevenueAccount.id, debitAmount: 0, creditAmount: newCodFee }
                ]
              )
            }
            else if (oldCodFeePaidBy === 'CUSTOMER' && finalCodFeePaidBy !== 'CUSTOMER' && arAccount) {
              await accountingService.createTransaction(
                {
                  transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now()}`,
                  date: new Date(),
                  description: `COD Fee Revenue Removed (Preference Change): ${existingOrder.orderNumber}`,
                  tenantId: existingOrder.tenantId,
                  orderId: orderId
                },
                [
                  { accountId: codFeeRevenueAccount.id, debitAmount: newCodFee, creditAmount: 0 },
                  { accountId: arAccount.id, debitAmount: 0, creditAmount: newCodFee }
                ]
              )
            }
          }
        }
      } catch (error) {
        console.error('Error creating COD fee accounting entries during order update:', error)
      }
    }
    
    return order
  })
  
  return updatedOrder
}

// Helper function to dispatch order (simulating the API endpoint)
async function dispatchOrder(orderId, dispatchData = {}) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      tenant: {
        select: {
          ownerId: true,
          defaultCodFeePaidBy: true
        }
      }
    }
  })
  
  if (!order) {
    throw new Error('Order not found')
  }
  
  if (order.status !== 'CONFIRMED') {
    throw new Error('Order must be CONFIRMED to dispatch')
  }
  
  const updateData = {
    status: 'DISPATCHED'
  }
  
  if (dispatchData.actualShippingCost !== undefined) {
    updateData.actualShippingCost = dispatchData.actualShippingCost
  }
  
  if (dispatchData.logisticsCompanyId !== undefined) {
    updateData.logisticsCompanyId = dispatchData.logisticsCompanyId
    
    // Recalculate COD fee if logistics company is set
    if (dispatchData.logisticsCompanyId) {
      try {
        const selectedProducts = JSON.parse(order.selectedProducts || '[]')
        const productQuantities = JSON.parse(order.productQuantities || '{}')
        const productPrices = JSON.parse(order.productPrices || '{}')
        
        let productsTotal = 0
        selectedProducts.forEach(product => {
          const quantity = productQuantities[product.id] || 1
          const price = productPrices[product.id] || product.price || 0
          productsTotal += price * quantity
        })
        
        const shippingCharges = order.shippingCharges || 0
        const paymentAmount = order.paymentAmount || 0
        const codAmount = productsTotal + shippingCharges - paymentAmount
        
        if (codAmount > 0) {
          const codFeeResult = await codFeeService.calculateCODFee(dispatchData.logisticsCompanyId, codAmount)
          updateData.codFee = codFeeResult.codFee
          updateData.codFeeCalculationType = codFeeResult.calculationType
          updateData.codAmount = codAmount
          
          if (!order.codFeePaidBy) {
            updateData.codFeePaidBy = order.tenant.defaultCodFeePaidBy || 'BUSINESS_OWNER'
          }
        }
      } catch (error) {
        console.error('Error calculating COD fee during dispatch:', error)
      }
    } else {
      // Remove COD fee if logistics company is null
      updateData.codFee = null
      updateData.codFeeCalculationType = null
      updateData.codAmount = null
    }
  }
  
  // Store old values before update (from original order object)
  const originalStatus = order.status
  const oldCodFee = order.codFee || 0
  const oldCodFeePaidBy = order.codFeePaidBy || null
  const orderNumber = order.orderNumber
  const tenantId = order.tenantId
  const newCodFee = updateData.codFee !== undefined ? (updateData.codFee || 0) : oldCodFee
  const newCodFeePaidBy = updateData.codFeePaidBy !== undefined ? updateData.codFeePaidBy : oldCodFeePaidBy
  const finalCodFeePaidBy = newCodFeePaidBy || order.tenant.defaultCodFeePaidBy || 'BUSINESS_OWNER'
  
  // Use transaction to handle accounting entries (matching real endpoint logic)
  const dispatchedOrder = await prisma.$transaction(async (tx) => {
    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: updateData
    })
    
    // Handle COD fee accounting entries (matching real dispatch endpoint logic)
    if (['CONFIRMED', 'DISPATCHED'].includes(originalStatus)) {
      try {
        const existingCodTransactions = await tx.transaction.findMany({
          where: {
            orderId: orderId,
            description: { contains: 'COD Fee' }
          }
        })

        const codFeeChanged = newCodFee !== oldCodFee
        const codFeePaidByChanged = newCodFeePaidBy !== oldCodFeePaidBy
        const codFeeDifference = newCodFee - oldCodFee

          // Case 1: COD fee removed
          if (newCodFee === 0 && oldCodFee > 0 && existingCodTransactions.length > 0) {
            const arAccount = await accountingService.getAccountByCode('1200', tenantId)
            const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', tenantId)
            const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', tenantId)
            const codFeePayableAccount = await accountingService.getAccountByCode('2200', tenantId)

            if (oldCodFeePaidBy === 'CUSTOMER' && codFeeRevenueAccount && arAccount) {
              await accountingService.createTransaction(
                {
                  transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now()}`,
                  date: new Date(),
                  description: `COD Fee Revenue Reversal (Dispatch): ${orderNumber}`,
                  tenantId: tenantId,
                  orderId: orderId
                },
              [
                { accountId: codFeeRevenueAccount.id, debitAmount: oldCodFee, creditAmount: 0 },
                { accountId: arAccount.id, debitAmount: 0, creditAmount: oldCodFee }
              ]
            )
          }

          if (codFeeExpenseAccount && codFeePayableAccount) {
              await accountingService.createTransaction(
                {
                  transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now() + 1}`,
                  date: new Date(),
                  description: `COD Fee Expense Reversal (Dispatch): ${orderNumber}`,
                  tenantId: tenantId,
                  orderId: orderId
                },
              [
                { accountId: codFeePayableAccount.id, debitAmount: oldCodFee, creditAmount: 0 },
                { accountId: codFeeExpenseAccount.id, debitAmount: 0, creditAmount: oldCodFee }
              ]
            )
          }
        }
        // Case 2: COD fee added or changed
        else if (newCodFee > 0 && (existingCodTransactions.length === 0 || codFeeChanged || codFeePaidByChanged)) {
          if (existingCodTransactions.length === 0) {
            const arAccount = await accountingService.getAccountByCode('1200', tenantId)
            
            if (finalCodFeePaidBy === 'CUSTOMER' && arAccount) {
              const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '4400', name: 'COD Fee Revenue', type: 'INCOME', tenantId: tenantId, balance: 0
                })

              await accountingService.createTransaction(
                {
                  transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now()}`,
                  date: new Date(),
                  description: `COD Fee Revenue (Dispatch): ${orderNumber}`,
                  tenantId: tenantId,
                  orderId: orderId
                },
                [
                  { accountId: arAccount.id, debitAmount: newCodFee, creditAmount: 0 },
                  { accountId: codFeeRevenueAccount.id, debitAmount: 0, creditAmount: newCodFee }
                ]
              )
            }

            const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '5200', name: 'COD Fee Expense', type: 'EXPENSE', tenantId: tenantId, balance: 0
              })

            const codFeePayableAccount = await accountingService.getAccountByCode('2200', tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '2200', name: 'COD Fee Payable', type: 'LIABILITY', tenantId: tenantId, balance: 0
              })

            await accountingService.createTransaction(
              {
                transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now() + 1}`,
                date: new Date(),
                description: `COD Fee ${finalCodFeePaidBy === 'CUSTOMER' ? 'Expense' : 'Accrued'} (Dispatch): ${orderNumber}`,
                tenantId: tenantId,
                orderId: orderId
              },
              [
                { accountId: codFeeExpenseAccount.id, debitAmount: newCodFee, creditAmount: 0 },
                { accountId: codFeePayableAccount.id, debitAmount: 0, creditAmount: newCodFee }
              ]
            )
          }
          // Adjustment for changes
          else if (codFeeChanged && codFeeDifference !== 0) {
            const arAccount = await accountingService.getAccountByCode('1200', tenantId)
            
            if (finalCodFeePaidBy === 'CUSTOMER' && arAccount) {
              const codFeeRevenueAccount = await accountingService.getAccountByCode('4400', tenantId) ||
                await accountingService.getOrCreateAccount({
                  code: '4400', name: 'COD Fee Revenue', type: 'INCOME', tenantId: tenantId, balance: 0
                })

              await accountingService.createTransaction(
                {
                  transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now()}`,
                  date: new Date(),
                  description: `COD Fee Revenue Adjustment (Dispatch): ${orderNumber}`,
                  tenantId: tenantId,
                  orderId: orderId
                },
                [
                  {
                    accountId: arAccount.id,
                    debitAmount: codFeeDifference > 0 ? codFeeDifference : Math.abs(codFeeDifference),
                    creditAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0
                  },
                  {
                    accountId: codFeeRevenueAccount.id,
                    debitAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0,
                    creditAmount: codFeeDifference > 0 ? codFeeDifference : 0
                  }
                ]
              )
            }

            const codFeeExpenseAccount = await accountingService.getAccountByCode('5200', tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '5200', name: 'COD Fee Expense', type: 'EXPENSE', tenantId: tenantId, balance: 0
              })

            const codFeePayableAccount = await accountingService.getAccountByCode('2200', tenantId) ||
              await accountingService.getOrCreateAccount({
                code: '2200', name: 'COD Fee Payable', type: 'LIABILITY', tenantId: tenantId, balance: 0
              })

            await accountingService.createTransaction(
              {
                transactionNumber: `TXN-${new Date().getFullYear()}-${Date.now() + 1}`,
                date: new Date(),
                description: `COD Fee Expense Adjustment (Dispatch): ${orderNumber}`,
                tenantId: tenantId,
                orderId: orderId
              },
              [
                {
                  accountId: codFeeExpenseAccount.id,
                  debitAmount: codFeeDifference > 0 ? codFeeDifference : 0,
                  creditAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0
                },
                {
                  accountId: codFeePayableAccount.id,
                  debitAmount: codFeeDifference < 0 ? Math.abs(codFeeDifference) : 0,
                  creditAmount: codFeeDifference > 0 ? codFeeDifference : 0
                }
              ]
            )
          }
        }
      } catch (error) {
        console.error('Error creating COD fee accounting entries during dispatch:', error)
      }
    }
    
      return updatedOrder
    })
  
  return dispatchedOrder
}

// Cleanup helper
async function cleanup(testData) {
  if (!TEST_CONFIG.cleanup) return
  
  try {
    // Delete in reverse order of dependencies
    if (testData.orders) {
      for (const order of testData.orders) {
        await prisma.transaction.deleteMany({ where: { orderId: order.id } })
        await prisma.order.delete({ where: { id: order.id } })
      }
    }
    
    if (testData.customers) {
      for (const customer of testData.customers) {
        await prisma.customer.delete({ where: { id: customer.id } })
      }
    }
    
    if (testData.forms) {
      for (const form of testData.forms) {
        await prisma.formField.deleteMany({ where: { formId: form.id } })
        await prisma.form.delete({ where: { id: form.id } })
      }
    }
    
    if (testData.products) {
      for (const product of testData.products) {
        await prisma.product.delete({ where: { id: product.id } })
      }
    }
    
    if (testData.logisticsCompanies) {
      for (const company of testData.logisticsCompanies) {
        await prisma.logisticsCompany.delete({ where: { id: company.id } })
      }
    }
    
    // Delete tenants first (before users) due to foreign key constraints
    if (testData.tenants) {
      for (const tenant of testData.tenants) {
        await prisma.transaction.deleteMany({ where: { tenantId: tenant.id } })
        await prisma.transactionLine.deleteMany({
          where: {
            transaction: {
              tenantId: tenant.id
            }
          }
        })
        await prisma.account.deleteMany({ where: { tenantId: tenant.id } })
        await prisma.tenant.delete({ where: { id: tenant.id } })
      }
    }
    
    // Delete users after tenants (due to foreign key constraint)
    if (testData.users) {
      for (const user of testData.users) {
        await prisma.user.delete({ where: { id: user.id } })
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error)
  }
}

// Test Suite
describe('COD Fee Payment Configuration Tests', () => {
  let testData = {
    tenants: [],
    users: [],
    products: [],
    forms: [],
    customers: [],
    orders: [],
    logisticsCompanies: []
  }
  
  beforeAll(async () => {
    // Setup test data using existing test helpers
    const { user, tenant } = await createTestTenantHelper()
    testData.users.push(user)
    testData.tenants.push(tenant)
    
    const logisticsCompany = await createTestLogisticsCompany(tenant.id)
    testData.logisticsCompanies.push(logisticsCompany)
    
    const product = await createTestProduct(tenant.id)
    testData.products.push(product)
    
    const form = await createTestForm(tenant.id)
    testData.forms.push(form)
    
    const customer = await createTestCustomer(tenant.id)
    testData.customers.push(customer)
    
    testData.tenant = tenant
    testData.user = user
    testData.logisticsCompany = logisticsCompany
    testData.product = product
    testData.form = form
    testData.customer = customer
  }, TEST_CONFIG.timeout)
  
  afterAll(async () => {
    if (TEST_CONFIG.cleanup && testData.tenant) {
      await cleanupTestData(testData.tenant.id)
    } else {
      await cleanup(testData)
    }
  }, TEST_CONFIG.timeout)
  
  describe('Test Case 1: Order Confirmation - Business Owner Pays COD Fee', () => {
    let order
    
    beforeAll(async () => {
      // Create a PENDING order with COD
      order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id
      )
      testData.orders.push(order)
    })
    
    test('should confirm order with BUSINESS_OWNER paying COD fee', async () => {
      const confirmedOrder = await confirmOrder(order.id, 'BUSINESS_OWNER')
      
      expect(confirmedOrder.status).toBe('CONFIRMED')
      expect(confirmedOrder.codFeePaidBy).toBe('BUSINESS_OWNER')
      expect(confirmedOrder.codFee).toBeGreaterThan(0)
      expect(confirmedOrder.codAmount).toBeGreaterThan(0)
    })
    
    test('should calculate order total correctly (without COD fee)', async () => {
      const orderData = await prisma.order.findUnique({
        where: { id: order.id }
      })
      
      const selectedProducts = JSON.parse(orderData.selectedProducts)
      const productQuantities = JSON.parse(orderData.productQuantities)
      const productPrices = JSON.parse(orderData.productPrices)
      
      let productsTotal = 0
      selectedProducts.forEach(product => {
        const quantity = productQuantities[product.id] || 1
        const price = productPrices[product.id] || product.price || 0
        productsTotal += price * quantity
      })
      
      const expectedOrderTotal = productsTotal + (orderData.shippingCharges || 0)
      
      // Order total should NOT include COD fee when business pays
      expect(expectedOrderTotal).toBe(2000 + 200) // 2 products * 1000 + 200 shipping
    })
    
    test('should create correct accounting entries for BUSINESS_OWNER payment', async () => {
      const transactions = await prisma.transaction.findMany({
        where: { orderId: order.id },
        include: {
          transactionLines: {
            include: {
              account: true
            }
          }
        }
      })
      
      // Should have AR transaction
      const arTransaction = transactions.find(t => 
        t.description && t.description.includes('Order Confirmed')
      )
      expect(arTransaction).toBeDefined()
      
      const arLines = arTransaction.transactionLines
      
      // AR should be debited with base order total (without COD fee)
      const arLine = arLines.find(l => l.account.code === '1200')
      expect(arLine).toBeDefined()
      expect(arLine.debitAmount).toBe(2200) // Products + Shipping (no COD fee)
      
      // Sales Revenue should be credited
      const salesRevenueLine = arLines.find(l => l.account.code === '4000')
      expect(salesRevenueLine).toBeDefined()
      expect(salesRevenueLine.creditAmount).toBe(2000) // Products total
      
      // Shipping Revenue should be credited
      const shippingRevenueLine = arLines.find(l => l.account.code === '4200')
      expect(shippingRevenueLine).toBeDefined()
      expect(shippingRevenueLine.creditAmount).toBe(200) // Shipping
      
      // COD Fee Revenue should NOT exist (business pays, not customer)
      const codFeeRevenueLine = arLines.find(l => l.account.code === '4400')
      expect(codFeeRevenueLine).toBeUndefined()
      
      // COD Fee Expense transaction should exist
      const codExpenseTransaction = transactions.find(t => 
        t.description.includes('COD Fee')
      )
      expect(codExpenseTransaction).toBeDefined()
      
      const codExpenseLines = codExpenseTransaction.transactionLines
      
      // COD Fee Expense should be debited
      const codExpenseLine = codExpenseLines.find(l => l.account.code === '5200')
      expect(codExpenseLine).toBeDefined()
      expect(codExpenseLine.debitAmount).toBeGreaterThan(0)
      
      // COD Fee Payable should be credited
      const codPayableLine = codExpenseLines.find(l => l.account.code === '2200')
      expect(codPayableLine).toBeDefined()
      expect(codPayableLine.creditAmount).toBeGreaterThan(0)
    })
    
    test('should validate profit calculation excludes COD fee from revenue', async () => {
      const profitStats = await profitService.getProfitStatistics(testData.tenant.id, {
        startDate: new Date(Date.now() - 86400000), // Last 24 hours
        endDate: new Date()
      })
      
      // Find this order in profit stats
      const orderProfit = profitStats.orders.find(o => o.orderId === order.id)
      expect(orderProfit).toBeDefined()
      
      // Revenue should NOT include COD fee (business pays)
      expect(orderProfit.totalRevenue).toBe(2200) // Products + Shipping only
      expect(orderProfit.totalRevenue).not.toBeGreaterThan(2200)
    })
  })
  
  describe('Test Case 2: Order Confirmation - Customer Pays COD Fee', () => {
    let order
    
    beforeAll(async () => {
      // Create a new PENDING order with COD
      order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id
      )
      testData.orders.push(order)
    })
    
    test('should confirm order with CUSTOMER paying COD fee', async () => {
      const confirmedOrder = await confirmOrder(order.id, 'CUSTOMER')
      
      expect(confirmedOrder.status).toBe('CONFIRMED')
      expect(confirmedOrder.codFeePaidBy).toBe('CUSTOMER')
      expect(confirmedOrder.codFee).toBeGreaterThan(0)
      expect(confirmedOrder.codAmount).toBeGreaterThan(0)
    })
    
    test('should calculate order total correctly (with COD fee)', async () => {
      const orderData = await prisma.order.findUnique({
        where: { id: order.id }
      })
      
      const selectedProducts = JSON.parse(orderData.selectedProducts)
      const productQuantities = JSON.parse(orderData.productQuantities)
      const productPrices = JSON.parse(orderData.productPrices)
      
      let productsTotal = 0
      selectedProducts.forEach(product => {
        const quantity = productQuantities[product.id] || 1
        const price = productPrices[product.id] || product.price || 0
        productsTotal += price * quantity
      })
      
      const baseOrderTotal = productsTotal + (orderData.shippingCharges || 0)
      const codAmount = baseOrderTotal - (orderData.paymentAmount || 0)
      const codFee = orderData.codFee || 0
      
      // Order total SHOULD include COD fee when customer pays
      const expectedOrderTotal = baseOrderTotal + codFee
      
      expect(expectedOrderTotal).toBeGreaterThan(2200) // Base + COD fee
    })
    
    test('should create correct accounting entries for CUSTOMER payment', async () => {
      const transactions = await prisma.transaction.findMany({
        where: { orderId: order.id },
        include: {
          transactionLines: {
            include: {
              account: true
            }
          }
        }
      })
      
      // Should have AR transaction
      const arTransaction = transactions.find(t => 
        t.description && t.description.includes('Order Confirmed')
      )
      expect(arTransaction).toBeDefined()
      
      const arLines = arTransaction.transactionLines
      
      // AR should be debited with order total INCLUDING COD fee
      const arLine = arLines.find(l => l.account.code === '1200')
      expect(arLine).toBeDefined()
      expect(arLine.debitAmount).toBeGreaterThan(2200) // Products + Shipping + COD fee
      
      // COD Fee Revenue should be credited (customer pays)
      const codFeeRevenueLine = arLines.find(l => l.account.code === '4400')
      expect(codFeeRevenueLine).toBeDefined()
      expect(codFeeRevenueLine.creditAmount).toBeGreaterThan(0)
      expect(codFeeRevenueLine.creditAmount).toBe(order.codFee)
      
      // COD Fee Expense transaction should still exist (business pays logistics)
      const codExpenseTransaction = transactions.find(t => 
        t.description.includes('COD Fee')
      )
      expect(codExpenseTransaction).toBeDefined()
    })
    
    test('should validate profit calculation includes COD fee in revenue', async () => {
      const profitStats = await profitService.getProfitStatistics(testData.tenant.id, {
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date()
      })
      
      // Find this order in profit stats
      const orderProfit = profitStats.orders.find(o => o.orderId === order.id)
      expect(orderProfit).toBeDefined()
      
      // Revenue SHOULD include COD fee (customer pays)
      expect(orderProfit.totalRevenue).toBeGreaterThan(2200) // Products + Shipping + COD fee
      
      // Verify COD fee is included
      const orderData = await prisma.order.findUnique({
        where: { id: order.id }
      })
      const expectedRevenue = 2200 + (orderData.codFee || 0)
      expect(orderProfit.orderTotalRevenue).toBe(expectedRevenue)
    })
  })
  
  describe('Test Case 3: Order Edit - Change COD Fee Payment Preference', () => {
    let order
    
    beforeAll(async () => {
      // Create and confirm order with BUSINESS_OWNER paying
      order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id
      )
      testData.orders.push(order)
      
      await confirmOrder(order.id, 'BUSINESS_OWNER')
    })
    
    test('should update codFeePaidBy in edit mode', async () => {
      const updatedOrder = await updateOrder(order.id, {
        codFeePaidBy: 'CUSTOMER'
      })
      
      expect(updatedOrder.codFeePaidBy).toBe('CUSTOMER')
    })
    
    test('should allow changing from BUSINESS_OWNER to CUSTOMER', async () => {
      // Change back to BUSINESS_OWNER
      const updatedOrder = await updateOrder(order.id, {
        codFeePaidBy: 'BUSINESS_OWNER'
      })
      
      expect(updatedOrder.codFeePaidBy).toBe('BUSINESS_OWNER')
    })
  })
  
  describe('Test Case 4: Customer Balance Calculation with COD Fee', () => {
    let orderCustomer, orderBusiness
    
    beforeAll(async () => {
      // Create two orders: one with customer paying, one with business paying
      orderCustomer = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id
      )
      testData.orders.push(orderCustomer)
      
      orderBusiness = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id
      )
      testData.orders.push(orderBusiness)
      
      await confirmOrder(orderCustomer.id, 'CUSTOMER')
      await confirmOrder(orderBusiness.id, 'BUSINESS_OWNER')
    })
    
    test('should include COD fee in customer balance when customer pays', async () => {
      const balance = await balanceService.calculateCustomerBalance(testData.customer.id)
      
      // Find order where customer pays COD fee
      const customerPaysOrder = balance.orders.find(b => 
        b.orderId === orderCustomer.id
      )
      
      expect(customerPaysOrder).toBeDefined()
      
      // Order total should include COD fee
      const orderData = await prisma.order.findUnique({
        where: { id: orderCustomer.id }
      })
      const expectedTotal = 2200 + (orderData.codFee || 0) // Base + COD fee
      
      expect(customerPaysOrder.orderTotal).toBe(expectedTotal)
    })
    
    test('should NOT include COD fee in customer balance when business pays', async () => {
      const balance = await balanceService.calculateCustomerBalance(testData.customer.id)
      
      // Find order where business pays COD fee
      const businessPaysOrder = balance.orders.find(b => 
        b.orderId === orderBusiness.id
      )
      
      expect(businessPaysOrder).toBeDefined()
      
      // Order total should NOT include COD fee
      expect(businessPaysOrder.orderTotal).toBe(2200) // Base only (no COD fee)
    })
  })
  
  describe('Test Case 5: Profit Calculation Validation', () => {
    let orderCustomer, orderBusiness
    
    beforeAll(async () => {
      // Create orders with different payment preferences
      orderCustomer = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id
      )
      testData.orders.push(orderCustomer)
      
      orderBusiness = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id
      )
      testData.orders.push(orderBusiness)
      
      await confirmOrder(orderCustomer.id, 'CUSTOMER')
      await confirmOrder(orderBusiness.id, 'BUSINESS_OWNER')
    })
    
    test('should calculate profit correctly for customer-paying order', async () => {
      const profitStats = await profitService.getProfitStatistics(testData.tenant.id, {
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date()
      })
      
      const orderProfit = profitStats.orders.find(o => o.orderId === orderCustomer.id)
      expect(orderProfit).toBeDefined()
      
      // Revenue should include COD fee
      const orderData = await prisma.order.findUnique({
        where: { id: orderCustomer.id }
      })
      const expectedRevenue = 2200 + (orderData.codFee || 0)
      
      expect(orderProfit.totalRevenue).toBe(expectedRevenue)
      
      // Cost should include actual shipping cost (if set) or shipping charges
      // COD fee expense is separate and reduces profit
      const expectedCost = 1200 + 200 // Product cost (2 * 600) + shipping
      expect(orderProfit.totalCost).toBe(expectedCost)
      
      // Profit = Revenue - Cost
      const expectedProfit = expectedRevenue - expectedCost
      expect(orderProfit.profit).toBe(expectedProfit)
    })
    
    test('should calculate profit correctly for business-paying order', async () => {
      const profitStats = await profitService.getProfitStatistics(testData.tenant.id, {
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date()
      })
      
      const orderProfit = profitStats.orders.find(o => o.orderId === orderBusiness.id)
      expect(orderProfit).toBeDefined()
      
      // Revenue should NOT include COD fee
      expect(orderProfit.totalRevenue).toBe(2200) // Base only
      
      // Cost should include actual shipping cost + COD fee expense
      const businessOrder = await prisma.order.findUnique({
        where: { id: orderBusiness.id }
      })
      const codFee = businessOrder?.codFee || 0
      const expectedCost = 1200 + 200 + codFee // Product cost + shipping + COD fee expense
      // Allow small rounding differences
      expect(Math.abs(orderProfit.totalCost - expectedCost)).toBeLessThan(1)
      
      // Profit = Revenue - Cost (COD fee expense is included in cost)
      const expectedProfit = 2200 - expectedCost
      expect(orderProfit.profit).toBe(expectedProfit)
    })
    
    test('should show correct total profit including both scenarios', async () => {
      const profitStats = await profitService.getProfitStatistics(testData.tenant.id, {
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date()
      })
      
      // Total revenue should include COD fee from customer-paying order
      const customerOrder = await prisma.order.findUnique({
        where: { id: orderCustomer.id }
      })
      const businessOrder = await prisma.order.findUnique({
        where: { id: orderBusiness.id }
      })
      
      const expectedTotalRevenue = 
        (2200 + (customerOrder.codFee || 0)) + // Customer pays order
        2200 // Business pays order
      
      // Allow small rounding differences
      expect(Math.abs(profitStats.totalRevenue - expectedTotalRevenue)).toBeLessThan(1)
      
      // Total cost should be sum of both orders + COD fee expenses for both
      const expectedTotalCost = (1200 + 200) * 2 + (customerOrder.codFee || 0) + (businessOrder.codFee || 0)
      // Allow small rounding differences
      expect(Math.abs(profitStats.totalCost - expectedTotalCost)).toBeLessThan(1)
      
      // Total profit
      const expectedTotalProfit = expectedTotalRevenue - expectedTotalCost
      expect(profitStats.totalProfit).toBe(expectedTotalProfit)
    })
  })
  
  describe('Test Case 6: Order Update - COD Fee Accounting Entries', () => {
    test('should create accounting entries when COD fee is added during edit', async () => {
      // Create and confirm order without COD fee
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        null, // No logistics company
        500
      )
      testData.orders.push(order)
      
      const confirmedOrder = await confirmOrder(order.id, 'BUSINESS_OWNER')
      
      // Check no COD fee entries exist
      const initialCodTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: { contains: 'COD Fee' }
        }
      })
      expect(initialCodTransactions.length).toBe(0)
      
      // Update order to add COD fee
      await updateOrder(order.id, {
        logisticsCompanyId: testData.logisticsCompany.id
      })
      
      // Verify COD fee was calculated
      const updatedOrder = await prisma.order.findUnique({
        where: { id: order.id }
      })
      expect(updatedOrder.codFee).toBeGreaterThan(0)
      
      // Verify accounting entries were created
      const codTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: { contains: 'COD Fee' }
        },
        include: { transactionLines: true }
      })
      
      expect(codTransactions.length).toBeGreaterThan(0)
      
      // Verify COD Fee Expense entry exists
      const expenseTransaction = codTransactions.find(t => 
        t.description.includes('COD Fee') && t.description.includes('Edit')
      )
      expect(expenseTransaction).toBeDefined()
    })

    test('should create adjustment entries when COD fee amount changes', async () => {
      // Create and confirm order with COD fee
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id,
        500
      )
      testData.orders.push(order)
      
      const confirmedOrder = await confirmOrder(order.id, 'BUSINESS_OWNER')
      const oldCodFee = confirmedOrder.codFee
      
      // Update order to change COD fee (by changing logistics company or manual override)
      // For this test, we'll manually set a different COD fee
      await updateOrder(order.id, {
        codFee: oldCodFee + 50 // Increase by 50
      })
      
      // Verify adjustment entries were created
      const adjustmentTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: { contains: 'Adjustment' }
        }
      })
      
      expect(adjustmentTransactions.length).toBeGreaterThan(0)
    })

    test('should reverse entries when COD fee is removed during edit', async () => {
      // Create and confirm order with COD fee
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id,
        500
      )
      testData.orders.push(order)
      
      const confirmedOrder = await confirmOrder(order.id, 'CUSTOMER')
      
      // Verify COD fee entries exist
      const initialCodTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: { contains: 'COD Fee' }
        }
      })
      expect(initialCodTransactions.length).toBeGreaterThan(0)
      
      // Remove COD fee
      await updateOrder(order.id, {
        logisticsCompanyId: null,
        codFee: null
      })
      
      // Verify reversal entries were created
      const reversalTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: { contains: 'Reversal' }
        }
      })
      
      expect(reversalTransactions.length).toBeGreaterThan(0)
    })

    test('should adjust AR/Revenue when payment preference changes', async () => {
      // Create and confirm order with BUSINESS_OWNER paying
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id,
        500
      )
      testData.orders.push(order)
      
      const confirmedOrder = await confirmOrder(order.id, 'BUSINESS_OWNER')
      const codFee = confirmedOrder.codFee
      
      // Change to CUSTOMER paying
      await updateOrder(order.id, {
        codFeePaidBy: 'CUSTOMER'
      })
      
      // Verify adjustment entries were created
      const preferenceChangeTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: { contains: 'Preference Change' }
        }
      })
      
      expect(preferenceChangeTransactions.length).toBeGreaterThan(0)
      
      // Verify AR was adjusted
      const arAccount = await accountingService.getAccountByCode('1200', testData.tenant.id)
      const arTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          transactionLines: {
            some: {
              accountId: arAccount.id
            }
          }
        },
        include: { transactionLines: true }
      })
      
      // Should have AR adjustment for COD fee revenue
      const hasCodFeeRevenueAdjustment = arTransactions.some(t =>
        t.description.includes('COD Fee') && t.description.includes('Preference')
      )
      expect(hasCodFeeRevenueAdjustment).toBe(true)
    })
  })

  describe('Test Case 7: Dispatch - COD Fee Accounting Entries', () => {
    test('should create accounting entries when COD fee is set during dispatch', async () => {
      // Create and confirm order without COD fee
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        null, // No logistics company
        500
      )
      testData.orders.push(order)
      
      const confirmedOrder = await confirmOrder(order.id, 'BUSINESS_OWNER')
      
      // Dispatch with logistics company (COD fee will be calculated)
      const dispatchResponse = await dispatchOrder(order.id, {
        logisticsCompanyId: testData.logisticsCompany.id
      })
      
      // Verify COD fee was calculated
      const dispatchedOrder = await prisma.order.findUnique({
        where: { id: order.id }
      })
      expect(dispatchedOrder.codFee).toBeGreaterThan(0)
      
      // Verify accounting entries were created
      const codTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: { contains: 'COD Fee' }
        }
      })
      
      expect(codTransactions.length).toBeGreaterThan(0)
    })

    test('should create adjustment entries when COD fee increases during dispatch', async () => {
      // Create and confirm order with COD fee
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id,
        500
      )
      testData.orders.push(order)
      
      const confirmedOrder = await confirmOrder(order.id, 'BUSINESS_OWNER')
      const oldCodFee = confirmedOrder.codFee
      
      // Create a new logistics company with higher percentage
      const newCompany = await prisma.logisticsCompany.create({
        data: {
          name: 'High Fee Logistics',
          tenantId: testData.tenant.id,
          codFeeCalculationType: 'PERCENTAGE',
          codFeePercentage: 5, // 5% instead of 2.5%
          status: 'ACTIVE'
        }
      })
      testData.logisticsCompanies.push(newCompany)
      
      // Dispatch with new logistics company (COD fee will increase)
      await dispatchOrder(order.id, {
        logisticsCompanyId: newCompany.id
      })
      
      // Verify adjustment entries were created
      const adjustmentTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: { contains: 'Adjustment' }
        }
      })
      
      expect(adjustmentTransactions.length).toBeGreaterThan(0)
    })

    test('should create reversing entries when COD fee decreases during dispatch', async () => {
      // Create and confirm order with COD fee
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id,
        500
      )
      testData.orders.push(order)
      
      const confirmedOrder = await confirmOrder(order.id, 'BUSINESS_OWNER')
      const oldCodFee = confirmedOrder.codFee
      
      // Create a new logistics company with lower percentage
      const newCompany = await prisma.logisticsCompany.create({
        data: {
          name: 'Low Fee Logistics',
          tenantId: testData.tenant.id,
          codFeeCalculationType: 'PERCENTAGE',
          codFeePercentage: 1, // 1% instead of 2.5%
          status: 'ACTIVE'
        }
      })
      testData.logisticsCompanies.push(newCompany)
      
      // Dispatch with new logistics company (COD fee will decrease)
      await dispatchOrder(order.id, {
        logisticsCompanyId: newCompany.id
      })
      
      // Verify adjustment entries were created (should handle decrease)
      const adjustmentTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: { contains: 'Adjustment' }
        }
      })
      
      // Should have adjustment entries for the decrease
      expect(adjustmentTransactions.length).toBeGreaterThan(0)
    })

    test('should reverse entries when COD fee is removed during dispatch', async () => {
      // Create and confirm order with COD fee
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id,
        500
      )
      testData.orders.push(order)
      
      const confirmedOrder = await confirmOrder(order.id, 'CUSTOMER')
      
      // Verify COD fee entries exist
      const initialCodTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: { contains: 'COD Fee' }
        }
      })
      expect(initialCodTransactions.length).toBeGreaterThan(0)
      
      // Dispatch without logistics company (removes COD fee)
      await dispatchOrder(order.id, {
        logisticsCompanyId: null
      })
      
      // Verify reversal entries were created
      const reversalTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: { contains: 'Reversal' }
        }
      })
      
      expect(reversalTransactions.length).toBeGreaterThan(0)
    })

    test('should adjust AR/Revenue when payment preference changes during dispatch', async () => {
      // Create and confirm order with BUSINESS_OWNER paying
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id,
        500
      )
      testData.orders.push(order)
      
      const confirmedOrder = await confirmOrder(order.id, 'BUSINESS_OWNER')
      
      // First update to change preference
      await updateOrder(order.id, {
        codFeePaidBy: 'CUSTOMER'
      })
      
      // Then dispatch (should handle preference change)
      await dispatchOrder(order.id, {})
      
      // Verify preference change entries exist
      const preferenceChangeTransactions = await prisma.transaction.findMany({
        where: {
          orderId: order.id,
          description: { contains: 'Preference Change' }
        }
      })
      
      expect(preferenceChangeTransactions.length).toBeGreaterThan(0)
    })
  })

  describe('Test Case 8: Profit Calculation with All Scenarios', () => {
    test('should calculate profit correctly after COD fee changes', async () => {
      // Create order with COD fee
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id,
        500
      )
      testData.orders.push(order)
      
      const confirmedOrder = await confirmOrder(order.id, 'CUSTOMER')
      
      // Get initial profit
      const initialProfit = await profitService.getProfitStatistics(testData.tenant.id, {
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date()
      })
      
      // Change COD fee amount
      await updateOrder(order.id, {
        codFee: confirmedOrder.codFee + 20
      })
      
      // Get profit after change
      const updatedProfit = await profitService.getProfitStatistics(testData.tenant.id, {
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date()
      })
      
      // Profit should reflect the COD fee change
      // Revenue should increase by 20 (if customer pays), cost should increase by 20
      const orderProfit = updatedProfit.orders.find(o => o.orderId === order.id)
      expect(orderProfit).toBeDefined()
      
      // If customer pays, revenue increases by 20, cost increases by 20, so profit stays same
      // If business pays, revenue stays same, cost increases by 20, so profit decreases by 20
      // Since we set CUSTOMER, profit should stay approximately same (small rounding differences possible)
      expect(Math.abs(orderProfit.profit - (initialProfit.orders.find(o => o.orderId === order.id)?.profit || 0))).toBeLessThan(1)
    })
  })

  describe('Test Case 6: Edge Cases', () => {
    test('should handle order without COD fee gracefully', async () => {
      // Create order with full prepayment (no COD)
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        null // No logistics company
      )
      testData.orders.push(order)
      
      // Update to full payment
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentAmount: 2200 } // Full payment
      })
      
      const confirmedOrder = await confirmOrder(order.id, 'BUSINESS_OWNER')
      
      expect(confirmedOrder.codFee).toBeNull()
      expect(confirmedOrder.codAmount).toBeNull()
      expect(confirmedOrder.codFeePaidBy).toBe('BUSINESS_OWNER')
    })
    
    test('should default to BUSINESS_OWNER if codFeePaidBy not provided', async () => {
      const order = await createTestOrder(
        testData.tenant.id,
        testData.form.id,
        testData.customer.id,
        testData.product,
        testData.logisticsCompany.id
      )
      testData.orders.push(order)
      
      // Confirm without specifying codFeePaidBy
      const confirmedOrder = await confirmOrder(order.id) // Defaults to BUSINESS_OWNER
      
      expect(confirmedOrder.codFeePaidBy).toBe('BUSINESS_OWNER')
    })
  })

  describe('Payment Verification During Order Confirmation', () => {
    let order
    let cashAccount
    let bankAccount

    beforeAll(async () => {
      // Create cash account
      cashAccount = await accountingService.getOrCreateAccount({
        code: '1000',
        name: 'Cash',
        type: 'ASSET',
        accountSubType: 'CASH',
        tenantId: testData.tenant.id,
        balance: 0
      })

      // Create bank account
      bankAccount = await accountingService.getOrCreateAccount({
        code: '1100',
        name: 'Bank Account',
        type: 'ASSET',
        accountSubType: 'BANK',
        tenantId: testData.tenant.id,
        balance: 0
      })
    })

    test('should verify payment during order confirmation when verifiedAmount and paymentAccountId provided', async () => {
      // Create order with claimed payment
      const order = await prisma.order.create({
        data: {
          orderNumber: `TEST-${Date.now()}`,
          formId: testData.form.id,
          tenantId: testData.tenant.id,
          customerId: testData.customer.id,
          status: 'PENDING',
          formData: JSON.stringify({ name: 'Test Customer', phone: '1234567890' }),
          selectedProducts: JSON.stringify([testData.product]),
          productQuantities: JSON.stringify({ [testData.product.id]: 2 }),
          productPrices: JSON.stringify({ [testData.product.id]: 1000 }),
          shippingCharges: 200,
          paymentAmount: 1000, // Customer claimed to pay Rs. 1000
          logisticsCompanyId: testData.logisticsCompany.id
        }
      })

      testData.orders.push(order)

      // Confirm order with payment verification
      const verifiedAmount = 1000 // Verify full claimed amount
      const confirmedOrder = await confirmOrder(
        order.id,
        'BUSINESS_OWNER',
        cashAccount.id,
        verifiedAmount
      )

      // Verify order was confirmed
      expect(confirmedOrder.status).toBe('CONFIRMED')
      expect(confirmedOrder.paymentVerified).toBe(true)
      expect(confirmedOrder.verifiedPaymentAmount).toBe(1000)
      expect(confirmedOrder.paymentAccountId).toBe(cashAccount.id)
      expect(confirmedOrder.paymentVerifiedAt).not.toBeNull()
      expect(confirmedOrder.paymentVerifiedBy).toBe(testData.tenant.ownerId)

      // Verify payment record was created
      const payment = await prisma.payment.findFirst({
        where: {
          orderId: order.id,
          type: 'CUSTOMER_PAYMENT'
        }
      })

      expect(payment).not.toBeNull()
      expect(payment.amount).toBe(1000)
      expect(payment.accountId).toBe(cashAccount.id)
      expect(payment.transactionId).not.toBeNull()

      // Verify accounting entries were created
      const paymentTransaction = await prisma.transaction.findUnique({
        where: { id: payment.transactionId },
        include: { transactionLines: true }
      })

      expect(paymentTransaction).not.toBeNull()
      expect(paymentTransaction.description).toContain('Payment Verified')
      
      // Verify transaction is balanced
      const totalDebits = paymentTransaction.transactionLines.reduce((sum, line) => sum + line.debitAmount, 0)
      const totalCredits = paymentTransaction.transactionLines.reduce((sum, line) => sum + line.creditAmount, 0)
      expect(totalDebits).toBe(totalCredits)
      expect(totalDebits).toBe(1000)

      // Verify Cash account was debited
      const cashLine = paymentTransaction.transactionLines.find(line => line.accountId === cashAccount.id)
      expect(cashLine).not.toBeNull()
      expect(cashLine.debitAmount).toBe(1000)
      expect(cashLine.creditAmount).toBe(0)

      // Verify AR account was credited
      const arAccount = await accountingService.getAccountByCode('1200', testData.tenant.id)
      const arLine = paymentTransaction.transactionLines.find(line => line.accountId === arAccount.id)
      expect(arLine).not.toBeNull()
      expect(arLine.debitAmount).toBe(0)
      expect(arLine.creditAmount).toBe(1000)
    })

    test('should handle payment verification with partial amount (verified < claimed)', async () => {
      // Create order with claimed payment
      const order = await prisma.order.create({
        data: {
          orderNumber: `TEST-${Date.now()}`,
          formId: testData.form.id,
          tenantId: testData.tenant.id,
          customerId: testData.customer.id,
          status: 'PENDING',
          formData: JSON.stringify({ name: 'Test Customer', phone: '1234567890' }),
          selectedProducts: JSON.stringify([testData.product]),
          productQuantities: JSON.stringify({ [testData.product.id]: 2 }),
          productPrices: JSON.stringify({ [testData.product.id]: 1000 }),
          shippingCharges: 200,
          paymentAmount: 1000, // Customer claimed to pay Rs. 1000
          logisticsCompanyId: testData.logisticsCompany.id
        }
      })

      testData.orders.push(order)

      // Confirm order with partial payment verification (only 500 received)
      const verifiedAmount = 500 // Verify only Rs. 500 (less than claimed)
      const confirmedOrder = await confirmOrder(
        order.id,
        'BUSINESS_OWNER',
        bankAccount.id,
        verifiedAmount
      )

      // Verify order was confirmed
      expect(confirmedOrder.status).toBe('CONFIRMED')
      expect(confirmedOrder.paymentVerified).toBe(true)
      expect(confirmedOrder.verifiedPaymentAmount).toBe(500) // Verified amount is less than claimed
      expect(confirmedOrder.paymentAmount).toBe(1000) // Claimed amount remains
      expect(confirmedOrder.paymentAccountId).toBe(bankAccount.id)

      // Verify payment record was created with verified amount
      const payment = await prisma.payment.findFirst({
        where: {
          orderId: order.id,
          type: 'CUSTOMER_PAYMENT'
        }
      })

      expect(payment).not.toBeNull()
      expect(payment.amount).toBe(500) // Payment record shows verified amount
      expect(payment.accountId).toBe(bankAccount.id)
      expect(payment.paymentMethod).toBe('Bank Transfer')

      // Verify accounting entries reflect verified amount (500), not claimed (1000)
      const paymentTransaction = await prisma.transaction.findUnique({
        where: { id: payment.transactionId },
        include: { transactionLines: true }
      })

      const totalDebits = paymentTransaction.transactionLines.reduce((sum, line) => sum + line.debitAmount, 0)
      const totalCredits = paymentTransaction.transactionLines.reduce((sum, line) => sum + line.creditAmount, 0)
      expect(totalDebits).toBe(500) // Only verified amount is posted
      expect(totalCredits).toBe(500)
    })

    test('should not verify payment if verifiedAmount is 0 or null', async () => {
      const order = await prisma.order.create({
        data: {
          orderNumber: `TEST-${Date.now()}`,
          formId: testData.form.id,
          tenantId: testData.tenant.id,
          customerId: testData.customer.id,
          status: 'PENDING',
          formData: JSON.stringify({ name: 'Test Customer', phone: '1234567890' }),
          selectedProducts: JSON.stringify([testData.product]),
          productQuantities: JSON.stringify({ [testData.product.id]: 2 }),
          productPrices: JSON.stringify({ [testData.product.id]: 1000 }),
          shippingCharges: 200,
          paymentAmount: 1000,
          logisticsCompanyId: testData.logisticsCompany.id
        }
      })

      testData.orders.push(order)

      // Confirm order without payment verification (verifiedAmount = 0)
      const confirmedOrder = await confirmOrder(
        order.id,
        'BUSINESS_OWNER',
        cashAccount.id,
        0 // No verification
      )

      // Verify order was confirmed but payment not verified
      expect(confirmedOrder.status).toBe('CONFIRMED')
      expect(confirmedOrder.paymentVerified).toBeFalsy()
      expect(confirmedOrder.verifiedPaymentAmount).toBeNull()

      // Verify no payment record was created
      const payment = await prisma.payment.findFirst({
        where: {
          orderId: order.id,
          type: 'CUSTOMER_PAYMENT',
          transactionId: { not: null }
        }
      })

      expect(payment).toBeNull()
    })
  })
})

// Note: Test helpers are defined within this file for internal use only
// For shared test utilities, use ./helpers/testHelpers.js

