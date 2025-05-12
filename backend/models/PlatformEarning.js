// backend/models/PlatformEarning.js
const mongoose = require('mongoose');

const platformEarningSchema = new mongoose.Schema({
  amount: { // صافي رسوم المنصة المحولة للخزينة (Lamports)
    type: Number,
    required: true,
    min: 0
  },
  timestamp: { // وقت تأكيد المعاملة أو وقت تسجيلها
    type: Date,
    required: true,
    default: Date.now,
    index: true // فهرسة للبحث السريع حسب التاريخ
  },
  transactionSignature: { // توقيع معاملة close_multiple_atas
    type: String,
    required: true,
    unique: true, // لمنع تسجيل نفس المعاملة مرتين
    index: true
  },
  userPublicKey: { // المستخدم الذي قام بعملية الإغلاق
    type: String,
    required: true,
    index: true
  },
  // يمكنك إضافة حقول أخرى مثل referrerPublicKey إذا أردت
});

module.exports = mongoose.model('PlatformEarning', platformEarningSchema);