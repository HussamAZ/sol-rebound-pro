// backend/routes/metricsRoutes.js
const express = require('express');
const metricsController = require('../controllers/metricsController');

const router = express.Router();

// GET /metrics
router.get('/', metricsController.getMetrics);

module.exports = router;