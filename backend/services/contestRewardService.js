// backend/services/contestRewardService.js
const fs = require('fs').promises;
const path = require('path');
const anchor = require('@coral-xyz/anchor');
const { PublicKey } = require('@solana/web3.js');

const { getTotalPlatformEarningsForPeriod } = require('./platformEarningService');
const { getMainTreasuryWallet, getAdminAuthorityKeypair } = require('../config/solana');
// --- !! نقطة تأكيد هنا !! ---
const { distributeRewardsViaContract } = require('./rewardService'); // يفترض أن هذا الاستيراد يعمل الآن بشكل صحيح
// -----------------------------
const notificationService = require('./notificationService'); // لاستخدام escapeMarkdownV2 إذا لزم الأمر
const {
    LAUNCH_CONTEST_EARNINGS_DURATION_HOURS, // يجب أن يكون معرفًا في constants.js
    LAUNCH_CONTEST_REWARD_PERCENT,       // يجب أن يكون معرفًا في constants.js
    EXPLORER_CLUSTER_PARAM_MAINNET,     // يجب أن يكون معرفًا في constants.js
    LAMPORTS_PER_SOL                    // موجود بالفعل في constants.js
} = require('../config/constants');

const FINAL_WINNERS_FILE_PATH = path.join(__dirname, '..', 'data', 'launch_contest_winners_final.json');
const LAUNCH_TIME_FILE_PATH_SERVICE = path.join(__dirname, '..', 'data', 'actual_launch_time.txt');

async function getActualLaunchTimestamp() {
    try {
        const timestampStr = await fs.readFile(LAUNCH_TIME_FILE_PATH_SERVICE, 'utf-8');
        const timestamp = new Date(timestampStr.trim());
        if (isNaN(timestamp.getTime())) { // .getTime() للتحقق من صحة التاريخ
            throw new Error("Invalid date format in actual_launch_time.txt");
        }
        console.log(`ContestRewardService: Read ACTUAL_LAUNCH_TIMESTAMP: ${timestamp.toISOString()}`);
        return timestamp;
    } catch (error) {
        console.error(`ContestRewardService: CRITICAL - Could not read actual launch timestamp from file (${LAUNCH_TIME_FILE_PATH_SERVICE}): ${error.message}`);
        return null;
    }
}

async function distributeLaunchContestRewards() {
    const JOB_NAME = "[Launch Contest Payout]";
    console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Starting Execution ---`);
    // --- !! أضف هذا السجل للتصحيح !! ---
    console.log(`${JOB_NAME} DEBUG: LAUNCH_CONTEST_EARNINGS_DURATION_HOURS = ${LAUNCH_CONTEST_EARNINGS_DURATION_HOURS}`);
    const allTransactionSignatures = []; // لجمع التوقيعات

    try {
        const actualLaunchTimestamp = await getActualLaunchTimestamp();
        if (!actualLaunchTimestamp) {
            const errorMsg = `${JOB_NAME} CRITICAL: ACTUAL_LAUNCH_TIMESTAMP could not be determined. Cannot calculate earnings period. Ensure 'record-launch-time' API was called.`;
            console.error(errorMsg);
            await notificationService.sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID, `🚨 ${notificationService.escapeMarkdownV2(errorMsg)}`);
            // لا ترمي خطأ هنا، فقط أرجع فشلًا
            return { success: false, message: "Actual launch timestamp not found.", signatures: [] };
        }

        const now = new Date();
        const earningsEndDate = new Date(actualLaunchTimestamp.getTime() + LAUNCH_CONTEST_EARNINGS_DURATION_HOURS * 60 * 60 * 1000);

        if (now < earningsEndDate) {
            const warningMsg = `${JOB_NAME} WARNING: The ${LAUNCH_CONTEST_EARNINGS_DURATION_HOURS}-hour earnings period since launch (${actualLaunchTimestamp.toISOString()}) has not yet completed. Current time: ${now.toISOString()}. Period ends: ${earningsEndDate.toISOString()}. Please run this job after the period ends.`;
            console.warn(warningMsg);
            await notificationService.sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID, `⚠️ ${notificationService.escapeMarkdownV2(warningMsg)}`);
            return { success: false, message: "Earnings period not complete.", signatures: [] };
        }

        console.log(`${JOB_NAME} Reading final winners list from: ${FINAL_WINNERS_FILE_PATH}`);
        let finalWinnersPubkeys;
        try {
            const fileContent = await fs.readFile(FINAL_WINNERS_FILE_PATH, 'utf-8');
            finalWinnersPubkeys = JSON.parse(fileContent);
            if (!Array.isArray(finalWinnersPubkeys) || finalWinnersPubkeys.some(pk => typeof pk !== 'string' || pk.trim() === '')) {
                throw new Error("Invalid format in winners file. Expected a non-empty array of public key strings.");
            }
            finalWinnersPubkeys = finalWinnersPubkeys.map(pk => pk.trim());
            finalWinnersPubkeys.forEach(pkStr => new PublicKey(pkStr));
        } catch (error) {
            const errorMsg = `${JOB_NAME} CRITICAL: Failed to read or parse final winners file (${FINAL_WINNERS_FILE_PATH}): ${error.message}`;
            console.error(errorMsg);
            await notificationService.sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID, `🚨 ${notificationService.escapeMarkdownV2(errorMsg)}`);
            return { success: false, message: `Failed to load winners file: ${error.message}`, signatures: [] };
        }

        if (finalWinnersPubkeys.length === 0) {
            console.log(`${JOB_NAME} No confirmed winners found in the file. Aborting payout.`);
            await notificationService.sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID, `ℹ️ ${notificationService.escapeMarkdownV2(JOB_NAME + " No confirmed winners in file. Payout aborted.")}`);
            return { success: true, message: "No winners to pay.", signatures: [] }; // يعتبر نجاحًا لأن العملية اكتملت بدون خطأ فادح
        }
        console.log(`${JOB_NAME} Found ${finalWinnersPubkeys.length} confirmed winners.`);

        const earningsStartDate = actualLaunchTimestamp;

        console.log(`${JOB_NAME} Calculating platform earnings for period: ${earningsStartDate.toISOString()} to ${earningsEndDate.toISOString()}`);
        const totalPlatformEarningsLamportsBigInt = await getTotalPlatformEarningsForPeriod(earningsStartDate, earningsEndDate);
        const totalPlatformEarningsBN = new anchor.BN(totalPlatformEarningsLamportsBigInt.toString());

        if (totalPlatformEarningsBN.lte(new anchor.BN(0))) {
            console.log(`${JOB_NAME} No platform earnings recorded in the first ${LAUNCH_CONTEST_EARNINGS_DURATION_HOURS} hours. No contest rewards to distribute.`);
            await notificationService.sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID, `ℹ️ ${notificationService.escapeMarkdownV2(JOB_NAME + " No platform earnings in first " + LAUNCH_CONTEST_EARNINGS_DURATION_HOURS + "h. No rewards.")}`);
            return { success: true, message: "No platform earnings for contest.", signatures: [] };
        }
        console.log(`${JOB_NAME} Total platform earnings for first ${LAUNCH_CONTEST_EARNINGS_DURATION_HOURS}h: ${totalPlatformEarningsBN.toString()} lamports.`);

        const contestRewardPoolBN = totalPlatformEarningsBN.mul(new anchor.BN(LAUNCH_CONTEST_REWARD_PERCENT)).div(new anchor.BN(100));
        if (contestRewardPoolBN.lte(new anchor.BN(0))) {
            console.log(`${JOB_NAME} Contest reward pool is zero or less. No rewards to distribute.`);
            await notificationService.sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID, `ℹ️ ${notificationService.escapeMarkdownV2(JOB_NAME + " Contest reward pool is zero. No rewards.")}`);
            return { success: true, message: "Contest reward pool is zero.", signatures: [] };
        }

        const individualShareBN = contestRewardPoolBN.div(new anchor.BN(finalWinnersPubkeys.length));
        if (individualShareBN.lte(new anchor.BN(0))) {
            console.log(`${JOB_NAME} Individual share for contest winners is zero or less. No rewards to distribute.`);
            await notificationService.sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID, `ℹ️ ${notificationService.escapeMarkdownV2(JOB_NAME + " Individual share is zero. No rewards.")}`);
            return { success: true, message: "Individual share is zero.", signatures: [] };
        }
        console.log(`${JOB_NAME} Contest Reward Pool: ${contestRewardPoolBN.toString()} lamports. Individual Share: ${individualShareBN.toString()} lamports for ${finalWinnersPubkeys.length} winners.`);

        const mainTreasuryKeypair = getMainTreasuryWallet();
        const adminAuthorityKeypair = getAdminAuthorityKeypair();
        if (!mainTreasuryKeypair || !adminAuthorityKeypair) {
            // هذا الخطأ يجب أن يوقف العملية لأنه حرج
            const criticalKeypairError = `${JOB_NAME} CRITICAL: Main Treasury or Admin Authority keypair not loaded from Vault.`;
            console.error(criticalKeypairError);
            await notificationService.sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID, `🚨 ${notificationService.escapeMarkdownV2(criticalKeypairError)}`);
            throw new Error(criticalKeypairError);
        }

        const chunkSize = 10; // يمكنك جعل هذا ثابتًا إذا أردت
        const numChunks = Math.ceil(finalWinnersPubkeys.length / chunkSize);
        let overallSuccess = true; // لتتبع ما إذا كانت جميع الدفعات ناجحة

        console.log(`${JOB_NAME} Starting distribution in ${numChunks} transactions...`);

        for (let i = 0; i < numChunks; i++) {
            const startIdx = i * chunkSize;
            const endIdx = startIdx + chunkSize;
            const chunkOfWinnerPubkeyStrings = finalWinnersPubkeys.slice(startIdx, endIdx);

            if (chunkOfWinnerPubkeyStrings.length === 0) continue;

            const recipientPubkeys = chunkOfWinnerPubkeyStrings.map(pkStr => new PublicKey(pkStr));
            const amountsBN = recipientPubkeys.map(() => individualShareBN);

            const distributionLabel = `Launch Contest Batch ${i + 1}/${numChunks}`;
            console.log(`${JOB_NAME} Processing ${distributionLabel} for ${recipientPubkeys.length} recipients...`);
            try {
                const txSignature = await distributeRewardsViaContract(
                    mainTreasuryKeypair,
                    adminAuthorityKeypair,
                    recipientPubkeys,
                    amountsBN,
                    distributionLabel // تسمية أوضح للمعاملة
                );
                console.log(`${JOB_NAME} Batch ${i + 1} distribution successful. Signature: ${txSignature}`);
                allTransactionSignatures.push(txSignature);
                if (i < numChunks - 1) {
                    await new Promise(resolve => setTimeout(resolve, 5000)); // زيادة التأخير قليلاً
                }
            } catch (batchError) {
                const errorMsg = `${JOB_NAME} ERROR during distribution batch ${i + 1}: ${batchError.message}`;
                console.error(errorMsg, batchError);
                await notificationService.sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID, `⚠️ ${notificationService.escapeMarkdownV2(errorMsg)}. Some rewards may not have been sent.`);
                overallSuccess = false; // ضع علامة أن دفعة واحدة على الأقل فشلت
                // استمر مع الدفعات الأخرى بدلاً من رمي الخطأ لإيقاف كل شيء
            }
        }

        let finalReportMessage = "";
        if (overallSuccess && allTransactionSignatures.length > 0) {
            finalReportMessage = `✅ *${notificationService.escapeMarkdownV2(JOB_NAME)} Completed Successfully\\!* 🎉\n\n`;
            finalReportMessage += `Distributed a total of *${notificationService.escapeMarkdownV2((individualShareBN.mul(new anchor.BN(finalWinnersPubkeys.length))).toString())} lamports* `;
            finalReportMessage += `(${(Number(individualShareBN.mul(new anchor.BN(finalWinnersPubkeys.length))) / LAMPORTS_PER_SOL).toFixed(6)} SOL) `;
            finalReportMessage += `to *${notificationService.escapeMarkdownV2(finalWinnersPubkeys.length)}* verified founding users\\.\n\n`;
        } else if (allTransactionSignatures.length > 0) { // نجاح جزئي
            finalReportMessage = `⚠️ *${notificationService.escapeMarkdownV2(JOB_NAME)} Completed with Some Issues\\.* 😟\n\n`;
            finalReportMessage += `Attempted to distribute rewards. *${notificationService.escapeMarkdownV2(allTransactionSignatures.length)} out of ${numChunks} transactions succeeded.* Please check logs and Solscan for details\\.\n\n`;
        } else { // فشل كامل
            finalReportMessage = `🚨 *${notificationService.escapeMarkdownV2(JOB_NAME)} FAILED TO DISTRIBUTE ANY REWARDS\\.* 😥\n\n`;
            finalReportMessage += `No transactions were successfully processed\\. Please review server logs immediately for critical errors\\.`;
            overallSuccess = false; // تأكيد الفشل
        }

        if (allTransactionSignatures.length > 0) {
            finalReportMessage += `*Distribution Transactions (${notificationService.escapeMarkdownV2(allTransactionSignatures.length)} successful):*\n`;
            allTransactionSignatures.forEach((sig, index) => {
                const solscanLink = `${SOLSCAN_BASE_URL}/tx/${sig}${EXPLORER_CLUSTER_PARAM_MAINNET || '?cluster=devnet'}`; // استخدام SOLSCAN_BASE_URL من notificationService
                finalReportMessage += `${notificationService.escapeMarkdownV2(index + 1)}\\. [View on Solscan](${notificationService.escapeMarkdownV2(solscanLink)})\n`;
            });
        }

        if (overallSuccess && allTransactionSignatures.length > 0) {
            finalReportMessage += `\nCongratulations again to all our founding users\\!`;
        }

        await notificationService.sendTelegramMessage(process.env.TELEGRAM_CHANNEL_ID, finalReportMessage, true); // إرسال للقناة العامة
        if (!overallSuccess) {
            // إرسال إشعار إضافي للمسؤول إذا كانت هناك أخطاء
            await notificationService.sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID, `🚨 ${notificationService.escapeMarkdownV2(JOB_NAME + " encountered errors during distribution. Review logs.")}`);
        }
        console.log(`${JOB_NAME} All distribution batches processing completed. Overall success: ${overallSuccess}. Final report sent.`);

        return {
            success: overallSuccess,
            message: `Launch contest rewards distribution process finished. Overall success: ${overallSuccess}.`,
            distributedTo: overallSuccess ? finalWinnersPubkeys.length : 0, // عدد من تم التوزيع لهم بنجاح
            totalAmountAttemptedLamports: individualShareBN.mul(new anchor.BN(finalWinnersPubkeys.length)).toString(),
            successfulTransactions: allTransactionSignatures.length,
            transactionSignatures: allTransactionSignatures
        };

    } catch (error) { // يلتقط الأخطاء الحرجة قبل بدء حلقة التوزيع
        const criticalErrorMsg = `${JOB_NAME} CRITICAL OVERALL ERROR (before batching): ${error.message}`;
        console.error(criticalErrorMsg, error);
        await notificationService.sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID, `🚨 ${notificationService.escapeMarkdownV2(criticalErrorMsg)}`);
        // لا ترمي الخطأ هنا، أرجع كائن فشل للسماح للمعالج بالاستجابة
        return { success: false, message: `Critical error: ${error.message}`, signatures: [] };
    } finally {
        console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Finished Execution ---`);
    }
}

module.exports = {
    distributeLaunchContestRewards,
};
