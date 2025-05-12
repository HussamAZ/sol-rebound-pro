// backend/routes/index.js
const express = require('express');
const transactionRoutes = require('./transactionRoutes');
const referralRoutes = require('./referralRoutes');
const leaderboardRoutes = require('./leaderboardRoutes');
const statsRoutes = require('./statsRoutes');
const debugRoutes = require('./debugRoutes'); // تأكد من استيراده إذا كنت تستخدمه
const userRoutes = require('./userRoutes');   // *** إضافة مسار المستخدمين الجديد ***

// لا تحتاج لاستيراد مسارات metrics و swagger هنا إذا تم تركيبها مباشرة في server.js

const router = express.Router();

// تركيب المسارات الفرعية تحت /api
router.use('/transactions', transactionRoutes);
router.use('/referrals', referralRoutes);
router.use('/leaderboards', leaderboardRoutes);
router.use('/stats', statsRoutes);
router.use('/debug', debugRoutes);           // تأكد من تركيبه
router.use('/users', userRoutes);            // *** تركيب مسار المستخدمين الجديد ***
// يمكنك إضافة مسارات API أخرى هنا

console.log("DEBUG: leaderboardRoutes mounted under /leaderboards");
console.log("DEBUG: statsRoutes mounted under /stats"); // <-- سجل جديد
console.log("DEBUG: userRoutes mounted under /users");

module.exports = router;