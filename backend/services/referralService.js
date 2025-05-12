// backend/services/referralService.js
const Referral = require('../models/Referral');
const { MIN_REFERRAL_WITHDRAW_SOL, LAMPORTS_PER_SOL, REFERRAL_COMMISSION_PERCENT_CONTRACT,
    PLATFORM_FEE_PERCENT_CONTRACT } = require('../config/constants');
const { PublicKey } = require('@solana/web3.js');
const crypto = require('crypto'); // استيراد crypto هنا

// --- دالة فك التشفير المحلية ---
function decryptDataLocal(encryptedDataWithMeta) {
    console.log(`DECRYPT_LOCAL_DEBUG: decryptDataLocal called with: [${encryptedDataWithMeta}] (Type: ${typeof encryptedDataWithMeta})`);
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
        console.warn("DECRYPT_LOCAL_DEBUG: Decryption skipped: Key missing or invalid. Returning as is.");
        return encryptedDataWithMeta;
    }
    if (!encryptedDataWithMeta || typeof encryptedDataWithMeta !== 'string' || !encryptedDataWithMeta.includes(':')) {
        console.warn("DECRYPT_LOCAL_DEBUG: Decryption skipped: Data format incorrect (not string or no ':'). Value:", encryptedDataWithMeta);
        return encryptedDataWithMeta;
    }

    try {
        const parts = encryptedDataWithMeta.split(':');
        if (parts.length !== 3) {
            console.warn("DECRYPT_LOCAL_DEBUG: Decryption skipped: Invalid encrypted data format (not 3 parts). Value:", encryptedDataWithMeta);
            return encryptedDataWithMeta;
        }
        const [ivHex, authTagHex, encryptedHex] = parts;
        // التحقق من أن الأجزاء هي سلاسل سداسية صالحة (اختياري لكن جيد)
        if (!/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(authTagHex) || !/^[0-9a-fA-F]+$/.test(encryptedHex)) {
            console.warn("DECRYPT_LOCAL_DEBUG: Decryption skipped: One of the hex parts is invalid. Value:", encryptedDataWithMeta);
            return encryptedDataWithMeta;
        }

        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const algorithm = 'aes-256-gcm';
        const decipher = crypto.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        console.log(`DECRYPT_LOCAL_DEBUG: Decryption successful. Original: [${encryptedDataWithMeta}], Decrypted: [${decrypted}]`);
        return decrypted;
    } catch (error) {
        console.error("DECRYPT_LOCAL_DEBUG: Decryption failed for data:", encryptedDataWithMeta, "Error:", error.message);
        // في حالة فشل فك التشفير، من الأفضل إرجاع القيمة الأصلية بدلاً من رمي خطأ قد يوقف العملية
        return encryptedDataWithMeta;
    }
}


/**
 * يبحث عن سجل المستخدم أو ينشئه. إذا كان المستخدم جديدًا، يتم تعيين المحيل (إن وجد).
 * لا يقوم بتحديث أي عدادات أخرى.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم.
 * @param {string|null} potentialReferrerKeyString - المفتاح العام للمحيل المحتمل (من URL مثلاً).
 * @returns {Promise<{record: object, wasCreated: boolean}>} - كائن يحتوي على سجل المستخدم (مع المحيل مفكوكًا) وعلامة تشير إلى ما إذا كان قد تم إنشاؤه.
 */
async function findOrCreateUserOnly(userPublicKeyString, potentialReferrerKeyString) {
    console.log(`ReferralService (findOrCreateUserOnly): User=${userPublicKeyString}, PotentialReferrer=${potentialReferrerKeyString || 'None'}`);
    let userRecordRaw = await Referral.findOne({ user: userPublicKeyString }).lean(); // جلب الكائن الخام

    let wasCreated = false;
    let finalUserRecord;

    if (!userRecordRaw) {
        let referrerToSet = null;
        if (potentialReferrerKeyString) {
            try {
                const referrerKeyObj = new PublicKey(potentialReferrerKeyString);
                const userKeyObj = new PublicKey(userPublicKeyString);
                if (!referrerKeyObj.equals(userKeyObj)) {
                    referrerToSet = potentialReferrerKeyString;
                } else {
                     console.warn(`ReferralService (findOrCreateUserOnly): Attempted to set referrer to the user themselves (${userPublicKeyString}). Setting referrer to null.`);
                }
            } catch (e) {
                console.error(`ReferralService (findOrCreateUserOnly): Invalid potentialReferrerKeyString format (${potentialReferrerKeyString}). Setting referrer to null. Error: ${e.message}`);
            }
        }
        console.log(`ReferralService (findOrCreateUserOnly): User ${userPublicKeyString} not found. Creating with referrer for DB: ${referrerToSet || 'None'} (will be encrypted by model setter)`);
        const createdUser = await Referral.create({
            user: userPublicKeyString,
            referrer: referrerToSet, // الموديل سيقوم بتشفيره عند الحفظ
        });
        finalUserRecord = createdUser.toObject(); // تحويله لكائن عادي بعد الإنشاء
        wasCreated = true;
    } else {
        finalUserRecord = userRecordRaw; // استخدم الكائن الخام من .lean()
    }

    // فك تشفير المحيل يدويًا هنا بعد جلبه أو إنشائه
    if (finalUserRecord.referrer) {
        finalUserRecord.referrer = decryptDataLocal(finalUserRecord.referrer);
    }
    console.log(`ReferralService (findOrCreateUserOnly): Returning. User: ${userPublicKeyString}, Referrer in finalUserRecord (after manual decrypt): ${finalUserRecord.referrer || 'None'}, WasCreated: ${wasCreated}`);
    return { record: finalUserRecord, wasCreated };
}

/**
 * يبحث عن سجل المستخدم أو ينشئه، ويقوم بتحديث عدادات الإغلاق.
 * يحدد ما إذا كانت هذه هي أول عملية إغلاق لمستخدم جديد تمت إحالته.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم.
 * @param {number} numberOfClosedAccounts - عدد الحسابات التي تم إغلاقها في هذه المعاملة.
 * @param {string|null} referrerFromUrlIfAny - المفتاح العام للمحيل من URL (يُستخدم فقط إذا كان المستخدم جديدًا).
 * @returns {Promise<{userRecord: object, wasNewUserWithReferrer: boolean}>} - كائن يحتوي على سجل المستخدم المحدث (مع المحيل مفكوكًا) وعلامة تشير إلى تسجيل إحالة جديدة.
 */
async function findOrCreateUserAndUpdateCounts(userPublicKeyString, numberOfClosedAccounts, referrerFromUrlIfAny) {
    console.log(`ReferralService (findOrCreateUserAndUpdateCounts): User=${userPublicKeyString}, Closed=${numberOfClosedAccounts}, ReferrerFromUrl=${referrerFromUrlIfAny || 'None'}`);

    const { record: initialUserRecord, wasCreated: wasJustCreatedNow } = await findOrCreateUserOnly(userPublicKeyString, referrerFromUrlIfAny);
    // initialUserRecord.referrer هنا سيكون مفكوك التشفير بسبب التعديل في findOrCreateUserOnly

    let wasNewUserWithReferrer = false;
    if (wasJustCreatedNow && initialUserRecord.referrer) {
        wasNewUserWithReferrer = true;
        console.log(`ReferralService (findOrCreateUserAndUpdateCounts): User ${userPublicKeyString} was newly created AND has an initial referrer ${initialUserRecord.referrer}. Setting wasNewUserWithReferrer=true.`);
    }

    console.log(`ReferralService (findOrCreateUserAndUpdateCounts): Updating closed accounts counts for user ${userPublicKeyString}.`);
    let updatedUserRecordRaw = await Referral.findOneAndUpdate(
        { user: userPublicKeyString },
        { $inc: { closedAccounts: numberOfClosedAccounts, weeklyClosedAccounts: numberOfClosedAccounts }},
        { new: true, upsert: false } // لا نحتاج upsert
    ).lean(); // جلب الكائن الخام

    if (!updatedUserRecordRaw) {
        console.error(`!!! CRITICAL: Failed to find and update user ${userPublicKeyString} after findOrCreateUserOnly.`);
        throw new Error(`Failed to update existing user record for ${userPublicKeyString} after initial creation/check.`);
    }

    // فك تشفير المحيل يدويًا للسجل المحدث
    if (updatedUserRecordRaw.referrer) {
        updatedUserRecordRaw.referrer = decryptDataLocal(updatedUserRecordRaw.referrer);
    }
    console.log(`ReferralService (findOrCreateUserAndUpdateCounts): User ${userPublicKeyString} record updated. Referrer in updatedUserRecord (after manual decrypt): ${updatedUserRecordRaw.referrer || 'None'}`);

    return { userRecord: updatedUserRecordRaw, wasNewUserWithReferrer };
}

/**
 * يقوم بتحديث سجل المحيل الفعلي بناءً على عمولة الإحالة وإذا كانت إحالة جديدة.
 * @param {string|null} actualReferrerInDB - المفتاح العام للمحيل الأصلي (مفكوك التشفير).
 * @param {bigint} platformFeeLamportsBigInt - إجمالي رسوم المنصة.
 *  @param {boolean} incrementReferralCounters - هل يجب زيادة عدادات الإحالة لهذا المحيل؟
 */
async function updateReferrerStats(actualReferrerInDB, platformFeeLamportsBigInt, incrementReferralCounters) { // المعلمة الثالثة هنا صحيحة
    console.log(`ReferralService (updateReferrerStats): Updating stats for actualReferrerInDB=${actualReferrerInDB || 'None'}, incrementCounters=${incrementReferralCounters}`);

    // لا تقم بأي تحديث إذا لم يكن هناك محيل أو إذا لم تكن هناك أرباح لتضاف *و* لم نطلب زيادة العدادات
    if (!actualReferrerInDB || (platformFeeLamportsBigInt <= 0 && !incrementReferralCounters)) {
        console.log("ReferralService (updateReferrerStats): Skipping referrer update (no actual referrer, or nothing to update).");
        return;
    }

    let commissionAsNumber = 0;
    if (platformFeeLamportsBigInt > 0) {
        const referralCommissionLamportsBigInt = (platformFeeLamportsBigInt * BigInt(REFERRAL_COMMISSION_PERCENT_CONTRACT)) / BigInt(100);
        commissionAsNumber = Number(referralCommissionLamportsBigInt);
    }

    const referrerUpdateIncData = {};
    if (commissionAsNumber > 0) {
        referrerUpdateIncData.totalEarnings = commissionAsNumber;
        referrerUpdateIncData.weeklyEarnings = commissionAsNumber;
    }
    // زد عدادات الإحالة فقط إذا طُلب ذلك صراحة
    if (incrementReferralCounters) {
        referrerUpdateIncData.referralsCount = 1;
        referrerUpdateIncData.weeklyReferralsCount = 1;
        console.log(`ReferralService (updateReferrerStats): Incrementing referral counts for ${actualReferrerInDB} because incrementReferralCounters is true.`);
    }

    if (Object.keys(referrerUpdateIncData).length === 0) {
        console.log(`ReferralService (updateReferrerStats): No data to increment for actual referrer ${actualReferrerInDB}. Skipping DB update.`);
        return;
    }

    try {
        console.log(`ReferralService (updateReferrerStats): Updating actual referrer ${actualReferrerInDB}. Increment Data:`, referrerUpdateIncData);
        await Referral.findOneAndUpdate(
            { user: actualReferrerInDB },
            { $inc: referrerUpdateIncData },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        console.log(`ReferralService (updateReferrerStats): Actual referrer ${actualReferrerInDB} stats updated successfully.`);
    } catch (referrerUpdateError) {
        console.error(`!!! ReferralService ERROR updating actual referrer record for ${actualReferrerInDB} !!!`, referrerUpdateError);
    }
}

/**
 * يجلب معلومات الإحالة لمستخدم معين.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم.
 * @returns {Promise<object>} - كائن يحتوي على بيانات الإحالة (المحيل مفكوك التشفير).
 */
async function getReferralInfo(userPublicKeyString) {
    console.log(`ReferralService (getReferralInfo): Querying for user: ${userPublicKeyString}`);
    let referralDataRaw;
    try { // <--- إضافة try هنا
        referralDataRaw = await Referral.findOne({ user: userPublicKeyString }).lean();
    } catch (dbError) { // <--- إضافة catch هنا
        console.error(`ReferralService (getReferralInfo): DB error querying for ${userPublicKeyString}:`, dbError.message);
        referralDataRaw = null; // اعتبره كأن المستخدم غير موجود عند حدوث خطأ في DB
    }

    let finalReferralData;

    if (referralDataRaw) {
        if (referralDataRaw.referrer) {
            referralDataRaw.referrer = decryptDataLocal(referralDataRaw.referrer);
        }
        finalReferralData = {
            ...referralDataRaw,
            totalEarningsSol: (referralDataRaw.totalEarnings || 0) / LAMPORTS_PER_SOL,
            weeklyEarningsSol: (referralDataRaw.weeklyEarnings || 0) / LAMPORTS_PER_SOL,
            closedAccounts: referralDataRaw.closedAccounts || 0,
            referralsCount: referralDataRaw.referralsCount || 0,
            weeklyClosedAccounts: referralDataRaw.weeklyClosedAccounts || 0,
            weeklyReferralsCount: referralDataRaw.weeklyReferralsCount || 0,
            totalEarningsLamports: referralDataRaw.totalEarnings || 0,
            weeklyEarningsLamports: referralDataRaw.weeklyEarnings || 0,
        };
        console.log(`ReferralService (getReferralInfo): Data found. Referrer (manual decrypt): ${finalReferralData.referrer || 'None'}`);
    } else {
        console.log(`ReferralService (getReferralInfo): No data for ${userPublicKeyString} (or DB error). Returning default structure.`); // تعديل الرسالة
        finalReferralData = {
            user: userPublicKeyString, referrer: null, totalEarnings: 0, referralsCount: 0,
            closedAccounts: 0, weeklyEarnings: 0, weeklyClosedAccounts: 0, weeklyReferralsCount: 0,
            createdAt: new Date(), updatedAt: new Date(), totalEarningsSol: 0.0, weeklyEarningsSol: 0.0,
            totalEarningsLamports: 0, weeklyEarningsLamports: 0, isNewUser: true
        };
    }
    return finalReferralData;
}

/**
 * يتحقق مما إذا كان المستخدم مؤهلاً لسحب أرباحه.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم.
 * @returns {Promise<{eligible: boolean, earningsLamports: number, error?: string}>}
 */
async function checkWithdrawalEligibility(userPublicKeyString) {
    console.log(`ReferralService (checkWithdrawalEligibility): Checking for ${userPublicKeyString}`);
    const referralData = await Referral.findOne({ user: userPublicKeyString }).lean(); // لا نحتاج لفك تشفير المحيل هنا

    if (!referralData) {
        return { eligible: false, earningsLamports: 0, error: "User record not found." };
    }
    const earningsLamports = referralData.totalEarnings || 0;
    const minWithdrawLamports = BigInt(Math.ceil(MIN_REFERRAL_WITHDRAW_SOL * LAMPORTS_PER_SOL));

    if (BigInt(earningsLamports) < minWithdrawLamports) {
        return {
            eligible: false,
            earningsLamports: earningsLamports,
            error: `Insufficient referral balance. Minimum withdrawal is ${MIN_REFERRAL_WITHDRAW_SOL} SOL.`
        };
    }
    return { eligible: true, earningsLamports: earningsLamports };
}

/**
 * يقوم بتصفير رصيد أرباح المستخدم بعد السحب الناجح.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم.
 */
async function resetUserEarnings(userPublicKeyString) {
    console.log(`ReferralService (resetUserEarnings): Resetting earnings for ${userPublicKeyString}.`);
    try {
        await Referral.findOneAndUpdate(
            { user: userPublicKeyString },
            { $set: { totalEarnings: 0 } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        console.log(`ReferralService (resetUserEarnings): User ${userPublicKeyString} earnings reset to 0.`);
    } catch (dbUpdateError) {
        console.error(`!!! ReferralService CRITICAL: DB error resetting earnings for ${userPublicKeyString} !!!`, dbUpdateError);
    }
}

/**
 * @async
 * @function getWeeklyTopReferrers
 * @description يجلب قائمة أفضل المحيلين بناءً على عدد الإحالات الجديدة التي قاموا بها خلال الأسبوع الحالي/المنتهي (`weeklyReferralsCount`).
 * يُستخدم لعرض لوحة المتصدرين الأسبوعية للمحيلين ولتحديد الفائزين بالجوائز الأسبوعية.
 * @param {number} [limit=15] - الحد الأقصى لعدد المستخدمين المراد جلبه.
 * @returns {Promise<Array<object>>} مصفوفة من سجلات المستخدمين مرتبة.
 */
async function getWeeklyTopReferrers(limit = 15) { // تم تغيير اسم الدالة
    console.log(`ReferralService: Fetching top ${limit} referrers by *weekly* referral count.`);
    try {
        // البحث عن المستخدمين الذين لديهم weeklyReferralsCount > 0
        // الترتيب تنازليًا حسب weeklyReferralsCount، ثم weeklyEarnings (كترتيب ثانوي)
        const topReferrers = await Referral.find({ weeklyReferralsCount: { $gt: 0 } })
            .sort({ weeklyReferralsCount: -1, weeklyEarnings: -1 }) // *** الترتيب الأساسي بـ weeklyReferralsCount ***
            .limit(limit)
            .lean({ getters: true });
        console.log(`ReferralService: Found ${topReferrers.length} top weekly referrers.`);
        return topReferrers;
    } catch (error) {
        console.error("!!! ReferralService ERROR fetching top weekly referrers:", error);
        return [];
    }
}


/**
 * يجلب أفضل المغلقين بناءً على عدد الحسابات المغلقة أسبوعيًا.
 * (ملاحظة: لا نحتاج لفك تشفير referrer هنا)
 * @param {number} limit - عدد النتائج المطلوبة.
 * @returns {Promise<Array<object>>}
 */
async function getTopClosersByWeeklyCount(limit = 10) {
    console.log(`ReferralService (getTopClosers): Fetching top ${limit}`);
    try {
        const topClosersRaw = await Referral.find({ weeklyClosedAccounts: { $gt: 0 } })
            .sort({ weeklyClosedAccounts: -1 })
            .limit(limit)
            .lean();
        console.log(`ReferralService (getTopClosers): Found ${topClosersRaw.length} raw records.`);
        return topClosersRaw;
    } catch (error) {
        console.error("!!! ReferralService ERROR fetching top closers:", error);
        return [];
    }
}

/**
 * يقوم بتصفير جميع العدادات الأسبوعية في قاعدة البيانات.
 * @returns {Promise<{matchedCount: number, modifiedCount: number}>}
 */
async function resetAllWeeklyCounters() {
    console.log(`ReferralService: Resetting all weekly counters...`);
    try {
        const updateResult = await Referral.updateMany(
            { $or: [
                { weeklyEarnings: { $ne: 0 } },
                { weeklyClosedAccounts: { $ne: 0 } },
                { weeklyReferralsCount: { $ne: 0 } },
            ]},
            { $set: {
                weeklyEarnings: 0,
                weeklyClosedAccounts: 0,
                weeklyReferralsCount: 0,
            }}
        );
        console.log(`ReferralService: Reset weekly counters. Matched: ${updateResult.matchedCount}, Modified: ${updateResult.modifiedCount}`);
        return { matchedCount: updateResult.matchedCount, modifiedCount: updateResult.modifiedCount };
    } catch (error) {
         console.error(`!!! ReferralService ERROR during Weekly Counters Reset !!!`, error);
         throw error;
    }
}

/**
 * يحسب إجمالي الأرباح المعلقة (غير المسحوبة) للمحيلين.
 * @returns {Promise<bigint>}
 */
async function getTotalOutstandingReferralFees() {
     console.log(`ReferralService: Calculating total outstanding referral fees...`);
     try {
         const aggregation = await Referral.aggregate([
             { $group: { _id: null, total: { $sum: '$totalEarnings' } } }
         ]);
         const totalLamports = aggregation.length > 0 ? aggregation[0].total : 0;
         const totalLamportsRounded = Math.round(totalLamports);
         console.log(`ReferralService: Total outstanding fees calculated: ${totalLamportsRounded} lamports`);
         return BigInt(totalLamportsRounded);
     } catch (error) {
         console.error("!!! ReferralService ERROR calculating outstanding fees:", error);
         return BigInt(0);
     }
}

module.exports = {
    findOrCreateUserAndUpdateCounts,
    updateReferrerStats,
    getReferralInfo,
    checkWithdrawalEligibility,
    resetUserEarnings,
    getWeeklyTopReferrers,
    getTopClosersByWeeklyCount,
    resetAllWeeklyCounters,
    getTotalOutstandingReferralFees,
    findOrCreateUserOnly,
};