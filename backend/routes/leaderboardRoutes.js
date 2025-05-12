// backend/routes/leaderboardRoutes.js
const express = require('express');
const leaderboardController = require('../controllers/leaderboardController'); // استيراد وحدة التحكم

const router = express.Router(); // إنشاء Router جديد

// تعريف المسار GET لجلب أفضل المحيلين
// المسار الفعلي سيكون /api/leaderboards/top-referrers
router.get(
    '/top-referrers', // المسار الفرعي
    leaderboardController.getTopReferrers // دالة المعالج من وحدة التحكم
);

// تعريف المسار GET لجلب أفضل المغلقين
// المسار الفعلي سيكون /api/leaderboards/top-closers
router.get(
    '/top-closers', // المسار الفرعي
    leaderboardController.getTopClosers // دالة المعالج من وحدة التحكم
);

// رسالة تسجيل للتأكد من تحميل المسارات عند بدء التشغيل
console.log("DEBUG: leaderboardRoutes defined: GET /top-referrers, GET /top-closers");

module.exports = router; // تصدير الـ Router