// backend/routes/referralRoutes.js
const express = require('express');
const referralController = require('../controllers/referralController');

const router = express.Router();

// GET /api/referrals/info?user=<publicKey>
router.get('/info', referralController.getReferralInfo);

// **المسار الجديد للشركاء**
// GET /api/referrals/partner-stats?ref_code=<CODE>
router.get('/partner-stats', referralController.getPartnerStats); // <-- **السطر الجديد**

module.exports = router;
