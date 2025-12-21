/**
 * WhatsApp Service
 * Utility functions for sending WhatsApp messages
 */

/**
 * Get customer phone number from order formData
 * @param {Object|String} formData - Order form data (object or JSON string)
 * @returns {String|null} - Phone number in international format or null
 */
function getCustomerPhone(formData) {
  if (!formData) return null;

  try {
    // Parse if string
    const data = typeof formData === 'string' ? JSON.parse(formData) : formData;

    // Common phone field names to check
    const phoneFieldNames = [
      'Phone Number',
      'Mobile Number',
      'Contact Number',
      'Phone',
      'Mobile',
      'Contact',
      'WhatsApp Number',
      'WhatsApp',
      'Phone No',
      'Mobile No'
    ];

    // First, try exact matches
    for (const fieldName of phoneFieldNames) {
      if (data[fieldName]) {
        return normalizePhoneNumber(data[fieldName]);
      }
    }

    // Then, try case-insensitive partial matches
    const dataKeys = Object.keys(data);
    for (const key of dataKeys) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('phone') || lowerKey.includes('mobile') || lowerKey.includes('contact') || lowerKey.includes('whatsapp')) {
        return normalizePhoneNumber(data[key]);
      }
    }

    return null;
  } catch (error) {
    console.error('Error parsing formData for phone number:', error);
    return null;
  }
}

/**
 * Normalize phone number to international format
 * @param {String} phone - Phone number in any format
 * @returns {String|null} - Normalized phone number or null
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Convert to string and trim whitespace
  let original = phone.toString().trim();
  let cleaned = original;

  // Remove all non-digit characters except +
  cleaned = cleaned.replace(/[^\d+]/g, '');

  // Handle different formats
  // Case 1: Starts with 0 (e.g., 03426491425) -> +923426491425
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = '+92' + cleaned.substring(1);
  }
  // Case 2: Starts with 92 but no + (e.g., 923426491425) -> +923426491425
  else if (cleaned.startsWith('92') && !cleaned.startsWith('+92') && cleaned.length === 12) {
    cleaned = '+' + cleaned;
  }
  // Case 3: Already has +92, keep as is
  else if (cleaned.startsWith('+92')) {
    // Already in correct format, just ensure it's clean
    cleaned = cleaned.replace(/[^\d+]/g, '');
  }
  // Case 4: 10 digits without country code (e.g., 3426491425) -> +923426491425
  else if (cleaned.length === 10 && /^\d{10}$/.test(cleaned)) {
    cleaned = '+92' + cleaned;
  }
  // Case 5: 11 digits starting with 0 (handle edge cases)
  else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = '+92' + cleaned.substring(1);
  }
  // Case 6: Already has + but not +92, try to fix
  else if (cleaned.startsWith('+') && !cleaned.startsWith('+92')) {
    // Remove + and try again
    cleaned = cleaned.substring(1);
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      cleaned = '+92' + cleaned.substring(1);
    } else if (cleaned.length === 10) {
      cleaned = '+92' + cleaned;
    } else if (cleaned.startsWith('92') && cleaned.length === 12) {
      cleaned = '+' + cleaned;
    }
  }
  // Case 7: Default - assume it's a 10-digit number without country code
  else if (cleaned.length >= 10 && /^\d+$/.test(cleaned)) {
    // Take last 10 digits if longer
    if (cleaned.length > 10) {
      cleaned = cleaned.substring(cleaned.length - 10);
    }
    cleaned = '+92' + cleaned;
  }
  else {
    // Can't normalize
    console.log(`⚠️  Phone normalization failed: Cannot parse format for "${original}"`);
    return null;
  }

  // Final validation: should be +92 followed by exactly 10 digits
  if (/^\+92\d{10}$/.test(cleaned)) {
    console.log(`✅ Phone normalized: "${original}" -> "${cleaned}"`);
    return cleaned;
  }

  console.log(`⚠️  Phone normalization failed: Invalid format "${original}" -> "${cleaned}"`);
  return null;
}

/**
 * Generate WhatsApp message URL
 * @param {String} phoneNumber - Phone number in international format
 * @param {String} message - Message text
 * @returns {String} - WhatsApp URL
 */
function generateWhatsAppUrl(phoneNumber, message) {
  if (!phoneNumber) return null;

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) return null;

  // Remove + from phone number for URL
  const phoneForUrl = normalizedPhone.replace('+', '');
  const encodedMessage = encodeURIComponent(message);

  return `https://wa.me/${phoneForUrl}?text=${encodedMessage}`;
}

/**
 * Generate order confirmation message
 * @param {Object} order - Order object
 * @param {Object} tenant - Tenant object
 * @returns {String} - Formatted message
 */
function generateOrderConfirmationMessage(order, tenant) {
  try {
    const formData = typeof order.formData === 'string' 
      ? JSON.parse(order.formData) 
      : order.formData;

    const customerName = formData['Customer Name'] || formData['Name'] || 'Customer';
    
    // Parse products
    let selectedProducts = [];
    let productQuantities = {};
    let productPrices = {};
    let productsTotal = 0;

    try {
      if (order.selectedProducts) {
        selectedProducts = typeof order.selectedProducts === 'string'
          ? JSON.parse(order.selectedProducts)
          : order.selectedProducts;
        if (!Array.isArray(selectedProducts)) {
          selectedProducts = [];
        }
      }
      if (order.productQuantities) {
        productQuantities = typeof order.productQuantities === 'string'
          ? JSON.parse(order.productQuantities)
          : order.productQuantities;
      }
      if (order.productPrices) {
        productPrices = typeof order.productPrices === 'string'
          ? JSON.parse(order.productPrices)
          : order.productPrices;
      }

      // Calculate total
      selectedProducts.forEach(product => {
        const quantity = productQuantities[product.id] || product.quantity || 1;
        const price = productPrices[product.id] || product.price || product.currentRetailPrice || 0;
        productsTotal += price * quantity;
      });
    } catch (e) {
      console.error('Error parsing order products:', e);
    }

    const shippingCharges = parseFloat(order.shippingCharges || 0);
    const orderTotal = productsTotal + shippingCharges;

    // Build concise, to-the-point message
    let message = `✅ Order #${order.orderNumber} Confirmed\n\n`;
    
    // Products summary (max 2 products for brevity)
    if (selectedProducts.length > 0) {
      selectedProducts.slice(0, 2).forEach(product => {
        const quantity = productQuantities[product.id] || product.quantity || 1;
        message += `• ${product.name} x${quantity}\n`;
      });
      if (selectedProducts.length > 2) {
        message += `• +${selectedProducts.length - 2} more items\n`;
      }
    }

    message += `\nTotal: Rs. ${orderTotal.toLocaleString()}`;
    if (shippingCharges > 0) {
      message += ` (incl. shipping)`;
    }
    message += `\n\nThank you!`;

    return message;
  } catch (error) {
    console.error('Error generating confirmation message:', error);
    // Fallback simple message
    return `✅ Your order #${order.orderNumber} has been confirmed. Thank you!`;
  }
}

module.exports = {
  getCustomerPhone,
  normalizePhoneNumber,
  generateWhatsAppUrl,
  generateOrderConfirmationMessage
};


