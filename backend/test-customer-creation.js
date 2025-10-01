const axios = require('axios')

const API_BASE = 'http://localhost:5000/api'

async function testCustomerCreation() {
  try {
    console.log('🧪 Testing Customer Creation System...\n')

    // Test 1: Submit an order with phone number
    console.log('1. Submitting test order with phone number...')
    
    const orderData = {
      formId: 'cmg4cg8l90015ezwvyffsuyl7', // Use your existing form ID
      formData: {
        'Phone Number': '03333333333',
        'Customer Name': 'Test Customer',
        'Shipping Address': 'Test Address, Karachi'
      },
      selectedProducts: JSON.stringify([
        { id: 'cmg4e1q9u0011s0733isidtbg' },
        { id: 'cmg4e1mww000xs073a653cqt6' }
      ]),
      productQuantities: JSON.stringify({
        'cmg4e1q9u0011s0733isidtbg': 2,
        'cmg4e1mww000xs073a653cqt6': 1
      })
    }

    const orderResponse = await axios.post(`${API_BASE}/order/submit`, orderData)
    console.log('✅ Order submitted successfully!')
    console.log('Order ID:', orderResponse.data.order.id)
    console.log('Customer ID:', orderResponse.data.order.customerId)

    // Test 2: Check if customer was created
    console.log('\n2. Checking if customer was created...')
    
    if (orderResponse.data.order.customerId) {
      const customerResponse = await axios.get(`${API_BASE}/customer/${orderResponse.data.order.customerId}`)
      console.log('✅ Customer found!')
      console.log('Customer Details:', {
        id: customerResponse.data.customer.id,
        name: customerResponse.data.customer.name,
        phoneNumber: customerResponse.data.customer.phoneNumber,
        totalOrders: customerResponse.data.customer.totalOrders,
        totalSpent: customerResponse.data.customer.totalSpent
      })

      // Test 3: Check customer logs
      console.log('\n3. Checking customer logs...')
      const logsResponse = await axios.get(`${API_BASE}/customer/${orderResponse.data.order.customerId}/logs`)
      console.log('✅ Customer logs found!')
      console.log('Logs count:', logsResponse.data.logs.length)
      logsResponse.data.logs.forEach((log, index) => {
        console.log(`Log ${index + 1}:`, {
          action: log.action,
          description: log.description,
          createdAt: log.createdAt
        })
      })
    } else {
      console.log('❌ No customer ID found in order response')
    }

    // Test 4: List all customers
    console.log('\n4. Listing all customers...')
    const customersResponse = await axios.get(`${API_BASE}/customer`)
    console.log('✅ Customers list retrieved!')
    console.log('Total customers:', customersResponse.data.customers.length)
    customersResponse.data.customers.forEach((customer, index) => {
      console.log(`Customer ${index + 1}:`, {
        id: customer.id,
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        totalOrders: customer.totalOrders
      })
    })

    console.log('\n🎉 Customer creation test completed successfully!')

  } catch (error) {
    console.error('❌ Test failed:')
    console.error('Error message:', error.message)
    if (error.response) {
      console.error('Response status:', error.response.status)
      console.error('Response data:', error.response.data)
    }
    if (error.code) {
      console.error('Error code:', error.code)
    }
  }
}

testCustomerCreation()
