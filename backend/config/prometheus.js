// backend/config/prometheus.js
const promClient = require('prom-client');

// تفعيل جمع المقاييس الافتراضية (CPU, Memory, etc.)
promClient.collectDefaultMetrics();

// تعريف Histogram لتتبع مدة استجابة الطلبات
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_ms', // الاسم كما هو في server.js الأصلي
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'code'],
  // Buckets مناسبة لزمن الاستجابة بالمللي ثانية
  buckets: [50, 100, 200, 300, 400, 500, 1000, 2000, 5000]
});

// تصدير الـ client والمقاييس المعرفة
module.exports = {
  promClient,
  httpRequestDurationMicroseconds
};