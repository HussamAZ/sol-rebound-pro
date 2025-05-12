// backend/services/platformEarningService.js
const PlatformEarning = require('../models/PlatformEarning');
const { REFERRAL_COMMISSION_PERCENT_CONTRACT } = require('../config/constants'); // <-- استيراد هنا

/**
 * يسجل صافي ربح المنصة من معاملة معينة.
 * @param {bigint} netFeeToTreasuryLamports - صافي الربح بالـ lamports.
 * @param {string} signature - توقيع المعاملة.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم.
 */
/**
 * يحسب صافي رسوم المنصة بعد خصم عمولة الإحالة (إن وجدت).
 * @param {bigint} platformFeeLamportsBigInt - إجمالي رسوم المنصة للمعاملة.
 * @param {boolean} hasReferrer - هل يوجد محيل صالح لهذه المعاملة؟
 * @returns {bigint} - صافي الرسوم المستحقة للخزينة.
 */
function calculateNetFeeToTreasury(platformFeeLamportsBigInt, hasReferrer) {
    if (platformFeeLamportsBigInt <= 0) {
        return BigInt(0);
    }
    let netFee = platformFeeLamportsBigInt;
    if (hasReferrer) {
        // تأكد أن REFERRAL_COMMISSION_PERCENT_CONTRACT معرف ومستورد
        const referralCommissionLamportsBigInt = (platformFeeLamportsBigInt * BigInt(REFERRAL_COMMISSION_PERCENT_CONTRACT)) / BigInt(100);
        netFee = platformFeeLamportsBigInt - referralCommissionLamportsBigInt;
        // تأكد من أن النتيجة ليست سالبة (لا يجب أن يحدث بمنطقنا الحالي)
        if (netFee < 0) netFee = BigInt(0);
    }
    return netFee;
}

async function recordPlatformEarning(netFeeToTreasuryLamports, signature, userPublicKeyString) {
    // تحويل BigInt إلى Number لتخزينه
    const amountToStore = Number(netFeeToTreasuryLamports);

    if (amountToStore <= 0) {
        console.log("PlatformEarningService: Net fee to treasury is zero or negative, not recording.");
        return;
    }

    console.log(`PlatformEarningService: Recording platform earning of ${amountToStore} lamports from tx ${signature}`);
    try {
        await PlatformEarning.create({
            amount: amountToStore,
            timestamp: new Date(), // يمكن استخدام الوقت الحالي أو وقت المعاملة إذا كان متاحًا
            transactionSignature: signature,
            userPublicKey: userPublicKeyString
        });
        console.log(`PlatformEarningService: Successfully recorded platform earning for tx ${signature}`);
    } catch (earningSaveError) {
        // التعامل مع خطأ المفتاح المكرر (unique) بشكل خاص
        if (earningSaveError.code === 11000) { // MongoError: Duplicate key
            console.warn(`PlatformEarningService: Platform earning for tx ${signature} already recorded.`);
        } else {
            console.error(`!!! PlatformEarningService CRITICAL: Failed to save platform earning for tx ${signature} !!!`, earningSaveError);
            // إرسال تنبيه للمراقبة
            // لا يجب أن يوقف هذا الخطأ استجابة المستخدم النهائية إذا كانت العملية الأساسية ناجحة
        }
    }
}

/**
 * يحسب إجمالي أرباح المنصة خلال فترة زمنية محددة.
 * @param {Date} startDate - تاريخ بداية الفترة.
 * @param {Date} endDate - تاريخ نهاية الفترة.
 * @returns {Promise<bigint>} - إجمالي الأرباح بالـ lamports.
 */
async function getTotalPlatformEarningsForPeriod(startDate, endDate) {
    console.log(`PlatformEarningService: Calculating total earnings between ${startDate.toISOString()} and ${endDate.toISOString()}`);
    try {
        const earningsAggregation = await PlatformEarning.aggregate([
            {
                $match: { // اختيار السجلات ضمن الفترة
                    timestamp: { $gte: startDate, $lt: endDate }
                }
            },
            {
                $group: { // تجميع وحساب المجموع
                    _id: null, // تجميع كل المستندات معًا
                    total: { $sum: '$amount' } // جمع حقل المبلغ (يجب أن يكون Number)
                }
            }
        ]);

        const totalLamports = earningsAggregation.length > 0 ? earningsAggregation[0].total : 0;
        // تأكد من أنه عدد صحيح
        const totalLamportsRounded = Math.round(totalLamports);
        console.log(`PlatformEarningService: Total earnings for period: ${totalLamportsRounded} lamports`);
        return BigInt(totalLamportsRounded);
    } catch (error) {
        console.error("!!! PlatformEarningService ERROR calculating total earnings:", error);
        return BigInt(0); // أرجع صفرًا عند الخطأ
    }
}

module.exports = {
    calculateNetFeeToTreasury, // <-- تصدير الدالة الجديدة
    recordPlatformEarning,
    getTotalPlatformEarningsForPeriod,
};