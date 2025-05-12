// backend/routes/referralRoutes.js
const express = require('express');
const referralController = require('../controllers/referralController');

const router = express.Router();

// GET /api/referrals/info?user=<publicKey>
router.get('/info', referralController.getReferralInfo);

// POST /api/referrals/withdraw
router.post('/withdraw', referralController.withdrawReferrals);

module.exports = router;