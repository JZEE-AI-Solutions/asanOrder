const fs = require('fs')
const path = require('path')

// Read the production env file to get the correct connection string
const envProdPath = path.join(__dirname, 'env.production')
const envPath = path.join(__dirname, '.env')

console.log('🔧 Fixing DATABASE_URL in .env file...\n')

// Read production env file
let productionEnv = {}
if (fs.existsSync(envProdPath)) {
  const prodContent = fs.readFileSync(envProdPath, 'utf8')
  prodContent.split('\n').forEach(line => {
    const match = line.match(/^DATABASE_URL="(.+)"$/)
    if (match) {
      productionEnv.DATABASE_URL = match[1]
    }
  })
  console.log('✅ Found production DATABASE_URL:', productionEnv.DATABASE_URL?.substring(0, 50) + '...')
}

// Read current .env file
if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found!')
  process.exit(1)
}

let envContent = fs.readFileSync(envPath, 'utf8')
const lines = envContent.split('\n')

// Find and replace DATABASE_URL
let updated = false
const newLines = lines.map(line => {
  // Skip commented lines
  if (line.trim().startsWith('#')) {
    return line
  }
  
  // Check if this is the DATABASE_URL line
  if (line.includes('DATABASE_URL=')) {
    // Use production connection string if available, otherwise use the correct format
    if (productionEnv.DATABASE_URL) {
      updated = true
      console.log('📝 Updating DATABASE_URL to production connection string')
      return `DATABASE_URL="${productionEnv.DATABASE_URL}"`
    } else {
      // If no production env, check if it needs fixing
      if (!line.includes('sqlserver://')) {
        console.log('⚠️  DATABASE_URL found but not in sqlserver:// format')
        console.log('   Please update manually or ensure env.production has the correct format')
        return line
      }
    }
  }
  return line
})

if (updated) {
  // Write updated content
  fs.writeFileSync(envPath, newLines.join('\n'), 'utf8')
  console.log('\n✅ .env file updated successfully!')
  console.log('   DATABASE_URL now uses sqlserver:// protocol')
} else {
  console.log('\n⚠️  No changes needed or DATABASE_URL already correct')
}

console.log('\n📋 Next steps:')
console.log('   1. Restart your server')
console.log('   2. Run: node validate-login-flow.js to test the connection')

