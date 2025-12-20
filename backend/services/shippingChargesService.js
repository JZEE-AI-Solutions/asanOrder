const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// System defaults (used as final fallback)
const SYSTEM_DEFAULTS = {
  defaultCityCharge: 200,
  defaultQuantityCharge: 150
};

// Helper function to normalize city names for matching
function normalizeCityName(city) {
  if (!city) return '';
  return city.trim().toLowerCase().replace(/\s+/g, ' ');
}

class ShippingChargesService {
  /**
   * Calculate shipping charges for an order
   * @param {string} tenantId - Tenant ID
   * @param {string} city - Customer city
   * @param {Array} selectedProducts - Array of products with id and quantity
   * @param {Object} productQuantities - Map of productId -> quantity
   * @returns {Promise<number>} Total shipping charges
   */
  static async calculateShippingCharges(tenantId, city, selectedProducts, productQuantities) {
    try {
      // 1. Get tenant shipping configuration
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          shippingCityCharges: true,
          shippingQuantityRules: true
        }
      });

      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // 2. Parse configurations with defaults
      let cityCharges = {};
      let defaultCityCharge = SYSTEM_DEFAULTS.defaultCityCharge;
      let defaultQuantityCharge = SYSTEM_DEFAULTS.defaultQuantityCharge;
      let defaultQuantityRules = [];

      // Parse city charges
      if (tenant.shippingCityCharges) {
        try {
          const parsed = JSON.parse(tenant.shippingCityCharges);
          if (typeof parsed === 'object' && parsed !== null) {
            // Support both formats:
            // Format 1: { "cityCharges": {...}, "defaultCityCharge": 200 }
            // Format 2: { "Karachi": 150, "Lahore": 200, "default": 200 }
            if (parsed.cityCharges) {
              cityCharges = parsed.cityCharges;
              defaultCityCharge = parsed.defaultCityCharge || SYSTEM_DEFAULTS.defaultCityCharge;
            } else {
              cityCharges = parsed;
              defaultCityCharge = parsed.default || SYSTEM_DEFAULTS.defaultCityCharge;
            }
          }
        } catch (e) {
          console.error('Error parsing shippingCityCharges:', e);
        }
      }

      // Parse quantity rules
      if (tenant.shippingQuantityRules) {
        try {
          const parsed = JSON.parse(tenant.shippingQuantityRules);
          if (Array.isArray(parsed) && parsed.length > 0) {
            defaultQuantityRules = parsed;
          } else if (parsed.quantityRules) {
            defaultQuantityRules = parsed.quantityRules;
            defaultQuantityCharge = parsed.defaultQuantityCharge || SYSTEM_DEFAULTS.defaultQuantityCharge;
          }
          
          // Sort rules by min value to ensure proper matching order
          if (defaultQuantityRules.length > 0) {
            defaultQuantityRules.sort((a, b) => {
              const minA = a.min || 1;
              const minB = b.min || 1;
              return minA - minB;
            });
            console.log(`📋 Loaded ${defaultQuantityRules.length} quantity rules (sorted):`, 
              defaultQuantityRules.map(r => `${r.min}-${r.max === null || r.max === undefined ? '∞' : r.max}:Rs.${r.charge}`).join(', '));
          }
        } catch (e) {
          console.error('Error parsing shippingQuantityRules:', e);
        }
      }

      // If no quantity rules exist, create a simple default rule
      if (defaultQuantityRules.length === 0) {
        defaultQuantityRules = [
          { min: 1, max: null, charge: defaultQuantityCharge }
        ];
      } else {
        // Sort rules by min value to ensure proper matching order
        defaultQuantityRules.sort((a, b) => {
          const minA = a.min || 1;
          const minB = b.min || 1;
          return minA - minB;
        });
      }

      // 3. Get city base charge (with fallback)
      let cityBaseCharge = defaultCityCharge; // Start with tenant default

      if (city) {
        const cityNormalized = normalizeCityName(city);
        const cityOriginal = city.trim();
        
        // Try exact city match first (case-sensitive)
        if (cityCharges[cityOriginal]) {
          cityBaseCharge = cityCharges[cityOriginal];
          console.log(`✅ City match (exact): "${cityOriginal}" = Rs. ${cityBaseCharge}`);
        }
        // Try case-insensitive match with normalized names
        else {
          const matchedCity = Object.keys(cityCharges).find(
            key => key !== 'default' && normalizeCityName(key) === cityNormalized
          );
          if (matchedCity) {
            cityBaseCharge = cityCharges[matchedCity];
            console.log(`✅ City match (normalized): "${cityOriginal}" matched "${matchedCity}" = Rs. ${cityBaseCharge}`);
          }
          // If still not found, use default
          else {
            cityBaseCharge = cityCharges['default'] || defaultCityCharge;
            console.log(`⚠️ City not found: "${cityOriginal}" (normalized: "${cityNormalized}"), using default: Rs. ${cityBaseCharge}`);
            console.log(`   Available cities: ${Object.keys(cityCharges).filter(k => k !== 'default').map(c => `"${c}"`).join(', ')}`);
          }
        }
      } else {
        console.log(`⚠️ No city provided, using default: Rs. ${cityBaseCharge}`);
      }

      // 4. Calculate quantity-based charges per product
      let totalQuantityCharge = 0;

      if (selectedProducts && Array.isArray(selectedProducts) && selectedProducts.length > 0) {
        for (const product of selectedProducts) {
          const quantity = productQuantities?.[product.id] || product.quantity || 1;

          // Get product-specific shipping rules if available
          let quantityRules = defaultQuantityRules;
          let productCharge = 0;
          // Use product-specific default charge, or fallback to tenant default
          let productDefaultQuantityCharge = defaultQuantityCharge;

          try {
            const productData = await prisma.product.findUnique({
              where: { id: product.id },
              select: {
                shippingQuantityRules: true,
                shippingDefaultQuantityCharge: true,
                useDefaultShipping: true
              }
            });

            // Use product-specific rules and default charge if configured
            if (productData && !productData.useDefaultShipping) {
              // Use product-specific default quantity charge if available
              if (productData.shippingDefaultQuantityCharge !== null && productData.shippingDefaultQuantityCharge !== undefined) {
                productDefaultQuantityCharge = productData.shippingDefaultQuantityCharge;
                console.log(`  📦 Product "${product.name || product.id}" using custom default quantity charge: Rs. ${productDefaultQuantityCharge}`);
              }
              
              // Use product-specific rules if configured (but default charge takes precedence for calculation)
              if (productData.shippingQuantityRules) {
                try {
                  const productRules = JSON.parse(productData.shippingQuantityRules);
                  if (Array.isArray(productRules) && productRules.length > 0) {
                    // Sort product-specific rules by min value
                    quantityRules = [...productRules].sort((a, b) => {
                      const minA = a.min || 1;
                      const minB = b.min || 1;
                      return minA - minB;
                    });
                    console.log(`  📦 Product "${product.name || product.id}" has custom shipping rules:`, 
                      quantityRules.map(r => `${r.min}-${r.max === null || r.max === undefined ? '∞' : r.max}:Rs.${r.charge}`).join(', '));
                    console.log(`  ℹ️ Note: Rules are used as per-unit charges for additional units (quantity - 1)`);
                  } else {
                    console.log(`  ⚠️ Product "${product.name || product.id}" has empty custom rules, using default charge: Rs. ${productDefaultQuantityCharge}`);
                  }
                } catch (e) {
                  console.error(`Error parsing product ${product.id} shipping rules:`, e);
                  // Fallback to default rules
                }
              } else {
                console.log(`  ℹ️ Product "${product.name || product.id}" has no custom rules, using default charge: Rs. ${productDefaultQuantityCharge}`);
              }
            } else if (productData && productData.useDefaultShipping) {
              console.log(`  ℹ️ Product "${product.name || product.id}" using default shipping rules`);
            }
          } catch (e) {
            console.error(`Error fetching product ${product.id}:`, e);
            // Continue with default rules
          }

          // Sort rules by min value to ensure proper matching (first matching rule wins)
          const sortedRules = [...quantityRules].sort((a, b) => {
            const minA = a.min || 1;
            const minB = b.min || 1;
            return minA - minB;
          });

          // Find applicable quantity rule for this product (first matching rule)
          // Rules are sorted by min value, so first match is the correct one
          const applicableRule = sortedRules.find(rule => {
            const min = rule.min || 1;
            const max = rule.max === null || rule.max === undefined ? Infinity : rule.max;
            // Inclusive range: quantity must be >= min AND <= max
            const matches = quantity >= min && quantity <= max;
            if (matches) {
              console.log(`  ✅ Quantity rule matched: ${quantity} qty matches rule ${min}-${max === Infinity ? '∞' : max} = Rs. ${rule.charge}`);
            }
            return matches;
          });
          
          // Debug: Log all rules for troubleshooting
          if (sortedRules.length > 0) {
            console.log(`  📋 Available rules for "${product.name || product.id}":`, 
              sortedRules.map(r => `${r.min}-${r.max === null || r.max === undefined ? '∞' : r.max}:Rs.${r.charge}`).join(', '));
          }

          if (applicableRule) {
            // Rule matched: apply the rule's charge per additional unit (quantity - 1)
            // Quantity 1: No quantity charge (only city charge applies)
            // Quantity > 1: Rule charge × (quantity - 1) additional units
            if (quantity === 1) {
              productCharge = 0;
              console.log(`  📦 Product "${product.name || product.id}": ${quantity} qty → Rs. ${productCharge} (quantity 1, no quantity charge even with rule match)`);
            } else {
              // Rule charge is per additional unit beyond the first
              productCharge = (applicableRule.charge || 0) * (quantity - 1);
              console.log(`  📦 Product "${product.name || product.id}": ${quantity} qty → Rs. ${applicableRule.charge} × ${quantity - 1} additional units = Rs. ${productCharge} (rule matched)`);
            }
          } else {
            // No rule matched: apply default charge logic
            // Quantity 1: No quantity charge (only city charge applies)
            // Quantity > 1: Charge for (quantity - 1) additional units
            if (quantity === 1) {
              productCharge = 0;
              console.log(`  📦 Product "${product.name || product.id}": ${quantity} qty → Rs. ${productCharge} (quantity 1, no quantity charge)`);
            } else {
              // Fallback: If no rule matches, check if we should use default rules or default charge
              // If product has custom rules but none match, use defaultQuantityCharge
              // This prevents using the wrong rule (e.g., last rule) when quantity is outside all ranges
              if (sortedRules.length > 0) {
                // Product has custom rules but quantity doesn't match any
                // Check if quantity is less than the minimum rule
                const minRule = sortedRules[0];
                const minRuleMin = minRule.min || 1;
                
                if (quantity < minRuleMin) {
                  // Quantity is less than the minimum rule - use default charge for (quantity - 1) units
                  productCharge = productDefaultQuantityCharge * (quantity - 1);
                  console.log(`  ⚠️ Quantity ${quantity} is less than minimum rule (${minRuleMin}), using default charge for additional units: Rs. ${productDefaultQuantityCharge} × ${quantity - 1} = Rs. ${productCharge}`);
                } else {
                  // Quantity is greater than all rules - use the last rule (highest range)
                  const lastRule = sortedRules[sortedRules.length - 1];
                  productCharge = lastRule.charge || (productDefaultQuantityCharge * (quantity - 1));
                  console.log(`  ⚠️ Quantity ${quantity} exceeds all rules, using last rule (${lastRule.min}-${lastRule.max === null || lastRule.max === undefined ? '∞' : lastRule.max}): Rs. ${productCharge}`);
                }
              } else {
                // No custom rules - use default charge for (quantity - 1) additional units
                productCharge = productDefaultQuantityCharge * (quantity - 1);
                console.log(`  ⚠️ No custom rules available, using default charge for additional units: Rs. ${productDefaultQuantityCharge} × ${quantity - 1} = Rs. ${productCharge}`);
              }
            }
          }

          totalQuantityCharge += productCharge;
        }
      }

      // 5. Total shipping = City base + Quantity charges
      const totalShipping = cityBaseCharge + totalQuantityCharge;

      console.log(`📦 Shipping calculation summary:`);
      console.log(`   City: "${city || 'N/A'}" → Rs. ${cityBaseCharge}`);
      console.log(`   Quantity charges: Rs. ${totalQuantityCharge}`);
      console.log(`   Total: Rs. ${totalShipping}`);

      return totalShipping;
    } catch (error) {
      console.error('Error calculating shipping charges:', error);
      // Return system default as final fallback
      return SYSTEM_DEFAULTS.defaultCityCharge + SYSTEM_DEFAULTS.defaultQuantityCharge;
    }
  }

  /**
   * Get default shipping configuration
   * @returns {Object} Default configuration
   */
  static getDefaultShippingConfig() {
    return {
      cityCharges: {},
      defaultCityCharge: SYSTEM_DEFAULTS.defaultCityCharge,
      quantityRules: [
        { min: 1, max: null, charge: SYSTEM_DEFAULTS.defaultQuantityCharge }
      ],
      defaultQuantityCharge: SYSTEM_DEFAULTS.defaultQuantityCharge
    };
  }
}

module.exports = ShippingChargesService;

