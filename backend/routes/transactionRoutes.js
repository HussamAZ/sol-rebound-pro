// backend/routes/transactionRoutes.js
const express = require('express');
const transactionController = require('../controllers/transactionController');

const router = express.Router();

// POST /api/transactions/prepare-close
router.post('/prepare-close', transactionController.prepareCloseTx);

// POST /api/transactions/confirm-close
router.post('/confirm-close', transactionController.confirmCloseTx);

module.exports = router;