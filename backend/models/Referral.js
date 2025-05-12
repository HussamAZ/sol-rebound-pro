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

// دالة لفك تشفير البيانات
function decryptData(encryptedDataWithMeta) {
    console.log(`DECRYPT_DEBUG: decryptData called with: [${encryptedDataWithMeta}] (Type: ${typeof encryptedDataWithMeta})`);
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
        console.warn("DECRYPT_DEBUG: Decryption skipped: Key missing or invalid.");
        return encryptedDataWithMeta;
    }
    if (!encryptedDataWithMeta || typeof encryptedDataWithMeta !== 'string' || !encryptedDataWithMeta.includes(':')) {
        console.warn("DECRYPT_DEBUG: Decryption skipped: Data format incorrect (not string or no ':'). Value:", encryptedDataWithMeta);
        return encryptedDataWithMeta;
    }

    try {
        const parts = encryptedDataWithMeta.split(':');
        if (parts.length !== 3) {
            console.warn("DECRYPT_DEBUG: Decryption skipped: Invalid format (not 3 parts). Value:", encryptedDataWithMeta);
            return encryptedDataWithMeta;
        }
        const [ivHex, authTagHex, encryptedHex] = parts;
        if (!/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(authTagHex) || !/^[0-9a-fA-F]+$/.test(encryptedHex)) {
             console.warn("DECRYPT_DEBUG: Decryption skipped: Invalid hex part. Value:", encryptedDataWithMeta);
             return encryptedDataWithMeta;
        }

        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const algorithm = 'aes-256-gcm';
        const decipher = crypto.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        console.log(`DECRYPT_DEBUG: Decryption successful. Original: [${encryptedDataWithMeta}], Decrypted: [${decrypted}]`);
        return decrypted;
    } catch (error) {
        console.error("DECRYPT_DEBUG: Decryption failed for data:", encryptedDataWithMeta, "Error:", error.message);
        return encryptedDataWithMeta; // أرجع القيمة المشفرة عند الفشل
    }
}

const referralSchema = new mongoose.Schema({
    user: { type: String, required: true, unique: true, index: true },
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