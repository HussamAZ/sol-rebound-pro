// backend/models/PlatformEarning.js
const mongoose = require('mongoose');

const platformEarningSchema = new mongoose.Schema({
  amount: { // صافي رسوم المنصة بالـ lamports
    type: Number,
    required: true,
    min: 0
  },
  closedCount: { // <-- **الحقل الجديد والمهم**
    type: Number,
    required: false,
    default: 0  // يجب أن يكون هناك حساب واحد على الأقل تم إغلاقه
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
});

module.exports = mongoose.model('PlatformEarning', platformEarningSchema);
