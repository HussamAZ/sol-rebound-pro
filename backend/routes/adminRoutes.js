// backend/routes/adminRoutes.js
const express = require('express');
const adminController = require('../controllers/adminController');
const router = express.Router();

// مفتاح API بسيط للحماية (يجب أن يكون معقدًا في الإنتاج الفعلي ومخزنًا كمتغير بيئة)
// !! هام: استبدل "YOUR_VERY_SECRET_ADMIN_API_KEY" بمفتاح سري قوي وخزنه في .env !!
const ADMIN_API_KEY = process.env.INTERNAL_ADMIN_API_KEY;

const protectAdminRoute = (req, res, next) => {
    const apiKey = req.headers['x-admin-api-key'];
    if (DEBUG_API_KEY && apiKey && apiKey === DEBUG_API_KEY) {
        next();
    } else {
        console.warn("Admin Route: Unauthorized access attempt.");
        res.status(403).json({ success: false, error: 'Forbidden: Invalid or missing admin API key.' });
    }
};

// POST /api/admin/record-launch-time
router.post(
    '/record-launch-time',
   // protectAdminRoute, // حماية المسار
    adminController.recordActualLaunchTime
);

module.exports = router;
