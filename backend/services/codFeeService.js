const prisma = require('../lib/db');

class CODFeeService {
  /**
   * Calculate COD fee based on logistics company rules
   * @param {string} logisticsCompanyId - Logistics company ID
   * @param {number} codAmount - COD amount
   * @returns {Object} COD fee details
   */
  async calculateCODFee(logisticsCompanyId, codAmount) {
    const company = await prisma.logisticsCompany.findUnique({
      where: { id: logisticsCompanyId }
    });

    if (!company) {
      throw new Error('Logistics company not found');
    }

    if (company.status !== 'ACTIVE') {
      throw new Error('Logistics company is not active');
    }

    let codFee = 0;
    let calculationType = company.codFeeCalculationType;

    switch (company.codFeeCalculationType) {
      case 'PERCENTAGE':
        if (!company.codFeePercentage) {
          throw new Error('COD fee percentage not configured');
        }
        codFee = codAmount * (company.codFeePercentage / 100);
        break;

      case 'RANGE_BASED':
        if (!company.codFeeRules) {
          throw new Error('COD fee rules not configured');
        }
        const rules = JSON.parse(company.codFeeRules);
        // Sort rules by min value
        const sortedRules = rules.sort((a, b) => a.min - b.min);
        
        // Find matching range
        const matchingRule = sortedRules.find(rule => 
          codAmount >= rule.min && codAmount <= rule.max
        );
        
        if (!matchingRule) {
          // Use highest range if amount exceeds all ranges
          const highestRule = sortedRules[sortedRules.length - 1];
          if (codAmount > highestRule.max) {
            codFee = highestRule.fee;
          } else {
            throw new Error(`No matching COD fee rule for amount: ${codAmount}`);
          }
        } else {
          codFee = matchingRule.fee;
        }
        break;

      case 'FIXED':
        if (!company.fixedCodFee) {
          throw new Error('Fixed COD fee not configured');
        }
        codFee = company.fixedCodFee;
        break;

      default:
        throw new Error(`Invalid COD fee calculation type: ${company.codFeeCalculationType}`);
    }

    return {
      codFee: Math.round(codFee * 100) / 100, // Round to 2 decimal places
      codAmount,
      calculationType,
      logisticsCompany: {
        id: company.id,
        name: company.name
      }
    };
  }

  /**
   * Get COD fees by period
   * @param {Object} filters - Filter options
   * @returns {Object} COD fees with summary
   */
  async getCODFeesByPeriod(filters = {}) {
    const {
      tenantId,
      fromDate,
      toDate,
      logisticsCompanyId
    } = filters;

    const where = {
      tenantId,
      codAmount: {
        gt: 0
      }
    };

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = new Date(fromDate);
      if (toDate) where.createdAt.lte = new Date(toDate);
    }

    if (logisticsCompanyId) {
      where.logisticsCompanyId = logisticsCompanyId;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        logisticsCompany: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const summary = {
      totalCODAmount: 0,
      totalCODFee: 0,
      byCompany: {}
    };

    orders.forEach(order => {
      const codFee = order.codFee || 0;
      const codAmount = order.codAmount || 0;
      
      summary.totalCODAmount += codAmount;
      summary.totalCODFee += codFee;

      if (order.logisticsCompany) {
        const companyName = order.logisticsCompany.name;
        if (!summary.byCompany[companyName]) {
          summary.byCompany[companyName] = {
            count: 0,
            totalCODAmount: 0,
            totalCODFee: 0
          };
        }
        summary.byCompany[companyName].count++;
        summary.byCompany[companyName].totalCODAmount += codAmount;
        summary.byCompany[companyName].totalCODFee += codFee;
      }
    });

    return {
      orders,
      summary
    };
  }
}

module.exports = new CODFeeService();

