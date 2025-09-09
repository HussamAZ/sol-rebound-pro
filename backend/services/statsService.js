// backend/services/statsService.js
// الموديلات التي سنعتمد عليها
const PlatformEarning = require('../models/PlatformEarning');
const Referral = require('../models/Referral');
const { LAMPORTS_PER_SOL, RENT_PER_EMPTY_ATA_LAMPORTS } = require('../config/constants');

async function calculateOverallStats() {
    console.log("StatsService: Calculating overall project statistics from 'platformearnings' collection...");
    try {
        // حساب إجمالي الحسابات المغلقة من مجموعة الأرباح الدائمة
        const earningStats = await PlatformEarning.aggregate([
            { $group: { _id: null, totalClosedAccounts: { $sum: '$closedCount' } } }
        ]);
        const totalClosedAccounts = earningStats[0]?.totalClosedAccounts || 0;

        // حساب إجمالي أرباح المحيلين (هذا الحقل دائم في سجلات المستخدمين)
        const referralStats = await Referral.aggregate([
            { $group: { _id: null, totalReferralEarningsLamports: { $sum: '$totalEarnings' } } }
        ]);
        const totalReferralPayoutsLamports = referralStats[0]?.totalReferralEarningsLamports || 0;

        // حساب باقي الإحصائيات بناءً على القيم المجمعة
        const totalSolRecoveredLamports = BigInt(totalClosedAccounts) * BigInt(RENT_PER_EMPTY_ATA_LAMPORTS);

        const stats = {
            totalClosedAccounts: totalClosedAccounts,
            totalSolRecoveredForUsers: Number(totalSolRecoveredLamports) / LAMPORTS_PER_SOL,
            totalSolPaidToReferrers: totalReferralPayoutsLamports / LAMPORTS_PER_SOL,
        };

        console.log("StatsService: Overall stats calculated successfully:", stats);
        return stats;

    } catch (error) {
        console.error("!!! StatsService ERROR calculating overall stats:", error);
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
