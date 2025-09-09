// backend/services/platformEarningService.js
const PlatformEarning = require('../models/PlatformEarning');
const { REFERRAL_COMMISSION_PERCENT_CONTRACT } = require('../config/constants'); // <-- استيراد هنا

/**
 * يسجل صافي ربح المنصة من معاملة معينة.
 * @param {bigint} netFeeToTreasuryLamports - صافي الربح بالـ lamports.
 * @param {string} signature - توقيع المعاملة.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم.
 * @param {number} closedCount - عدد الحسابات التي تم إغلاقها في هذه المعاملة.
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

async function recordPlatformEarning(netFeeToTreasuryLamports, signature, userPublicKeyString, closedCount) {
    const amountToStore = Number(netFeeToTreasuryLamports);

    if (amountToStore <= 0 && closedCount <= 0) {
        console.log("PlatformEarningService: Net fee and closed count are zero, not recording.");
        return;
    }

    console.log(`PlatformEarningService: Recording platform earning of ${amountToStore} lamports for ${closedCount} closed accounts from tx ${signature}`);
    try {
        await PlatformEarning.create({
            amount: amountToStore,
            closedCount: closedCount, // <-- تسجيل القيمة الجديدة
            timestamp: new Date(),
            transactionSignature: signature,
            userPublicKey: userPublicKeyString
        });
        console.log(`PlatformEarningService: Successfully recorded platform earning for tx ${signature}`);
    } catch (earningSaveError) {
        if (earningSaveError.code === 11000) {
            console.warn(`PlatformEarningService: Platform earning for tx ${signature} already recorded.`);
        } else {
            console.error(`!!! PlatformEarningService CRITICAL: Failed to save platform earning for tx ${signature} !!!`, earningSaveError);
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

