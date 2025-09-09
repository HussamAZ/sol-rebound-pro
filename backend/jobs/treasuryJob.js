// backend/jobs/treasuryJob.js
// const referralService = require('../services/referralService'); // لم نعد بحاجة إليه هنا لهذا الغرض
const { getAccountBalance, transferSol } = require('../services/solanaService');
const { getMainTreasuryWallet, getFinalStoragePublicKey } = require('../config/solana');
const { FINAL_STORAGE_TRANSFER_PERCENT, LAMPORTS_PER_SOL, RENT_EXEMPT_RESERVE_LAMPORTS } = require('../config/constants'); // TARGET_HOT_WALLET_BALANCE_SOL لم يعد مستخدمًا هنا

async function runTreasurySweepJob() { // إعادة تسمية الدالة لتعكس وظيفتها الجديدة
    const JOB_NAME = "[Treasury Sweep to Final Storage Cron]";
    console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Starting Execution ---`);

    try {
        const mainTreasuryKeypair = getMainTreasuryWallet();
        const finalStoragePubKey = getFinalStoragePublicKey(); // هذا PubKey فقط

        if (!mainTreasuryKeypair || !finalStoragePubKey) {
            console.error(`${JOB_NAME} CRITICAL: Main Treasury Keypair or Final Storage PubKey not initialized. Aborting.`);
            return;
        }

        console.log(`${JOB_NAME} Using Main Treasury: ${mainTreasuryKeypair.publicKey.toBase58()}`);
        console.log(`${JOB_NAME} Target Final Storage: ${finalStoragePubKey.toBase58()}`);

        // 1. الحصول على الرصيد الحالي للخزانة الرئيسية
        const currentTreasuryBalance = await getAccountBalance(mainTreasuryKeypair.publicKey);
        console.log(`${JOB_NAME} Current Main Treasury balance: ${currentTreasuryBalance.toString()} lamports (${(Number(currentTreasuryBalance) / LAMPORTS_PER_SOL).toFixed(6)} SOL).`);

        if (currentTreasuryBalance <= BigInt(0)) { // أو حد أدنى صغير جدًا
            console.log(`${JOB_NAME} Main Treasury balance is zero or too low. No sweep needed.`);
            return;
        }

        // 2. حساب 99% من هذا الرصيد لتحويله
	// احسب المبلغ المتاح للتحويل (كل شيء فوق حد الإيجار)
	const availableToSweep = currentTreasuryBalance - BigInt(RENT_EXEMPT_RESERVE_LAMPORTS);

	if (availableToSweep <= BigInt(0)) {
	    console.log(`${JOB_NAME} Treasury balance is below rent-exempt reserve. No sweep needed.`);
	    return;
	}

	// الآن، احسب 99% من المبلغ المتاح فقط
	const amountToSweep = (availableToSweep * BigInt(FINAL_STORAGE_TRANSFER_PERCENT)) / BigInt(100);
        console.log(`${JOB_NAME} Calculated amount to sweep (99%): ${amountToSweep.toString()} lamports.`);

        if (amountToSweep <= BigInt(0)) {
            console.log(`${JOB_NAME} Sweep amount is zero or less after calculation. No transfer needed.`);
            return;
        }

        // 3. تحويل المبلغ من الخزانة الرئيسية إلى التخزين النهائي
        console.log(`${JOB_NAME} Attempting to sweep ${amountToSweep} lamports from Main Treasury to Final Storage (${finalStoragePubKey.toBase58()}).`);
        const signature = await transferSol(
            mainTreasuryKeypair,       // المرسل (Keypair)
            finalStoragePubKey.toBase58(), // المستلم (PublicKey string)
            amountToSweep,             // المبلغ
            "Treasury Sweep to Final Storage" // تسمية المعاملة
        );
        console.log(`${JOB_NAME} Successfully swept funds to Final Storage. Transaction signature: ${signature}`);
        // --- !!! إعادة جلب الرصيد بعد التحويل لعرضه في التقرير !!! ---
        let remainingTreasuryBalance = BigInt(0); // قيمة افتراضية
        try {
            remainingTreasuryBalance = await getAccountBalance(mainTreasuryKeypair.publicKey);
        } catch (balanceError) {
            console.error(`${JOB_NAME} WARNING: Failed to fetch remaining treasury balance after sweep. Reporting might be inaccurate.`, balanceError);
        }
        // ---------------------------------------------------------------

        // التقرير القديم لم يعد منطقيًا بنفس الشكل، يمكن إزالته أو تعديله لعرض ما تم
        console.log("---");
        console.log("--- Treasury Sweep Report ---");
        console.log(`- Report Generated: ${new Date().toISOString()}`);
        console.log(`- Amount Swept from Main Treasury to Final Storage: ${amountToSweep.toString()} Lamports (${(Number(amountToSweep) / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
        // --- !! استخدام الرصيد الذي تم جلبه للتو !! ---
        console.log(`- Remaining Main Treasury Balance (Actual): ${remainingTreasuryBalance.toString()} Lamports (${(Number(remainingTreasuryBalance) / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
        console.log("--- End of Report ---");
        // -------------------------------------------------------------------
        console.log(`- Remaining Main Treasury Balance: ${remainingTreasuryBalance.toString()} Lamports (${(Number(remainingTreasuryBalance) / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
        console.log("--- End of Report ---");

    } catch (error) {
        console.error(`[${new Date().toISOString()}] !!! ${JOB_NAME} UNCAUGHT ERROR During Execution !!!`, error);
    } finally {
        console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Finished Execution ---`);
    }
}

module.exports = {
    runTreasurySweepJob, // تصدير الدالة بالاسم الجديد
};
