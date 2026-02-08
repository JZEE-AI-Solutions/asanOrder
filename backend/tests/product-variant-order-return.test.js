/**
 * Product variant impact tests: order creation with variant lines, confirmation (inventory decrease),
 * partial return by variant line, and return approval (inventory increase).
 * Verifies the variant-aware order/return/inventory flow end-to-end.
 */
const { describe, test, expect, beforeAll, afterAll } = require('@jest/globals');
const request = require('supertest');
const prisma = require('../lib/db');
const {
  createTestTenant,
  setTestAuth,
  cleanupTestData,
  createTestAppWithOrderAndReturns
} = require('./helpers/testHelpers');

const app = createTestAppWithOrderAndReturns();

let testUser;
let testTenant;
let testForm;
let testProduct;
let variantRedS;
let variantBlueM;

describe('Product variant order and return flow', () => {
  beforeAll(async () => {
    const { user, tenant } = await createTestTenant();
    testUser = user;
    testTenant = tenant;
    setTestAuth(user, tenant);

    testForm = await prisma.form.create({
      data: {
        name: 'Variant Test Form',
        description: 'Form for variant order tests',
        formCategory: 'SHOPPING_CART',
        tenantId: tenant.id,
        formLink: `variant-form-${Date.now()}`,
        isPublished: true
      }
    });
    await prisma.formField.createMany({
      data: [
        { formId: testForm.id, label: 'City', fieldType: 'TEXT', isRequired: false, order: 0 }
      ]
    });

    testProduct = await prisma.product.create({
      data: {
        name: 'Variant Test Product',
        tenantId: tenant.id,
        isActive: true,
        hasVariants: true,
        currentRetailPrice: 100,
        currentQuantity: 0
      }
    });
    variantRedS = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        color: 'Red',
        size: 'S',
        currentQuantity: 10,
        isActive: true
      }
    });
    variantBlueM = await prisma.productVariant.create({
      data: {
        productId: testProduct.id,
        color: 'Blue',
        size: 'M',
        currentQuantity: 10,
        isActive: true
      }
    });
  });

  afterAll(async () => {
    if (testTenant) {
      await cleanupTestData(testTenant.id);
    }
  });

  test('1. Order submit with two variant lines creates correct OrderItems', async () => {
    const productId = testProduct.id;
    const v1 = variantRedS.id;
    const v2 = variantBlueM.id;
    const composite1 = `${productId}_${v1}`;
    const composite2 = `${productId}_${v2}`;

    const selectedProducts = [
      { id: productId, variantId: v1, productVariantId: v1, name: testProduct.name, color: 'Red', size: 'S', quantity: 2, price: 100 },
      { id: productId, variantId: v2, productVariantId: v2, name: testProduct.name, color: 'Blue', size: 'M', quantity: 1, price: 150 }
    ];
    const productQuantities = { [composite1]: 2, [composite2]: 1 };
    const productPrices = { [composite1]: 100, [composite2]: 150 };
    const formData = { City: 'TestCity' };

    const res = await request(app)
      .post('/api/order/submit')
      .send({
        formLink: testForm.formLink,
        formData,
        selectedProducts: JSON.stringify(selectedProducts),
        productQuantities: JSON.stringify(productQuantities),
        productPrices: JSON.stringify(productPrices)
      });

    expect(res.status).toBe(201);
    expect(res.body.order).toBeDefined();
    expect(res.body.order.id).toBeDefined();

    const orderId = res.body.order.id;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: { productVariant: true }
        }
      }
    });
    expect(order).toBeDefined();
    expect(order.orderItems).toHaveLength(2);

    const byVariant = (a, b) => (a.productVariantId || '').localeCompare(b.productVariantId || '');
    const sorted = [...order.orderItems].sort(byVariant);
    expect(sorted[0].productId).toBe(productId);
    expect(sorted[0].productVariantId).toBe(v1);
    expect(sorted[0].quantity).toBe(2);
    expect(sorted[0].price).toBe(100);
    expect(sorted[1].productId).toBe(productId);
    expect(sorted[1].productVariantId).toBe(v2);
    expect(sorted[1].quantity).toBe(1);
    expect(sorted[1].price).toBe(150);
  });

  test('2. Order confirmation decreases variant stock correctly', async () => {
    const productId = testProduct.id;
    const v1 = variantRedS.id;
    const v2 = variantBlueM.id;
    const composite1 = `${productId}_${v1}`;
    const composite2 = `${productId}_${v2}`;

    const selectedProducts = [
      { id: productId, variantId: v1, productVariantId: v1, name: testProduct.name, color: 'Red', size: 'S', quantity: 2, price: 100 },
      { id: productId, variantId: v2, productVariantId: v2, name: testProduct.name, color: 'Blue', size: 'M', quantity: 1, price: 150 }
    ];
    const productQuantities = { [composite1]: 2, [composite2]: 1 };
    const productPrices = { [composite1]: 100, [composite2]: 150 };
    const formData = { City: 'TestCity' };

    const submitRes = await request(app)
      .post('/api/order/submit')
      .send({
        formLink: testForm.formLink,
        formData,
        selectedProducts: JSON.stringify(selectedProducts),
        productQuantities: JSON.stringify(productQuantities),
        productPrices: JSON.stringify(productPrices)
      });
    expect(submitRes.status).toBe(201);
    const orderId = submitRes.body.order.id;

    const confirmRes = await request(app)
      .post(`/api/order/${orderId}/confirm`)
      .send({});
    expect(confirmRes.status).toBe(200);

    const redS = await prisma.productVariant.findUnique({ where: { id: variantRedS.id } });
    const blueM = await prisma.productVariant.findUnique({ where: { id: variantBlueM.id } });
    expect(redS.currentQuantity).toBe(8);   // 10 - 2
    expect(blueM.currentQuantity).toBe(9);  // 10 - 1
  });

  test('3. Partial return selects one variant line and creates ReturnItem with productVariantId', async () => {
    const productId = testProduct.id;
    const v1 = variantRedS.id;
    const v2 = variantBlueM.id;
    const composite1 = `${productId}_${v1}`;
    const composite2 = `${productId}_${v2}`;

    const selectedProducts = [
      { id: productId, variantId: v1, productVariantId: v1, name: testProduct.name, quantity: 2, price: 100 },
      { id: productId, variantId: v2, productVariantId: v2, name: testProduct.name, quantity: 1, price: 150 }
    ];
    const productQuantities = { [composite1]: 2, [composite2]: 1 };
    const productPrices = { [composite1]: 100, [composite2]: 150 };
    const formData = { City: 'TestCity' };

    const submitRes = await request(app)
      .post('/api/order/submit')
      .send({
        formLink: testForm.formLink,
        formData,
        selectedProducts: JSON.stringify(selectedProducts),
        productQuantities: JSON.stringify(productQuantities),
        productPrices: JSON.stringify(productPrices)
      });
    expect(submitRes.status).toBe(201);
    const orderId = submitRes.body.order.id;

    await request(app)
      .post(`/api/order/${orderId}/confirm`)
      .send({});
    const blueMAfterConfirm = await prisma.productVariant.findUnique({ where: { id: variantBlueM.id } });
    expect(blueMAfterConfirm.currentQuantity).toBe(8); // 10 - 1 (test 2) - 1 (this order)

    const createReturnRes = await request(app)
      .post('/api/accounting/order-returns')
      .send({
        orderId,
        returnType: 'CUSTOMER_PARTIAL',
        reason: 'Partial return test',
        returnDate: new Date().toISOString(),
        shippingChargeHandling: 'CUSTOMER_PAYS',
        selectedProducts: [
          { id: productId, variantId: v2, productVariantId: v2, quantity: 1, price: 150, name: testProduct.name }
        ]
      });
    expect(createReturnRes.status).toBe(201);
    expect(createReturnRes.body.data).toBeDefined();
    const returnId = createReturnRes.body.data.id;
    const returnRecord = await prisma.return.findUnique({
      where: { id: returnId },
      include: { returnItems: true }
    });
    expect(returnRecord.returnItems).toHaveLength(1);
    expect(returnRecord.returnItems[0].productVariantId).toBe(v2);
    expect(returnRecord.returnItems[0].quantity).toBe(1);
  });

  test('4. Customer return approval increases variant-level inventory', async () => {
    const productId = testProduct.id;
    const v1 = variantRedS.id;
    const v2 = variantBlueM.id;
    const composite1 = `${productId}_${v1}`;
    const composite2 = `${productId}_${v2}`;

    const selectedProducts = [
      { id: productId, variantId: v1, productVariantId: v1, name: testProduct.name, quantity: 2, price: 100 },
      { id: productId, variantId: v2, productVariantId: v2, name: testProduct.name, quantity: 1, price: 150 }
    ];
    const productQuantities = { [composite1]: 2, [composite2]: 1 };
    const productPrices = { [composite1]: 100, [composite2]: 150 };
    const formData = { City: 'TestCity' };

    const submitRes = await request(app)
      .post('/api/order/submit')
      .send({
        formLink: testForm.formLink,
        formData,
        selectedProducts: JSON.stringify(selectedProducts),
        productQuantities: JSON.stringify(productQuantities),
        productPrices: JSON.stringify(productPrices)
      });
    expect(submitRes.status).toBe(201);
    const orderId = submitRes.body.order.id;

    await request(app)
      .post(`/api/order/${orderId}/confirm`)
      .send({});

    const createReturnRes = await request(app)
      .post('/api/accounting/order-returns')
      .send({
        orderId,
        returnType: 'CUSTOMER_PARTIAL',
        reason: 'Approval test',
        returnDate: new Date().toISOString(),
        shippingChargeHandling: 'CUSTOMER_PAYS',
        selectedProducts: [
          { id: productId, variantId: v2, productVariantId: v2, quantity: 1, price: 150, name: testProduct.name }
        ]
      });
    expect(createReturnRes.status).toBe(201);
    const returnId = createReturnRes.body.data.id;

    const blueMBeforeApprove = await prisma.productVariant.findUnique({ where: { id: variantBlueM.id } });
    expect(blueMBeforeApprove.currentQuantity).toBe(7); // 10 - 1 (test2) - 1 (test3) - 1 (this order)

    const approveRes = await request(app)
      .put(`/api/accounting/order-returns/${returnId}/approve`)
      .send({});
    expect(approveRes.status).toBe(200);

    const blueMAfterApprove = await prisma.productVariant.findUnique({ where: { id: variantBlueM.id } });
    expect(blueMAfterApprove.currentQuantity).toBe(8); // +1 from approved return
  });
});
