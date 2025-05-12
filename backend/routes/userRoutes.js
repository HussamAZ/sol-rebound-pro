// backend/routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController'); // سيتم إنشاؤه تاليًا
const router = express.Router();

// POST /api/users/initialize
router.post('/initialize', userController.initializeUser);

module.exports = router;