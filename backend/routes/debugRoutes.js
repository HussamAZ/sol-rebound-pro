// backend/routes/debugRoutes.js
const express = require('express');
const debugController = require('../controllers/debugController');
const router = express.Router();

// تعريف مسار POST لتشغيل المهام
// نستخدم POST لأنه يقوم بتغيير حالة (تشغيل مهمة)
// نمرر اسم المهمة كمعلمة في المسار
router.post('/trigger-job/:jobName', debugController.triggerJob);

module.exports = router;