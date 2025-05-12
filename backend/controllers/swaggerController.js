// backend/controllers/swaggerController.js
const swaggerUi = require('swagger-ui-express');
// TODO: يجب تحديث هذا الملف ليعكس الـ API الحقيقي
const swaggerDocument = require('../swagger.json'); // تأكد من المسار الصحيح

// تصدير middleware مباشرة
exports.serveSwagger = swaggerUi.serve;
exports.setupSwagger = swaggerUi.setup(swaggerDocument);