// backend/routes/debugRoutes.js
const express = require('express');
const debugController = require('../controllers/debugController');
const router = express.Router();

// مفتاح API بسيط للحماية (يجب أن يكون معقدًا في الإنتاج الفعلي ومخزنًا كمتغير بيئة)
// !! هام: استبدل "YOUR_VERY_SECRET_DEBUG_API_KEY" بمفتاح سري قوي وخزنه في .env !!
const DEBUG_API_KEY = process.env.INTERNAL_DEBUG_API_KEY;

const protectDebugRoute = (req, res, next) => {
    const apiKey = req.headers['x-debug-api-key'] || req.body.debugApiKey; // تحقق من الهيدر أو الجسم
    if (DEBUG_API_KEY && apiKey && apiKey === DEBUG_API_KEY) {
        next();
    } else {
        console.warn("Debug Route: Unauthorized access attempt.");
        res.status(403).json({ success: false, error: 'Forbidden: Invalid or missing debug API key.' });
    }
};

// مسار لتشغيل المهام المجدولة العادية
router.post('/trigger-job/:jobName', protectDebugRoute, debugController.triggerJob);

// !! مسار جديد لتشغيل توزيع جوائز مسابقة الإطلاق !!
router.post('/trigger-launch-contest-payout', protectDebugRoute, debugController.triggerLaunchContestPayout);

module.exports = router;

