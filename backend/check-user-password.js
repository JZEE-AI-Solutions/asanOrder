const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function checkUserPassword() {
  try {
    console.log('Checking user passwords...');
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        password: true
      }
    });
    
    console.log(`Found ${users.length} users:`);
    for (const user of users) {
      console.log(`\n${user.email} (${user.name}) - ${user.role}`);
      
      // Test common passwords
      const testPasswords = ['password123', 'password', '123456', 'admin123', 'test123'];
      
      for (const testPassword of testPasswords) {
        const isValid = await bcrypt.compare(testPassword, user.password);
        if (isValid) {
          console.log(`  ✅ Password found: ${testPassword}`);
          break;
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserPassword();
