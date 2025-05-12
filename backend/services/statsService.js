// backend/services/statsService.js
const Referral = require('../models/Referral'); // نحتاج موديل الإحالات لحساب الإحصائيات
const PlatformEarning = require('../models/PlatformEarning'); // نحتاج موديل أرباح المنصة لحساب الرسوم
const { LAMPORTS_PER_SOL, RENT_PER_EMPTY_ATA_LAMPORTS, REFERRAL_COMMISSION_PERCENT_CONTRACT, PLATFORM_FEE_PERCENT_CONTRACT } = require('../config/constants');

async function calculateOverallStats() {
    console.log("StatsService: Calculating overall project statistics...");
    try {
        // 1. حساب إجمالي عدد الحسابات المغلقة وإجمالي أرباح المحيلين من Referral model
        const referralStats = await Referral.aggregate([
            {
                $group: {
                    _id: null, // تجميع كل السجلات
                    totalClosedAccounts: { $sum: '$closedAccounts' }, // مجموع كل إغلاقات المستخدمين
                    totalReferralEarningsLamports: { $sum: '$totalEarnings' } // مجموع كل أرباح المحيلين
                }
            }
        ]);

        const totalClosedAccounts = referralStats[0]?.totalClosedAccounts || 0;
        const totalReferralPayoutsLamports = referralStats[0]?.totalReferralEarningsLamports || 0;

        // 2. حساب إجمالي SOL المسترجع للمستخدمين
        // كل حساب مغلق يسترجع RENT_PER_EMPTY_ATA_LAMPORTS للمستخدم
        const totalSolRecoveredLamports = BigInt(totalClosedAccounts) * BigInt(RENT_PER_EMPTY_ATA_LAMPORTS);

        // 3. تجميع النتائج وتحويلها لـ SOL
        const stats = {
            totalClosedAccounts: totalClosedAccounts,
            totalSolRecoveredForUsers: Number(totalSolRecoveredLamports) / LAMPORTS_PER_SOL,
            totalSolPaidToReferrers: totalReferralPayoutsLamports / LAMPORTS_PER_SOL, // totalEarnings في Referral model هي الأرباح الصافية المدفوعة للمحيل
        };

        console.log("StatsService: Overall stats calculated:", stats);
        return stats;

    } catch (error) {
        console.error("!!! StatsService ERROR calculating overall stats:", error);
        // أرجع قيم افتراضية أو ارمِ الخطأ
        // throw error; // أو
        return {
            totalClosedAccounts: 0,
            totalSolRecoveredForUsers: 0,
            totalSolPaidToReferrers: 0,
            error: "Failed to calculate stats"
        };
    }
}

module.exports = {
    calculateOverallStats,
};