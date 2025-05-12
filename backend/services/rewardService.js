// backend/services/rewardService.js
const anchor = require('@coral-xyz/anchor');
const { PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } = require('@solana/web3.js');
const { Buffer } = require('buffer');
const { getWeeklyTopReferrers, getTopClosersByWeeklyCount } = require('./referralService');
const { getTotalPlatformEarningsForPeriod } = require('../services/platformEarningService'); // *** استيراد هذا ***
const { getAccountBalance } = require('./solanaService');
const {
    // getProgram, // لم نعد بحاجة إليه مباشرة
    getConnection,
    // getServerWallet, // لم نعد بحاجة إليه
    getMainTreasuryWallet,    // *** سنستخدم هذا كمصدر ***
    getAdminAuthorityKeypair,
    getAdminAuthorityPublicKey,
    getSystemProgramId,
    getProgramId,
} = require('../config/solana');
const { LAMPORTS_PER_SOL } = require('../config/constants'); // TOP_REFERRER/CLOSER_REWARD_PERCENT لم تعد مستخدمة هنا
const { sendWeeklyTopReport } = require('./notificationService');

const BN_ZERO = new anchor.BN(0);
const REWARD_PERCENTAGE = new anchor.BN(1); // 1%

/**
 * الدالة الأساسية لتوزيع الجوائز باستخدام تعليمة distribute_rewards.
 * @param {anchor.web3.Keypair} sourceWalletKeypair - زوج مفاتيح المحفظة مصدر الأموال (ستكون Main Treasury).
 * @param {anchor.web3.Keypair} adminAuthorityKeypair - زوج مفاتيح سلطة الإدارة (الموقع المطلوب).
 * @param {PublicKey[]} recipientPubkeys - مصفوفة المفاتيح العامة للمستلمين.
 * @param {anchor.BN[]} amountsBN - مصفوفة المبالغ (ككائنات BN) المقابلة لكل مستلم.
 * @param {string} distributionLabel - تسمية للمعاملة (للتسجيل).
 * @returns {Promise<string>} - توقيع المعاملة الناجحة.
 */
async function distributeRewardsViaContract(sourceWalletKeypair, adminAuthorityKeypair, recipientPubkeys, amountsBN, distributionLabel) {
    // const program = getProgram(); // لم نعد بحاجة لـ program.methods
    const connection = getConnection();
    const adminAuthorityPublicKey = getAdminAuthorityPublicKey();
    const systemProgramId = getSystemProgramId();
    const programId = getProgramId();

    if (!connection || !sourceWalletKeypair || !adminAuthorityKeypair || !adminAuthorityPublicKey || !systemProgramId || !programId) {
        throw new Error(`Solana config/keypairs/IDs not initialized for distributeRewardsViaContract (${distributionLabel}).`);
    }
    if (recipientPubkeys.length === 0 || amountsBN.length === 0 || recipientPubkeys.length !== amountsBN.length) {
        throw new Error(`Invalid recipients or amounts for ${distributionLabel}. R:${recipientPubkeys.length}, A:${amountsBN.length}`);
    }

    console.log(`RewardService (distributeRewardsViaContract/Manual - ${distributionLabel}): Preparing instruction...`);
    const totalAmountBN = amountsBN.reduce((acc, val) => acc.add(val), BN_ZERO);
    console.log(`   - Treasury/Source Wallet: ${sourceWalletKeypair.publicKey.toBase58()}`);
    console.log(`   - Authority (Signer): ${adminAuthorityKeypair.publicKey.toBase58()}`);
    console.log(`   - Recipients Count: ${recipientPubkeys.length}`);
    console.log(`   - Total Amount to Distribute (BN): ${totalAmountBN.toString()}`);

    if (!adminAuthorityKeypair.publicKey.equals(adminAuthorityPublicKey)) { throw new Error(`Admin Authority Keypair mismatch.`); }

    const sourceWalletBalanceCheck = await getAccountBalance(sourceWalletKeypair.publicKey);
    const sourceWalletBalanceCheckBN = new anchor.BN(sourceWalletBalanceCheck.toString());
    if (sourceWalletBalanceCheckBN.lt(totalAmountBN)) {
         throw new Error(`Insufficient balance in Source Wallet (${sourceWalletKeypair.publicKey.toBase58()}) for ${distributionLabel}. Needed: ${totalAmountBN}, Available: ${sourceWalletBalanceCheckBN}`);
    }
    console.log(`RewardService (distributeRewardsViaContract/Manual - ${distributionLabel}): Source Wallet balance check passed.`);

    let signature = '';
    try {
        const instructionDiscriminator = Buffer.from([97, 6, 227, 255, 124, 165, 3, 148]);
        const amountsBuffer = Buffer.alloc(4 + amountsBN.length * 8);
        amountsBuffer.writeUInt32LE(amountsBN.length, 0);
        amountsBN.forEach((amount, index) => { amount.toBuffer('le', 8).copy(amountsBuffer, 4 + index * 8); });
        const instructionData = Buffer.concat([instructionDiscriminator, amountsBuffer]);

        const instructionKeys = [
            { pubkey: sourceWalletKeypair.publicKey, isSigner: true, isWritable: true }, // المصدر (الكنز الرئيسي)
            { pubkey: adminAuthorityKeypair.publicKey, isSigner: true, isWritable: false }, // السلطة
            { pubkey: systemProgramId, isSigner: false, isWritable: false },
            ...recipientPubkeys.map(r => ({ pubkey: r, isSigner: false, isWritable: true }))
        ];

        const distributeInstruction = new TransactionInstruction({ keys: instructionKeys, programId: programId, data: instructionData });
        const computeUnitLimitInstruction = ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 });
        const transaction = new Transaction().add(computeUnitLimitInstruction).add(distributeInstruction);
        transaction.feePayer = adminAuthorityKeypair.publicKey; // السلطة تدفع رسوم المعاملة

        console.log(`RewardService (distributeRewardsViaContract/Manual - ${distributionLabel}): Sending and confirming transaction...`);
        signature = await anchor.web3.sendAndConfirmTransaction(
            connection,
            transaction,
            [adminAuthorityKeypair, sourceWalletKeypair], // الموقعون: السلطة ومصدر الأموال
            { commitment: 'confirmed', skipPreflight: false }
        );
        console.log(`RewardService (distributeRewardsViaContract/Manual - ${distributionLabel}): Distribution successful! Signature: ${signature}`);
        return signature;
    } catch (error) {
        console.error(`!!! RewardService (distributeRewardsViaContract/Manual - ${distributionLabel}) ERROR (Tx: ${signature || 'N/A'}) !!!`, error);
        let specificError = error.message;
        if (error.logs) { specificError = `Transaction failed with logs: ${JSON.stringify(error.logs)}`; }
        throw new Error(`Failed distribution (${distributionLabel}): ${specificError}`);
    }
}

/**
 * يحسب ويوزع مكافآت أفضل المحيلين الأسبوعية.
 */
async function distributeTopReferrerRewards() {
    const JOB_NAME = "[Top Referrers Cron - Treasury Distribution]";
    console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Starting Execution ---`);
    const distributionResults = [];
    try {
        const mainTreasuryKeypair = getMainTreasuryWallet();
        const adminAuthorityKeypair = getAdminAuthorityKeypair();
        if (!mainTreasuryKeypair || !adminAuthorityKeypair) {
            throw new Error("Keypairs not loaded for referrer rewards.");
        }

        // 1. حساب إجمالي أرباح المنصة للأسبوع الماضي (نفس المنطق)
        // ... (كود حساب totalWeeklyPlatformEarningsBN يبقى كما هو) ...
        const calculationEndDate = new Date();
        calculationEndDate.setUTCHours(23, 0, 0, 0);
        if (calculationEndDate.getUTCDay() !== 6) {
            calculationEndDate.setUTCDate(calculationEndDate.getUTCDate() - (calculationEndDate.getUTCDay() + 1) % 7);
        }
        const calculationStartDate = new Date(calculationEndDate);
        calculationStartDate.setUTCDate(calculationStartDate.getUTCDate() - 6);
        calculationStartDate.setUTCHours(0, 0, 0, 0);

        console.log(`${JOB_NAME} Calculating platform earnings from DB for period: ${calculationStartDate.toISOString()} to ${calculationEndDate.toISOString()}`);
        const totalWeeklyPlatformEarningsBigInt = await getTotalPlatformEarningsForPeriod(calculationStartDate, calculationEndDate);
        const totalWeeklyPlatformEarningsBN = new anchor.BN(totalWeeklyPlatformEarningsBigInt.toString());
        console.log(`${JOB_NAME} DEBUG: Total Weekly Platform Earnings (BN): ${totalWeeklyPlatformEarningsBN.toString()}`);


        if (totalWeeklyPlatformEarningsBN.lte(BN_ZERO)) {
            console.log(`${JOB_NAME} EXIT: No platform earnings this week. No referrer rewards to distribute.`);
            return distributionResults;
        }

        const referrerRewardPool = totalWeeklyPlatformEarningsBN.mul(REWARD_PERCENTAGE).div(new anchor.BN(100));
        if (referrerRewardPool.lte(BN_ZERO)) {
            console.log(`${JOB_NAME} EXIT: Referrer reward pool is zero.`);
            return distributionResults;
        }

        // *** استدعاء الدالة الجديدة لجلب أفضل المحيلين بناءً على النشاط الأسبوعي ***
        const topReferrers = await getWeeklyTopReferrers(10); // جلب أفضل 10 بناءً على weeklyReferralsCount
        const numberOfWinners = topReferrers.length;
        if (numberOfWinners === 0) {
            console.log(`${JOB_NAME} EXIT: No eligible top weekly referrers found.`);
            return distributionResults;
        }

        const individualShare = referrerRewardPool.div(new anchor.BN(numberOfWinners));
        if (individualShare.lte(BN_ZERO)) {
            console.log(`${JOB_NAME} EXIT: Individual referrer share is zero.`);
            return distributionResults;
        }

        const recipientPubkeys = topReferrers.map(winner => new PublicKey(winner.user));
        const amountsBN = topReferrers.map(() => individualShare);

        const txSignature = await distributeRewardsViaContract(
            mainTreasuryKeypair, adminAuthorityKeypair, recipientPubkeys, amountsBN, "Top Weekly Referrers"
        );
        console.log(`${JOB_NAME} INFO: Top Weekly Referrers distribution successful. Tx: ${txSignature}`);

        topReferrers.forEach(winner => {
            distributionResults.push({
                recipient: winner.user,
                amount: individualShare.toNumber(),
                signature: txSignature,
                status: 'Success',
                reason: 'Top Weekly Referrer',
                // *** استخدام winner.weeklyReferralsCount هنا ***
                weeklyScore: winner.weeklyReferralsCount // هذا هو عدد الإحالات الأسبوعية
            });
        });
        // *** تحديث وحدة النتيجة في استدعاء sendWeeklyTopReport ***
        await sendWeeklyTopReport( "🏆 Weekly Top Referrers!", distributionResults, 'weeklyScore', 'New Referrals this Week' );

    } catch (error) {
        console.error(`[${new Date().toISOString()}] !!! ${JOB_NAME} UNCAUGHT ERROR During Execution !!!`, error);
    } finally {
        console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Finished Execution ---`);
    }
    return distributionResults;
}

/**
 * يحسب ويوزع مكافآت أفضل المغلقين الأسبوعية.
 */
async function distributeTopCloserRewards() {
    const JOB_NAME = "[Top Closers Cron - Treasury Distribution]";
    console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Starting Execution ---`);
    const distributionResults = [];
    try {
        const mainTreasuryKeypair = getMainTreasuryWallet(); // *** مصدر الأموال الآن هو الكنز الرئيسي ***
        const adminAuthorityKeypair = getAdminAuthorityKeypair();
        if (!mainTreasuryKeypair || !adminAuthorityKeypair) { throw new Error("Keypairs not loaded for closer rewards."); }

        // 1. حساب إجمالي أرباح المنصة للأسبوع الماضي (نفس الفترة المستخدمة للمحيلين)
        const calculationEndDate = new Date();
        calculationEndDate.setUTCHours(23, 0, 0, 0); // نهاية السبت
        if (calculationEndDate.getUTCDay() !== 6) {
            calculationEndDate.setUTCDate(calculationEndDate.getUTCDate() - (calculationEndDate.getUTCDay() + 1) % 7);
        }
        const calculationStartDate = new Date(calculationEndDate);
        calculationStartDate.setUTCDate(calculationStartDate.getUTCDate() - 6);
        calculationStartDate.setUTCHours(0, 0, 0, 0); // بداية الأحد

        // لا داعي لاستدعاء getTotalPlatformEarningsForPeriod مرة أخرى إذا كانت الفترة هي نفسها
        // ولكن لضمان الدقة إذا تم تشغيل المهام بشكل منفصل، سنستدعيها.
        // في سيناريو التشغيل الفعلي، قد ترغب في تمرير totalWeeklyPlatformEarningsBN بين المهام
        // أو التأكد من أن الفترة الزمنية متطابقة تمامًا.
        console.log(`${JOB_NAME} Calculating platform earnings from DB for period: ${calculationStartDate.toISOString()} to ${calculationEndDate.toISOString()}`);
        const totalWeeklyPlatformEarningsBigInt = await getTotalPlatformEarningsForPeriod(calculationStartDate, calculationEndDate);
        const totalWeeklyPlatformEarningsBN = new anchor.BN(totalWeeklyPlatformEarningsBigInt.toString());
        console.log(`${JOB_NAME} DEBUG: Total Weekly Platform Earnings (BN): ${totalWeeklyPlatformEarningsBN.toString()}`);

        if (totalWeeklyPlatformEarningsBN.lte(BN_ZERO)) {
            console.log(`${JOB_NAME} EXIT: No platform earnings this week. No closer rewards to distribute.`);
            return distributionResults;
        }

        // 2. حساب مجمع مكافآت المغلقين (1% من أرباح الأسبوع)
        const closerRewardPool = totalWeeklyPlatformEarningsBN.mul(REWARD_PERCENTAGE).div(new anchor.BN(100));
        console.log(`${JOB_NAME} DEBUG: Closer reward pool (1% of weekly earnings): ${closerRewardPool.toString()}`);
        if (closerRewardPool.lte(BN_ZERO)) { // <-- Corrected
            console.log(`${JOB_NAME} EXIT: Closer reward pool is zero.`);
            return distributionResults; // <-- Return empty array
        }

        const topClosers = await getTopClosersByWeeklyCount(10);
        const numberOfWinners = topClosers.length;
        console.log(`${JOB_NAME} DEBUG: Number of potential closer winners: ${numberOfWinners}`);
        if (numberOfWinners === 0) {
            console.log(`${JOB_NAME} EXIT: No eligible top closers found.`); // <-- سجل الخروج
            return distributionResults; // <-- Return empty array
        }

        const individualShare = closerRewardPool.div(new anchor.BN(numberOfWinners));
        console.log(`${JOB_NAME} DEBUG: Individual closer share (BN): ${individualShare.toString()}`);
        if (individualShare.lte(BN_ZERO)) { // <-- Corrected
            console.log(`${JOB_NAME} EXIT: Individual closer share is zero.`);
            return distributionResults; // <-- Return empty array
         }

         const recipientPubkeys = topClosers.map(winner => new PublicKey(winner.user));
         const amountsBN = topClosers.map(() => individualShare);
 
         console.log(`${JOB_NAME} INFO: Proceeding to call distributeRewardsViaContract for Top Closers...`);
         // *** تمرير mainTreasuryKeypair كمصدر للأموال ***
         const txSignature = await distributeRewardsViaContract(
             mainTreasuryKeypair, adminAuthorityKeypair, recipientPubkeys, amountsBN, "Top Closers"
         );
         console.log(`${JOB_NAME} INFO: Top Closers distribution successful. Tx: ${txSignature}`);

        topClosers.forEach(winner => {
            distributionResults.push({ /* ... populate results ... */
                 recipient: winner.user, amount: individualShare.toNumber(), signature: txSignature,
                 status: 'Success', reason: 'Top Closer', weeklyScore: winner.weeklyClosedAccounts
            });
        });
        await sendWeeklyTopReport("✨ Weekly Top Closers!", distributionResults, 'weeklyScore', 'Accounts Closed');

    } catch (error) {
        console.error(`[${new Date().toISOString()}] !!! ${JOB_NAME} UNCAUGHT ERROR During Execution !!!`, error);
        // في حالة الخطأ، distributionResults ستكون فارغة أو تحتوي على نتائج جزئية
    } finally {
        console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Finished Execution ---`);
    }
    return distributionResults; // أرجع النتائج دائمًا
}

module.exports = {
    distributeTopReferrerRewards,
    distributeTopCloserRewards,
};