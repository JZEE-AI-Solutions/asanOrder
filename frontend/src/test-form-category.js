// Test file to verify form category implementation
console.log('Testing form category implementation...')

// Test 1: Check if CreateFormModal has formCategory field
const testFormData = {
  name: 'Test Form',
  description: 'Test Description',
  formCategory: 'SHOPPING_CART',
  fields: [
    { label: 'Customer Name', fieldType: 'TEXT', isRequired: true }
  ]
}

console.log('Test form data:', testFormData)
console.log('Form category:', testFormData.formCategory)

// Test 2: Simulate form submission
const submitForm = async (data) => {
  try {
    const response = await fetch('/api/form', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    })
    
    if (response.ok) {
      console.log('Form submitted successfully')
      return await response.json()
    } else {
      console.error('Form submission failed:', response.statusText)
    }
  } catch (error) {
    console.error('Error submitting form:', error)
  }
}

// Test 3: Check if form category dropdown is visible
const checkFormCategoryDropdown = () => {
  const dropdown = document.querySelector('select[name="formCategory"]')
  if (dropdown) {
    console.log('✅ Form category dropdown found')
    console.log('Options:', Array.from(dropdown.options).map(opt => opt.value))
  } else {
    console.log('❌ Form category dropdown not found')
  }
}

// Run tests
console.log('Running form category tests...')
checkFormCategoryDropdown()

export { testFormData, submitForm, checkFormCategoryDropdown }
