const express = require('express');
const router = express.Router();

// Import all accounting route modules
const accountsRouter = require('./accounts');
const transactionsRouter = require('./transactions');
const balancesRouter = require('./balances');
const expensesRouter = require('./expenses');
const paymentsRouter = require('./payments');
const returnsRouter = require('./returns');
const investorsRouter = require('./investors');
const profitRouter = require('./profit');
const withdrawalsRouter = require('./withdrawals');
const logisticsRouter = require('./logistics');
const suppliersRouter = require('./suppliers');

// Mount all routes
router.use('/accounts', accountsRouter);
router.use('/transactions', transactionsRouter);
router.use('/balances', balancesRouter);
router.use('/expenses', expensesRouter);
router.use('/payments', paymentsRouter);
router.use('/order-returns', returnsRouter);
router.use('/investors', investorsRouter);
router.use('/profit', profitRouter);
router.use('/withdrawals', withdrawalsRouter);
router.use('/logistics-companies', logisticsRouter);
router.use('/suppliers', suppliersRouter);

module.exports = router;

