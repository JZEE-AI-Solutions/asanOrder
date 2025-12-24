require('dotenv').config({ path: '.env.test' });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Global test setup
beforeAll(async () => {
  // Use test database if specified, otherwise use regular database
  // In production, you'd want a separate test database
  console.log('Setting up test environment...');
});

// Clean up after all tests
afterAll(async () => {
  await prisma.$disconnect();
});

// Clean up between tests (optional - can be expensive)
// beforeEach(async () => {
//   // Clean test data if needed
// });

module.exports = { prisma };

