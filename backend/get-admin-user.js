require('dotenv').config();
const prisma = require('./lib/db');

(async () => {
  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { email: true, name: true, role: true }
    });
    
    if (admin) {
      console.log('Admin user found:');
      console.log(JSON.stringify(admin, null, 2));
    } else {
      console.log('No admin user found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
})();

