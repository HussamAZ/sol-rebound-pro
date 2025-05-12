// backend/services/vaultService.js
const vaultClient = require('../config/vault');

// يمكنك إضافة وظائف هنا لتغليف عمليات Vault المعقدة إذا لزم الأمر لاحقًا.
// مثال: قراءة سر معين، كتابة سر، تجديد التوكن، إلخ.

// حاليًا، يمكن للخدمات الأخرى استيراد vaultClient مباشرة من config/vault.js
// إذا بقيت العمليات بسيطة.

// تصدير العميل إذا احتجت إليه
module.exports = {
    vaultClient
};