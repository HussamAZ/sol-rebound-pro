// backend/models/LaunchContestParticipant.js
const mongoose = require('mongoose');

const launchContestParticipantSchema = new mongoose.Schema({
    userPublicKey: {
        type: String,
        required: true,
        unique: true, // لضمان أن كل مستخدم يُسجل مرة واحدة فقط كـ "مؤسس"
        index: true,
        trim: true, // لإزالة أي مسافات بيضاء غير مقصودة
    },
    firstCloseTransactionSignature: { // توقيع أول معاملة إغلاق ناجحة له
        type: String,
        required: true,
        unique: true, // توقيع المعاملة يجب أن يكون فريدًا أيضًا
        trim: true,
    },
    confirmedAt: { // وقت تأكيد المعاملة التي جعلته مؤهلاً
        type: Date,
        required: true,
        default: Date.now,
    },
    order: { // ترتيبه ضمن الفائزين (1 إلى 105 مثلاً)
        type: Number,
        required: true,
        index: true,
        min: 1, // يجب أن يكون الترتيب إيجابيًا
    },
    // (اختياري) يمكنك إضافة حقول لاحقًا إذا احتجت لتتبع حالة النموذج
    // formSubmittedOn: Date,
    // isVerifiedWinner: { type: Boolean, default: false },
}, {
    timestamps: true, // يضيف createdAt و updatedAt تلقائيًا
    versionKey: false, // لتعطيل حقل __v الخاص بـ Mongoose إذا لم تكن بحاجة إليه
});

// إضافة فهرس مركب إذا كنت تتوقع استعلامات بناءً على الترتيب والوقت
// launchContestParticipantSchema.index({ order: 1, confirmedAt: 1 });

module.exports = mongoose.model('LaunchContestParticipant', launchContestParticipantSchema);
