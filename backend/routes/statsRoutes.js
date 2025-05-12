// backend/routes/statsRoutes.js
const express = require('express');
const statsController = require('../controllers/statsController'); // <-- Controller جديد

const router = express.Router();

// GET /api/stats/overall
router.get('/overall', statsController.getOverallStats); // <-- دالة Controller جديدة

console.log("DEBUG: statsRoutes defined: GET /overall");
module.exports = router;