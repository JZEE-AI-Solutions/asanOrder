const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

async function setup() {
    try {
        // 1. Login as Admin
        console.log('Logging in as Admin...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@orderms.com',
            password: 'admin123'
        });
        const token = loginRes.data.token;
        console.log('✅ Admin logged in.');

        // 2. Create Tenant
        console.log('Creating Tenant...');
        const tenantRes = await axios.post(`${API_URL}/tenant`, {
            businessName: 'HappyTenant',
            contactPerson: 'Happy Manager',
            whatsappNumber: '+923001234567',
            businessType: 'DRESS_SHOP',
            ownerEmail: 'happy@owner.com',
            ownerName: 'Happy Owner',
            ownerPassword: 'password123'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log('✅ Tenant created:', tenantRes.data.tenant.businessName);
        console.log('✅ Owner created: happy@owner.com / password123');

    } catch (error) {
        if (error.response) {
            console.error('❌ Error:', error.response.data);
        } else {
            console.error('❌ Error:', error.message);
        }
    }
}

setup();
