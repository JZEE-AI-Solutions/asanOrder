const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkPosCodRules() {
    try {
        // Find POS company
        const posCompany = await prisma.logisticsCompany.findFirst({
            where: {
                name: 'POS'
            }
        })
        
        if (!posCompany) {
            console.log('❌ POS company not found')
            return
        }
        
        console.log(`\n=== POS Logistics Company Details ===\n`)
        console.log(`ID: ${posCompany.id}`)
        console.log(`Name: ${posCompany.name}`)
        console.log(`Calculation Type: ${posCompany.codFeeCalculationType}`)
        console.log(`Status: ${posCompany.status}`)
        
        if (posCompany.codFeeCalculationType === 'RANGE_BASED') {
            let codFeeRules = null
            try {
                codFeeRules = typeof posCompany.codFeeRules === 'string'
                    ? JSON.parse(posCompany.codFeeRules)
                    : (posCompany.codFeeRules || [])
            } catch (e) {
                console.log(`\n⚠️  Error parsing COD fee rules: ${e.message}`)
                return
            }
            
            console.log(`\nCOD Fee Rules (${codFeeRules.length} rules):`)
            if (Array.isArray(codFeeRules) && codFeeRules.length > 0) {
                // Sort by min
                const sortedRules = [...codFeeRules].sort((a, b) => a.min - b.min)
                
                sortedRules.forEach((rule, index) => {
                    console.log(`\nRule ${index + 1}:`)
                    console.log(`  Min: Rs. ${rule.min}`)
                    console.log(`  Max: Rs. ${rule.max}`)
                    console.log(`  Type: ${rule.type}`)
                    if (rule.type === 'FIXED') {
                        console.log(`  Fee: Rs. ${rule.fee}`)
                    } else if (rule.type === 'PERCENTAGE') {
                        console.log(`  Percentage: ${rule.percentage}%`)
                    }
                })
                
                // Test with COD amount 212
                const codAmount = 212
                console.log(`\n=== Testing with COD Amount: Rs. ${codAmount} ===`)
                
                let matchedRule = null
                for (const rule of sortedRules) {
                    if (codAmount >= rule.min && codAmount <= rule.max) {
                        matchedRule = rule
                        break
                    }
                }
                
                if (matchedRule) {
                    console.log(`\n✅ Matched Rule:`)
                    console.log(`  Range: Rs. ${matchedRule.min} - Rs. ${matchedRule.max}`)
                    console.log(`  Type: ${matchedRule.type}`)
                    
                    let codFee = 0
                    if (matchedRule.type === 'FIXED') {
                        codFee = parseFloat(matchedRule.fee || 0)
                        console.log(`  COD Fee: Rs. ${codFee.toFixed(2)} (Fixed)`)
                    } else if (matchedRule.type === 'PERCENTAGE') {
                        const percentage = parseFloat(matchedRule.percentage || 0)
                        codFee = (codAmount * percentage) / 100
                        console.log(`  COD Fee: Rs. ${codFee.toFixed(2)} (${percentage}% of Rs. ${codAmount})`)
                    }
                } else {
                    console.log(`\n❌ No matching rule found for COD amount Rs. ${codAmount}`)
                    console.log(`Available ranges:`)
                    sortedRules.forEach((rule, index) => {
                        console.log(`  Rule ${index + 1}: Rs. ${rule.min} - Rs. ${rule.max}`)
                    })
                }
            } else {
                console.log(`\n⚠️  No COD fee rules configured`)
            }
        } else {
            console.log(`\n⚠️  Company is not RANGE_BASED, it's ${posCompany.codFeeCalculationType}`)
        }
        
    } catch (error) {
        console.error('Error:', error)
    } finally {
        await prisma.$disconnect()
    }
}

checkPosCodRules()

