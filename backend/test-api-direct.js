const axios = require('axios');

async function testAPI() {
  try {
    console.log('Testing API directly...');
    
    // Test if server is running
    const response = await axios.get('http://localhost:5000/api/health');
    console.log('Server is running:', response.data);
    
  } catch (error) {
    console.log('Server not running or health endpoint not available');
    console.log('Error:', error.message);
  }
}

testAPI();
