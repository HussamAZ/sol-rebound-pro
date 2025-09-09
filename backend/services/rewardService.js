// backend/services/rewardService.js

// --- 1. الاستيرادات الأساسية ---
const anchor = require('@coral-xyz/anchor');
const { PublicKey, Transaction, SystemProgram, ComputeBudgetProgram } = require('@solana/web3.js');
const { getWeeklyTopReferrers, getTopClosersByWeeklyCount } = require('./referralService');
const { getTotalPlatformEarningsForPeriod } = require('./platformEarningService');
const { getAccountBalance } = require('./solanaService');
const { sendWeeklyTopReport } = require('./notificationService');
const { LAMPORTS_PER_SOL, TOP_REFERRER_REWARD_PERCENT, TOP_CLOSER_REWARD_PERCENT, RENT_EXEMPT_RESERVE_LAMPORTS } = require('../config/constants');

// --- 2. الاستيرادات من ملف solana.js (مع إضافة getProgram) ---
const {
    getConnection,
    getProgram, // <-- الاستيراد الإضافي والمهم
    getMainTreasuryWallet,
    getAdminAuthorityKeypair,
} = require('../config/solana');


/**
 * (النسخة النهائية والمعدلة للعمل مع العقد الحالي)
 * الدالة الأساسية لتوزيع الجوائز.
 * @param {anchor.web3.Keypair} sourceWalletKeypair - Main Treasury.
 * @param {anchor.web3.Keypair} adminAuthorityKeypair - Admin Authority.
 * @param {PublicKey[]} recipientPubkeys - مصفوفة المستلمين.
 * @param {anchor.BN[]} amountsBN - مصفوفة المبالغ.
 * @param {string} distributionLabel - تسمية للمعاملة.
 * @returns {Promise<string>} - توقيع المعاملة الناجحة.
 */
async function distributeRewardsViaContract(sourceWalletKeypair, adminAuthorityKeypair, recipientPubkeys, amountsBN, distributionLabel) {
    const connection = getConnection();
    const program = getProgram();

    if (!connection || !program || !sourceWalletKeypair || !adminAuthorityKeypair) {
        throw new Error(`Solana config/keypairs not initialized for distributeRewardsViaContract (${distributionLabel}).`);
    }
    if (recipientPubkeys.length === 0 || amountsBN.length === 0 || recipientPubkeys.length !== amountsBN.length) {
        throw new Error(`Invalid recipients or amounts for ${distributionLabel}. R:${recipientPubkeys.length}, A:${amountsBN.length}`);
    }

    const totalAmountBN = amountsBN.reduce((acc, val) => acc.add(val), new anchor.BN(0));
    console.log(`RewardService (distributeRewardsViaContract - ${distributionLabel}): Preparing transaction...`);
    console.log(`   - Treasury Wallet (Signer 1): ${sourceWalletKeypair.publicKey.toBase58()}`);
    console.log(`   - Authority (Signer 2): ${adminAuthorityKeypair.publicKey.toBase58()}`);
    console.log(`   - Total Amount: ${totalAmountBN.toString()}`);

    const sourceWalletBalance = await getAccountBalance(sourceWalletKeypair.publicKey);
    const requiredBalanceBN = totalAmountBN.add(new anchor.BN(RENT_EXEMPT_RESERVE_LAMPORTS));
    if (new anchor.BN(sourceWalletBalance.toString()).lt(requiredBalanceBN)) {
        throw new Error(`Insufficient balance in Treasury Wallet. Needed for rewards + rent reserve: ${requiredBalanceBN.toString()}, Available: ${sourceWalletBalance}`);
    }

    console.log(`RewardService (distributeRewardsViaContract - ${distributionLabel}): Source Wallet balance check passed.`);

    try {
        const tx = new Transaction();
        tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 + (recipientPubkeys.length * 20000) }));
        
        tx.add(
            await program.methods
                .distributeRewards(amountsBN)
                .accounts({
                    treasury: sourceWalletKeypair.publicKey,
                    authority: adminAuthorityKeypair.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .remainingAccounts(
                    recipientPubkeys.map(pubkey => ({ pubkey, isSigner: false, isWritable: true }))
                )
                .instruction()
        );
        
        tx.feePayer = adminAuthorityKeypair.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        
        console.log(`RewardService (distributeRewardsViaContract - ${distributionLabel}): Sending and confirming transaction...`);

        const signature = await anchor.web3.sendAndConfirmTransaction(
            connection,
            tx,
            [sourceWalletKeypair, adminAuthorityKeypair],
            { commitment: 'confirmed', skipPreflight: false }
        );

        console.log(`RewardService (distributeRewardsViaContract - ${distributionLabel}): Distribution successful! Signature: ${signature}`);
        return signature;

    } catch (error) {
        console.error(`!!! RewardService (distributeRewardsViaContract - ${distributionLabel}) ERROR !!!`, error);
        const logs = error.logs || [];
        throw new Error(`Failed distribution (${distributionLabel}): ${error.message} | Logs: ${logs.join('\n')}`);
    }
}


// --- باقي دوال الملف (distributeTopReferrerRewards و distributeTopCloserRewards) تبقى كما هي ---
// --- لأن التغيير الذي قمنا به هو في الدالة المساعدة التي يستخدمونها ---

async function distributeTopReferrerRewards() {
    const JOB_NAME = "[Top Referrers Cron - Treasury Distribution]";
    console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Starting Execution ---`);
    const distributionResults = [];
    try {
        // --- (جزء التحقق من المفاتيح وحساب فترة الأرباح يبقى كما هو) ---
        const mainTreasuryKeypair = getMainTreasuryWallet();
        const adminAuthorityKeypair = getAdminAuthorityKeypair();
        if (!mainTreasuryKeypair || !adminAuthorityKeypair) {
            throw new Error("Keypairs not loaded for referrer rewards.");
        }

        const calculationEndDate = new Date();
        calculationEndDate.setUTCHours(23, 0, 0, 0);
        if (calculationEndDate.getUTCDay() !== 6) {
            calculationEndDate.setUTCDate(calculationEndDate.getUTCDate() - (calculationEndDate.getUTCDay() + 1) % 7);
        }
        const calculationStartDate = new Date(calculationEndDate);
        calculationStartDate.setUTCDate(calculationStartDate.getUTCDate() - 6);
        calculationStartDate.setUTCHours(0, 0, 0, 0);

        const totalWeeklyPlatformEarningsBN = new anchor.BN((await getTotalPlatformEarningsForPeriod(calculationStartDate, calculationEndDate)).toString());
        if (totalWeeklyPlatformEarningsBN.isZero()) {
            console.log(`${JOB_NAME} EXIT: No platform earnings this week. No referrer rewards to distribute.`);
            return distributionResults;
        }

        const referrerRewardPool = totalWeeklyPlatformEarningsBN.mul(new anchor.BN(TOP_REFERRER_REWARD_PERCENT)).div(new anchor.BN(100));
        if (referrerRewardPool.isZero()) {
            console.log(`${JOB_NAME} EXIT: Referrer reward pool is zero.`);
            return distributionResults;
        }

        const topReferrers = await getWeeklyTopReferrers(10);
        if (topReferrers.length === 0) {
            console.log(`${JOB_NAME} EXIT: No eligible top weekly referrers found.`);
            return distributionResults;
        }

        // --- **بداية المنطق الجديد للفلترة** ---
        console.log(`${JOB_NAME} INFO: Checking activation status for ${topReferrers.length} potential winners...`);
        const eligibleWinners = [];
        const ineligibleWinners = [];

        for (const winner of topReferrers) {
            try {
                const balance = await getAccountBalance(new PublicKey(winner.user));
                if (balance > BigInt(0)) {
                    eligibleWinners.push(winner); // المحفظة نشطة
                } else {
                    ineligibleWinners.push(winner); // المحفظة غير نشطة (رصيدها صفر)
                }
            } catch (e) {
                console.warn(`${JOB_NAME} WARN: Could not check balance for ${winner.user}. Assuming ineligible. Error: ${e.message}`);
                ineligibleWinners.push(winner);
            }
        }

        console.log(`${JOB_NAME} INFO: Found ${eligibleWinners.length} eligible (active) winners and ${ineligibleWinners.length} ineligible (inactive) winners.`);

        if (ineligibleWinners.length > 0) {
            const ineligibleKeys = ineligibleWinners.map(w => w.user).join(', ');
            const adminMessage = `⚠️ ${JOB_NAME}: Skipped ${ineligibleWinners.length} inactive winners: ${ineligibleKeys}. They need to activate their wallets.`;
            // يمكنك تفعيل إرسال هذه الرسالة إلى قناة خاصة بالمسؤولين لاحقًا
            // await sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID, adminMessage);
            console.log(adminMessage);
        }
        // --- **نهاية المنطق الجديد للفلترة** ---

        if (eligibleWinners.length === 0) {
            console.log(`${JOB_NAME} EXIT: No eligible (active) winners found after checking balances.`);
            return distributionResults;
        }

        // **إعادة حساب الحصة بناءً على عدد الفائزين المؤهلين فقط**
        const individualShare = referrerRewardPool.div(new anchor.BN(eligibleWinners.length));
        if (individualShare.isZero()) {
            console.log(`${JOB_NAME} EXIT: Individual referrer share is zero after filtering.`);
            return distributionResults;
        }

        const recipientPubkeys = eligibleWinners.map(winner => new PublicKey(winner.user));
        const amountsBN = eligibleWinners.map(() => individualShare);

        console.log(`${JOB_NAME} INFO: Proceeding to distribute ${referrerRewardPool.toString()} lamports among ${eligibleWinners.length} active winners.`);
        const txSignature = await distributeRewardsViaContract(
            mainTreasuryKeypair, adminAuthorityKeypair, recipientPubkeys, amountsBN, "Top Weekly Referrers"
        );
        console.log(`${JOB_NAME} INFO: Top Weekly Referrers distribution successful. Tx: ${txSignature}`);

        eligibleWinners.forEach(winner => {
            distributionResults.push({
                recipient: winner.user,
                amount: individualShare.toNumber(),
                signature: txSignature,
                status: 'Success',
                reason: 'Top Weekly Referrer',
                weeklyScore: winner.weeklyReferralsCount // استخدم الحقل الصحيح للمحيلين
            });
        });

        // تعديل رسالة تيليجرام لتكون أكثر وضوحًا
        let reportTitle = "🏆 Weekly Top Referrers!";
        if (ineligibleWinners.length > 0) {
            reportTitle += ` (${ineligibleWinners.length} skipped due to inactive wallets)`;
        }
        await sendWeeklyTopReport(reportTitle, distributionResults, 'weeklyScore', 'New Referrals this Week');

    } catch (error) {
        console.error(`[${new Date().toISOString()}] !!! ${JOB_NAME} UNCAUGHT ERROR During Execution !!!`, error);
    } finally {
        console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Finished Execution ---`);
    }
    return distributionResults;
}


async function distributeTopCloserRewards() {
    const JOB_NAME = "[Top Closers Cron - Treasury Distribution]";
    console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Starting Execution ---`);
    const distributionResults = [];
    try {
        // --- (جزء التحقق من المفاتيح وحساب فترة الأرباح يبقى كما هو) ---
        const mainTreasuryKeypair = getMainTreasuryWallet();
        const adminAuthorityKeypair = getAdminAuthorityKeypair();
        if (!mainTreasuryKeypair || !adminAuthorityKeypair) { throw new Error("Keypairs not loaded for closer rewards."); }

        const calculationEndDate = new Date();
        calculationEndDate.setUTCHours(23, 0, 0, 0);
        if (calculationEndDate.getUTCDay() !== 6) {
            calculationEndDate.setUTCDate(calculationEndDate.getUTCDate() - (calculationEndDate.getUTCDay() + 1) % 7);
        }
        const calculationStartDate = new Date(calculationEndDate);
        calculationStartDate.setUTCDate(calculationStartDate.getUTCDate() - 6);
        calculationStartDate.setUTCHours(0, 0, 0, 0);

        const totalWeeklyPlatformEarningsBN = new anchor.BN((await getTotalPlatformEarningsForPeriod(calculationStartDate, calculationEndDate)).toString());
        if (totalWeeklyPlatformEarningsBN.isZero()) {
            console.log(`${JOB_NAME} EXIT: No platform earnings this week. No closer rewards to distribute.`);
            return distributionResults;
        }

        const closerRewardPool = totalWeeklyPlatformEarningsBN.mul(new anchor.BN(TOP_CLOSER_REWARD_PERCENT)).div(new anchor.BN(100));
        if (closerRewardPool.isZero()) {
            console.log(`${JOB_NAME} EXIT: Closer reward pool is zero.`);
            return distributionResults;
        }

        const topClosers = await getTopClosersByWeeklyCount(10);
        if (topClosers.length === 0) {
            console.log(`${JOB_NAME} EXIT: No eligible top closers found.`);
            return distributionResults;
        }

        // --- **بداية المنطق الجديد للفلترة** ---
        console.log(`${JOB_NAME} INFO: Checking activation status for ${topClosers.length} potential winners...`);
        const eligibleWinners = [];
        const ineligibleWinners = [];

        for (const winner of topClosers) {
            try {
                const balance = await getAccountBalance(new PublicKey(winner.user));
                if (balance > BigInt(0)) {
                    eligibleWinners.push(winner); // المحفظة نشطة
                } else {
                    ineligibleWinners.push(winner); // المحفظة غير نشطة (رصيدها صفر)
                }
            } catch (e) {
                console.warn(`${JOB_NAME} WARN: Could not check balance for ${winner.user}. Assuming ineligible. Error: ${e.message}`);
                ineligibleWinners.push(winner);
            }
        }

        console.log(`${JOB_NAME} INFO: Found ${eligibleWinners.length} eligible (active) winners and ${ineligibleWinners.length} ineligible (inactive) winners.`);

        if (ineligibleWinners.length > 0) {
            const ineligibleKeys = ineligibleWinners.map(w => w.user).join(', ');
            const adminMessage = `⚠️ ${JOB_NAME}: Skipped ${ineligibleWinners.length} inactive winners: ${ineligibleKeys}. They need to activate their wallets.`;
            // يمكنك تفعيل إرسال هذه الرسالة إلى قناة خاصة بالمسؤولين لاحقًا
            // await sendTelegramMessage(process.env.TELEGRAM_ADMIN_CHAT_ID, adminMessage);
            console.log(adminMessage);
        }
        // --- **نهاية المنطق الجديد للفلترة** ---

        if (eligibleWinners.length === 0) {
            console.log(`${JOB_NAME} EXIT: No eligible (active) winners found after checking balances.`);
            return distributionResults;
        }

        // **إعادة حساب الحصة بناءً على عدد الفائزين المؤهلين فقط**
        const individualShare = closerRewardPool.div(new anchor.BN(eligibleWinners.length));
        if (individualShare.isZero()) {
            console.log(`${JOB_NAME} EXIT: Individual closer share is zero after filtering.`);
            return distributionResults;
        }

        const recipientPubkeys = eligibleWinners.map(winner => new PublicKey(winner.user));
        const amountsBN = eligibleWinners.map(() => individualShare);

        console.log(`${JOB_NAME} INFO: Proceeding to distribute ${closerRewardPool.toString()} lamports among ${eligibleWinners.length} active winners.`);
        const txSignature = await distributeRewardsViaContract(
            mainTreasuryKeypair, adminAuthorityKeypair, recipientPubkeys, amountsBN, "Top Closers"
        );
        console.log(`${JOB_NAME} INFO: Top Closers distribution successful. Tx: ${txSignature}`);

        eligibleWinners.forEach(winner => {
            distributionResults.push({
                recipient: winner.user, amount: individualShare.toNumber(), signature: txSignature,
                status: 'Success', reason: 'Top Closer', weeklyScore: winner.weeklyClosedAccounts
            });
        });
        
        // تعديل رسالة تيليجرام لتكون أكثر وضوحًا
        let reportTitle = "✨ Weekly Top Closers!";
        if (ineligibleWinners.length > 0) {
            reportTitle += ` (${ineligibleWinners.length} skipped due to inactive wallets)`;
        }
        await sendWeeklyTopReport(reportTitle, distributionResults, 'weeklyScore', 'Accounts Closed');

    } catch (error) {
        console.error(`[${new Date().toISOString()}] !!! ${JOB_NAME} UNCAUGHT ERROR During Execution !!!`, error);
    } finally {
        console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Finished Execution ---`);
    }
    return distributionResults;
}


module.exports = {
    distributeTopReferrerRewards,
    distributeTopCloserRewards,
    distributeRewardsViaContract
};

