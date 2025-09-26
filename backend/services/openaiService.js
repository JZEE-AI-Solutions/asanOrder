const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Process invoice image and extract product information
 * @param {string} imagePath - Path to the uploaded invoice image
 * @returns {Promise<Array>} Array of extracted products
 */
async function processInvoiceImage(imagePath) {
  try {
    // Read the image file
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Create the prompt for OpenAI Vision
    const prompt = `
    Analyze this purchase invoice image and extract all product information. 
    Return the data in the following JSON format:
    {
      "products": [
        {
          "name": "Product Name",
          "description": "Product description if available",
          "purchasePrice": 100.00,
          "quantity": 5,
          "category": "Category if identifiable",
          "sku": "SKU if available"
        }
      ]
    }
    
    Instructions:
    - Extract all products from the invoice
    - For product names in Urdu/Arabic script, convert them to Roman English (Latin script) using common transliteration
    - For example: "خریده کپڑای" should become "Kharide Kapray" or "Purchased Clothes"
    - For mixed language names, provide both original and Roman English versions
    - Convert prices to numbers (remove currency symbols like Rs., PKR, etc.)
    - Extract quantities as integers
    - If category is not clear, leave it null
    - If SKU is not available, leave it null
    - If description is not available, leave it null
    - Be as accurate as possible with the data extraction
    - Focus on clothing/textile related terms when translating from Urdu
    `;

    // Call OpenAI Vision API
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.1
    });

    // Parse the response
    const content = response.choices[0].message.content;
    
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in OpenAI response');
    }

    const extractedData = JSON.parse(jsonMatch[0]);
    
    // Validate the extracted data
    if (!extractedData.products || !Array.isArray(extractedData.products)) {
      throw new Error('Invalid product data format from OpenAI');
    }

    // Separate products and returns based on quantity
    const products = [];
    const returns = [];
    
    extractedData.products.forEach((product, index) => {
      if (!product.name || !product.purchasePrice || product.quantity === undefined) {
        throw new Error(`Missing required product fields for product ${index + 1}`);
      }
      
      const quantity = parseInt(product.quantity);
      const purchasePrice = parseFloat(product.purchasePrice);
      
      if (isNaN(purchasePrice) || purchasePrice < 0) {
        throw new Error(`Invalid purchase price for product ${index + 1}: ${product.purchasePrice}`);
      }
      
      const productData = {
        name: product.name.trim(),
        description: product.description ? product.description.trim() : null,
        purchasePrice: purchasePrice,
        category: product.category ? product.category.trim() : null,
        sku: product.sku ? product.sku.trim() : null
      };
      
      if (isNaN(quantity)) {
        console.warn(`Invalid quantity for product ${index + 1}: ${product.quantity}, treating as regular product with quantity 1`);
        products.push({
          ...productData,
          quantity: 1
        });
      } else if (quantity < 0) {
        // Negative quantity = Return
        console.log(`Detected return for product ${index + 1}: ${product.name} (quantity: ${quantity})`);
        returns.push({
          ...productData,
          quantity: Math.abs(quantity), // Convert to positive for return
          reason: product.returnReason || 'INVOICE_RETURN'
        });
      } else if (quantity > 0) {
        // Positive quantity = Regular product
        products.push({
          ...productData,
          quantity: quantity
        });
      }
      // quantity = 0 is ignored
    });

    return {
      products,
      returns,
      hasReturns: returns.length > 0
    };

  } catch (error) {
    console.error('Error processing invoice image:', error);
    throw new Error(`Failed to process invoice: ${error.message}`);
  }
}

/**
 * Process invoice text (alternative method for text-based invoices)
 * @param {string} invoiceText - Text content of the invoice
 * @returns {Promise<Array>} Array of extracted products
 */
async function processInvoiceText(invoiceText) {
  try {
    const prompt = `
    Analyze this purchase invoice text and extract all product information. 
    Return the data in the following JSON format:
    {
      "products": [
        {
          "name": "Product Name",
          "description": "Product description if available",
          "purchasePrice": 100.00,
          "quantity": 5,
          "category": "Category if identifiable",
          "sku": "SKU if available"
        }
      ]
    }
    
    Instructions:
    - Extract all products from the invoice text
    - For product names in Urdu/Arabic script, convert them to Roman English (Latin script) using common transliteration
    - For example: "خریده کپڑای" should become "Kharide Kapray" or "Purchased Clothes"
    - For mixed language names, provide both original and Roman English versions
    - Convert prices to numbers (remove currency symbols like Rs., PKR, etc.)
    - Extract quantities as integers
    - If category is not clear, leave it null
    - If SKU is not available, leave it null
    - If description is not available, leave it null
    - Be as accurate as possible with the data extraction
    - Focus on clothing/textile related terms when translating from Urdu
    
    Invoice Text:
    ${invoiceText}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.1
    });

    const content = response.choices[0].message.content;
    
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in OpenAI response');
    }

    const extractedData = JSON.parse(jsonMatch[0]);
    
    // Validate the extracted data
    if (!extractedData.products || !Array.isArray(extractedData.products)) {
      throw new Error('Invalid product data format from OpenAI');
    }

    // Separate products and returns based on quantity
    const products = [];
    const returns = [];
    
    extractedData.products.forEach((product, index) => {
      if (!product.name || !product.purchasePrice || product.quantity === undefined) {
        throw new Error(`Missing required product fields for product ${index + 1}`);
      }
      
      const quantity = parseInt(product.quantity);
      const purchasePrice = parseFloat(product.purchasePrice);
      
      if (isNaN(purchasePrice) || purchasePrice < 0) {
        throw new Error(`Invalid purchase price for product ${index + 1}: ${product.purchasePrice}`);
      }
      
      const productData = {
        name: product.name.trim(),
        description: product.description ? product.description.trim() : null,
        purchasePrice: purchasePrice,
        category: product.category ? product.category.trim() : null,
        sku: product.sku ? product.sku.trim() : null
      };
      
      if (isNaN(quantity)) {
        console.warn(`Invalid quantity for product ${index + 1}: ${product.quantity}, treating as regular product with quantity 1`);
        products.push({
          ...productData,
          quantity: 1
        });
      } else if (quantity < 0) {
        // Negative quantity = Return
        console.log(`Detected return for product ${index + 1}: ${product.name} (quantity: ${quantity})`);
        returns.push({
          ...productData,
          quantity: Math.abs(quantity), // Convert to positive for return
          reason: product.returnReason || 'INVOICE_RETURN'
        });
      } else if (quantity > 0) {
        // Positive quantity = Regular product
        products.push({
          ...productData,
          quantity: quantity
        });
      }
      // quantity = 0 is ignored
    });

    return {
      products,
      returns,
      hasReturns: returns.length > 0
    };

  } catch (error) {
    console.error('Error processing invoice text:', error);
    throw new Error(`Failed to process invoice: ${error.message}`);
  }
}

module.exports = {
  processInvoiceImage,
  processInvoiceText
};
