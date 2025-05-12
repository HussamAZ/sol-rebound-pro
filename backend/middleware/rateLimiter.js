// backend/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

// تحديد الحد الأقصى بناءً على البيئة (أعلى للاختبار، قياسي للإنتاج)
// ملاحظة: على الرغم من أننا نعطله في server.js للاختبار، هذا الكود مرن
// في حال قررنا تفعيله بحد أعلى للاختبار لاحقًا.
const limit = process.env.NODE_ENV === 'test' ? 1000 : 5; // 5 طلبات/ثانية للإنتاج
const message = process.env.NODE_ENV === 'test'
  ? { success: false, error: 'Rate limit exceeded (Test Env)' }
  : { success: false, error: 'Too many requests, please try again after a second.' };

// إنشاء وتكوين middleware تحديد معدل الطلبات
const apiLimiter = rateLimit({
    windowMs: 1 * 1000, // نافذة زمنية: 1 ثانية
    limit: limit,       // الحد الأقصى للطلبات في النافذة الزمنية (يستخدم القيمة المحسوبة أعلاه)
    standardHeaders: 'draft-7', // استخدام الهيدرات القياسية لـ RateLimit (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset)
    legacyHeaders: false, // تعطيل الهيدرات القديمة (X-RateLimit-*)
    message: message,     // رسالة الخطأ المخصصة عند تجاوز الحد (تستخدم القيمة المحسوبة أعلاه)

    // تخطي طلبات OPTIONS (تُستخدم أحيانًا بواسطة المتصفحات كـ preflight لـ CORS)
    skip: (req, res) => req.method === 'OPTIONS',

    // (اختياري) keyGenerator: لتحديد كيفية تعريف "العميل" الفريد.
    // الافتراضي هو req.ip، وهو مناسب في معظم الحالات.
    // قد تحتاج لتعديله إذا كنت خلف بروكسي عكسي وتعتمد على هيدر مثل 'X-Forwarded-For'.
    // keyGenerator: (req, res) => {
    //   return req.ip; // أو req.headers['x-forwarded-for'] || req.socket.remoteAddress
    // },

    // (اختياري) handler: دالة مخصصة لتشغيلها عند تجاوز الحد، قبل إرسال الاستجابة.
    // handler: (req, res, next, options) => {
	//   console.warn(`Rate limit exceeded for IP: ${req.ip} on path: ${req.path}`);
	//   res.status(options.statusCode).send(options.message);
    // },
});

// تصدير الـ middleware المعد للاستخدام في server.js
module.exports = apiLimiter;