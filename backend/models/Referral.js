// backend/models/Referral.js
const mongoose = require('mongoose');
const crypto = require('crypto');

// دالة لتشفير البيانات باستخدام AES-256-GCM
function encryptData(data) {
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
        console.error("CRITICAL: ENCRYPTION_KEY is missing or invalid. Cannot encrypt data.");
        return data;
    }
    // تحقق لمنع التشفير المزدوج
    if (typeof data === 'string' && data.includes(':') && data.split(':').length === 3) {
        console.warn("Attempting to double-encrypt data. Returning value as is:", data);
        return data;
    }
    try {
        const algorithm = 'aes-256-gcm';
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let encrypted = cipher.update(String(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
        console.error("Encryption failed:", error);
        return String(data);
    }
}

/**
 * (النسخة النهائية)
 * دالة Getter لفك تشفير حقل المحيل.
 * تتحقق مما إذا كانت البيانات مشفرة قبل محاولة فك التشفير.
 * @param {string} encryptedDataWithMeta - البيانات التي قد تكون مشفرة.
 * @returns {string} - البيانات مفكوكة التشفير، أو البيانات الأصلية إذا لم تكن مشفرة أو حدث خطأ.
 */
function decryptData(encryptedDataWithMeta) {
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

    // الشرط الأساسي: إذا لم يكن هناك مفتاح، أو البيانات ليست نصًا، أو لا تحتوي على تنسيق التشفير، أرجعها كما هي.
    if (!ENCRYPTION_KEY || typeof encryptedDataWithMeta !== 'string' || !encryptedDataWithMeta.includes(':')) {
        return encryptedDataWithMeta;
    }

    try {
        const parts = encryptedDataWithMeta.split(':');
        // تحقق إضافي من صحة التنسيق
        if (parts.length !== 3) {
            return encryptedDataWithMeta;
        }

        const [ivHex, authTagHex, encryptedHex] = parts;
        
        // التحقق من أن الأجزاء هي سلاسل سداسية صالحة
        if (!/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(authTagHex) || !/^[0-9a-fA-F]+$/.test(encryptedHex)) {
             return encryptedDataWithMeta;
        }

        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const algorithm = 'aes-256-gcm';
        const decipher = crypto.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        // في حالة الإنتاج، من الأفضل تسجيل الخطأ فقط وعدم إغراق السجلات
        console.error("DECRYPTION_ERROR: Failed to decrypt data. Returning encrypted value. Error:", error.message);
        return encryptedDataWithMeta; // أرجع القيمة المشفرة عند الفشل
    }
}

const referralSchema = new mongoose.Schema({
    user: { type: String, required: true, unique: true, index: true },

    referralCode: { // <-- **الحقل الجديد**
        type: String,
        unique: true,   // <-- يضمن عدم وجود رمزين متطابقين
        sparse: true,   // <-- مهم: يسمح بوجود قيم null متعددة (للمستخدمين القدامى الذين ليس لديهم رمز بعد)
        index: true
    },

    referrer: {
        type: String,
        index: true,
        set: (value) => (value === null || typeof value === 'undefined') ? null : encryptData(value),
        get: (encryptedValue) => (encryptedValue === null || typeof encryptedValue === 'undefined') ? null : decryptData(encryptedValue),
        default: null
    },
    totalEarnings: { type: Number, default: 0, min: 0 },
    referralsCount: { type: Number, default: 0, min: 0, index: true },
    closedAccounts: { type: Number, default: 0, min: 0, index: true },
    weeklyEarnings: { type: Number, default: 0, min: 0, index: true },
    weeklyClosedAccounts: { type: Number, default: 0, min: 0, index: true },
    weeklyReferralsCount: { type: Number, default: 0, min: 0 }
}, {
    timestamps: true,       // لإدارة createdAt و updatedAt
    toJSON: { getters: true }, // لتفعيل getters عند التحويل إلى JSON
    toObject: { getters: true } // لتفعيل getters عند التحويل إلى كائن JavaScript
});

module.exports = mongoose.model('Referral', referralSchema);

