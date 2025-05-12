// backend/middleware/prometheusMiddleware.js
const { httpRequestDurationMicroseconds } = require('../config/prometheus');

const prometheusMiddleware = (req, res, next) => {
  // تخطي لتتبع المسار /metrics نفسه
  if (req.path === '/metrics') {
    return next();
  }

  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    // سجل المدة بعد انتهاء الاستجابة
    // استخدم req.originalUrl أو req.route?.path للحصول على المسار المطابق
    const route = req.route?.path || req.originalUrl.split('?')[0]; // طريقة للحصول على المسار
    end({ route: route, code: res.statusCode, method: req.method });
  });
  next();
};

module.exports = prometheusMiddleware;