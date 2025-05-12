// backend/routes/swaggerRoutes.js
const express = require('express');
const swaggerController = require('../controllers/swaggerController');

const router = express.Router();

// GET /api-docs
// swaggerUi.serve و swaggerUi.setup هما middleware
router.use('/', swaggerController.serveSwagger, swaggerController.setupSwagger);

module.exports = router;