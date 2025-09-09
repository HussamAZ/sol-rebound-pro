// backend/services/solanaService.js
const { PublicKey, Transaction, SystemProgram, TransactionInstruction, sendAndConfirmTransaction, Keypair, ComputeBudgetProgram } = require('@solana/web3.js');
const { Buffer } = require('buffer');
const {
    getConnection,
    getProgram,
    //getProvider, // قد لا نحتاجه مباشرة هنا ولكن من الجيد استيراده
    getServerWallet,
    getProgramId,
    getTreasuryPublicKey,
    getTokenProgramId,
    getSystemProgramId,
    //getFinalStoragePublicKey, // قد نحتاجه لاحقًا لإدارة الخزينة
    //getAdminAuthorityPublicKey // قد نحتاجه لاحقًا لإدارة الخزينة
} = require('../config/solana');
// --- لا نستورد الثوابت الحسابية هنا ---

// --- ثوابت إعادة المحاولة للتحقق ---
const MAX_VERIFY_RETRIES = 5; // عدد المحاولات
const VERIFY_RETRY_DELAY_MS = 2000; // التأخير بين المحاولات (2 ثانية)

// --- دالة تأخير مساعدة ---
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));


/**
 * يبني معاملة Solana لإغلاق حسابات ATA متعددة يدويًا.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم (دافع الرسوم).
 * @param {string[]} ataAddresses - مصفوفة من عناوين ATA المراد إغلاقها.
 * @param {string|null} referrerPublicKeyString - المفتاح العام للمحيل (اختياري).
 * @param {number} rentPerAtaLamports - قيمة الإيجار لكل حساب (من الثوابت).
 * @param {number} platformFeePercent - نسبة رسوم المنصة (من الثوابت).
 * @returns {Promise<{transactionBase64: string, platformFeeLamports: string}>} - كائن يحتوي على المعاملة المسلسلة base64 ورسوم المنصة المقدرة.
 * @throws {Error} إذا فشلت عملية التحضير أو التحقق من المدخلات.
 */
async function prepareCloseMultipleATAsTransaction(
    userPublicKeyString,
    ataAddresses,
    originalReferrerFromDB,
    rentPerAtaLamports,
    platformFeePercent
) {
    console.log("SolanaService: Preparing close transaction...");
    const connection = getConnection();
    const programId = getProgramId();
    const treasuryPublicKey = getTreasuryPublicKey();
    const tokenProgramId = getTokenProgramId();
    const systemProgramId = getSystemProgramId();
    const program = getProgram();

    if (!connection || !programId || !treasuryPublicKey || !tokenProgramId || !systemProgramId || !program?.coder) {
        throw new Error("Solana configuration not fully initialized.");
    }

    const userPublicKey = new PublicKey(userPublicKeyString);
    const ataPubkeys = ataAddresses.map(addr => new PublicKey(addr));
    if (ataPubkeys.length === 0) throw new Error("No ATA addresses provided.");

    // --- دالة مساعدة داخلية لبناء المعاملة ---
    const buildTransaction = (includeReferrer) => {
        let referrerPk = null;
        if (includeReferrer && originalReferrerFromDB) {
            try {
                referrerPk = new PublicKey(originalReferrerFromDB);
            } catch (e) {
                console.warn(`Invalid referrer format (${originalReferrerFromDB}), building tx without it.`);
                referrerPk = null;
            }
        }

        const keys = [
            { pubkey: userPublicKey, isSigner: true, isWritable: true },
            { pubkey: treasuryPublicKey, isSigner: false, isWritable: true },
            { pubkey: tokenProgramId, isSigner: false, isWritable: false },
            { pubkey: systemProgramId, isSigner: false, isWritable: false },
            ...ataPubkeys.map(pubkey => ({ pubkey, isSigner: false, isWritable: true })),
        ];

        if (referrerPk) {
            keys.push({ pubkey: referrerPk, isSigner: false, isWritable: true });
        }
        
        const instructionData = program.coder.instruction.encode("close_multiple_atas", {
            referrerKey: referrerPk,
        });

        const instruction = new TransactionInstruction({
            keys: keys,
            programId: programId,
            data: instructionData,
        });

        const transaction = new Transaction();
        // إضافة تعليمات لزيادة الـ Compute Units لتجنب الأخطاء في المعاملات الكبيرة
        const requiredCUs = 200000 + (ataAddresses.length * 25000);
        transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: requiredCUs }));
        
        transaction.add(instruction);

        transaction.feePayer = userPublicKey;
        console.log(`Transaction built ${referrerPk ? 'WITH' : 'WITHOUT'} referrer.`);
        return transaction;
    };
    // --- نهاية الدالة المساعدة ---

    // الخطوة 1: بناء المعاملة الأصلية مع المحيل (إذا كان موجودًا)
    let transaction = buildTransaction(true);

    // الخطوة 2: محاكاة المعاملة
    if (originalReferrerFromDB) { // فقط قم بالمحاكاة إذا كان هناك محيل لمحاولة تحويل الأموال إليه
        try {
            console.log("Simulating transaction WITH referrer...");
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            const simulationResult = await connection.simulateTransaction(transaction);

            if (simulationResult.value.err) {
                console.warn("Transaction simulation WITH referrer FAILED. Error:", simulationResult.value.err);
                console.log("Re-building transaction WITHOUT referrer as a fallback.");
                // إذا فشلت المحاكاة، قم ببناء المعاملة من جديد بدون المحيل
                transaction = buildTransaction(false);
            } else {
                console.log("Transaction simulation WITH referrer SUCCEEDED.");
            }
        } catch (simError) {
            console.error("CRITICAL error during simulation:", simError);
            console.log("Re-building transaction WITHOUT referrer as a fallback due to critical simulation error.");
            transaction = buildTransaction(false);
        }
    }

    // الخطوة 3: إعداد المعاملة النهائية وإرسالها
    const latestBlockhashResult = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latestBlockhashResult.blockhash;
    
    const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
    const transactionBase64 = serializedTransaction.toString('base64');
    
    const totalEstimatedRent = BigInt(ataPubkeys.length) * BigInt(rentPerAtaLamports);
    const platformFeeLamports = (totalEstimatedRent * BigInt(platformFeePercent)) / BigInt(100);

    return { transactionBase64, platformFeeLamports: platformFeeLamports.toString() };
}

/**
 * يتحقق من صحة معاملة على شبكة Solana مع آلية إعادة محاولة.
 * @param {string} signature - توقيع المعاملة.
 * @param {string} expectedFeePayerString - المفتاح العام المتوقع لدافع الرسوم.
 * @param {number} [maxRetries=5] - الحد الأقصى لعدد محاولات التحقق.
 * @param {number} [retryDelayMs=2000] - التأخير بين محاولات التحقق بالمللي ثانية.
 * @returns {Promise<boolean>} - يُرجع true إذا كانت المعاملة ناجحة والموقع هو المتوقع.
 * @throws {Error} إذا فشل التحقق أو كانت المعاملة غير صالحة بعد المحاولات.
 */
async function verifyTransaction(
    signature,
    expectedFeePayerString,
    maxRetries = 5,     // <--- استخدم المعامل
    retryDelayMs = 2000 // <--- استخدم المعامل
) {
    console.log(`SolanaService: Verifying transaction ${signature} for fee payer ${expectedFeePayerString} (Max Retries: ${maxRetries}, Delay: ${retryDelayMs})`);
    const connection = getConnection();
    if (!connection) {
        console.error("SolanaService Error: Solana connection not initialized.");
        throw new Error("Solana connection not initialized.");
    }

    let tx = null;
    let attempt = 0;

    while (!tx && attempt < maxRetries) { // <--- استخدم maxRetries
        attempt++;
        console.log(`Verification attempt ${attempt}/${maxRetries} for tx ${signature}...`);
        try {
            tx = await connection.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
            if (tx) {
                console.log(`Transaction ${signature} found on attempt ${attempt}.`);
                break;
            }
        } catch (error) {
            console.warn(`Attempt ${attempt} failed to get transaction ${signature}:`, error.message);
        }

        if (!tx && attempt < maxRetries) { // <--- استخدم maxRetries
            console.log(`Transaction not found yet, waiting ${retryDelayMs}ms before retry...`); // <--- استخدم retryDelayMs
            await delay(retryDelayMs); // <--- استخدم retryDelayMs
        }
    }

    if (!tx) {
        console.error(`SolanaService Verification failed: Transaction ${signature} not found or not confirmed after ${maxRetries} attempts.`);
        throw new Error(`Transaction ${signature} not found or not confirmed yet.`);
    }

    // ... (باقي منطق verifyTransaction كما هو)
    try {
        if (tx.meta?.err) {
            const txError = JSON.stringify(tx.meta.err);
            console.error(`SolanaService Verification failed: Transaction ${signature} failed on-chain: ${txError}`);
            throw new Error(`Transaction ${signature} failed on-chain: ${txError}`);
        }
        if (!tx.transaction.message.accountKeys || tx.transaction.message.accountKeys.length === 0) {
            console.error(`SolanaService Verification failed: Cannot find accountKeys in transaction message for ${signature}.`);
            throw new Error(`Cannot find accountKeys in transaction message for ${signature}.`);
        }
        const feePayerAccountKeyObject = tx.transaction.message.accountKeys[0];
        if (!feePayerAccountKeyObject) {
            console.error(`SolanaService Verification failed: Could not get fee payer account key object for ${signature}.`);
            throw new Error(`Could not get fee payer account key object for ${signature}.`);
        }
        const feePayerKey = feePayerAccountKeyObject.toBase58();
        console.log(`SolanaService DEBUG: Found Fee Payer in tx ${signature}: ${feePayerKey}`);
        if (feePayerKey !== expectedFeePayerString) {
             console.error(`SolanaService Verification failed: Transaction Fee Payer mismatch for ${signature}. Expected ${expectedFeePayerString}, got ${feePayerKey}`);
             throw new Error(`Transaction fee payer mismatch.`);
        }
        console.log(`--- SolanaService: Transaction ${signature} verified successfully on-chain (after ${attempt} attempts). Fee payer matches. ---`);
        return true;
    } catch (error) {
         console.error(`!!! SolanaService ERROR during post-fetch verification for ${signature}:`, error);
         throw error;
    }
}



/**
 * يرسل مبلغًا من SOL من محفظة الخادم الساخنة إلى مستلم.
 * @param {string} recipientPublicKeyString - المفتاح العام للمستلم.
 * @param {number|bigint} amountLamports - المبلغ المراد إرساله بالـ lamports (سيتم تحويله إلى BigInt).
 * @returns {Promise<string>} - توقيع المعاملة الناجحة.
 * @throws {Error} إذا فشلت العملية (رصيد غير كاف، خطأ في الإرسال/التأكيد).
 */
async function sendSolFromHotWallet(recipientPublicKeyString, amountLamports) {
    // ... (الكود كما هو، سيعتمد على sendAndConfirmTransaction المحاكاة)
    console.log(`SolanaService (sendSolFromHotWallet): Attempting to send ${amountLamports} lamports to ${recipientPublicKeyString}`);
    const { Connection, Keypair, PublicKey, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js'); // استيراد محلي
    const connection = getConnection();
    const serverWalletKeypair = getServerWallet();
    const systemProgramId = getSystemProgramId();

    if (!connection || !serverWalletKeypair || !systemProgramId) {
        throw new Error("Solana configuration, server hot wallet, or system program ID not initialized for sending SOL.");
    }
    const amountToSendBigInt = BigInt(amountLamports);
    if (amountToSendBigInt <= 0) throw new Error("Amount to send must be positive.");

    let recipientPublicKey;
    try { recipientPublicKey = new PublicKey(recipientPublicKeyString); }
    catch (e) { throw new Error(`Invalid recipient public key format: ${recipientPublicKeyString}`); }

    let serverBalance;
    try { serverBalance = await connection.getBalance(serverWalletKeypair.publicKey); }
    catch (e) { throw new Error("Failed to get server hot wallet balance."); }

    const estimatedTxFee = BigInt(5000);
    const requiredBalance = amountToSendBigInt + estimatedTxFee;

    if (BigInt(serverBalance) < requiredBalance) {
        const errorMsg = `Insufficient server hot wallet balance (${serverBalance}) to send ${amountToSendBigInt}. Required: ${requiredBalance}`;
        console.error(`SolanaService CRITICAL: ${errorMsg}`);
        throw new Error(errorMsg);
    }

    let signature = '';
    try {
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: serverWalletKeypair.publicKey,
                toPubkey: recipientPublicKey,
                lamports: amountToSendBigInt,
            })
        );
        transaction.feePayer = serverWalletKeypair.publicKey;
        console.log("SolanaService (sendSolFromHotWallet): Sending and confirming transfer tx...");
        signature = await sendAndConfirmTransaction( // سيستخدم النسخة المحاكاة
            connection,
            transaction,
            [serverWalletKeypair],
            { commitment: 'confirmed', skipPreflight: false }
        );
        console.log(`SolanaService (sendSolFromHotWallet): Transfer successful! Signature: ${signature}`);
        return signature;
    } catch (error) {
        console.error(`!!! SolanaService (sendSolFromHotWallet) ERROR DURING SOL TRANSFER (Tx: ${signature || 'N/A'}) !!!`, error);
        let specificError = error.message;
        if (error.logs) { specificError = `Transaction failed with logs: ${JSON.stringify(error.logs)}`; }
        throw new Error(`Failed to send SOL from Hot Wallet: ${specificError}`);
    }
}


/**
 * يحصل على رصيد SOL لحساب معين.
 * @param {PublicKey} publicKey - المفتاح العام للحساب.
 * @returns {Promise<bigint>} - الرصيد بالـ lamports.
 * @throws {Error} إذا فشل جلب الرصيد.
 */
async function getAccountBalance(publicKey) {
    const connection = getConnection();
    if (!connection) {
        console.error("SolanaService Error: Solana connection not initialized for getAccountBalance.");
        throw new Error("Solana connection not initialized.");
    }
    try {
        const balance = await connection.getBalance(publicKey);
        console.log(`SolanaService: Fetched balance for ${publicKey.toBase58()}: ${balance}`);
        return BigInt(balance);
    } catch (error) {
        console.error(`SolanaService Error: Failed to get balance for ${publicKey.toBase58()}:`, error);
        throw new Error(`Failed to get balance for ${publicKey.toBase58()}: ${error.message}`);
    }
}

// *** دالة جديدة لإرسال SOL من أي حساب يمتلك الـ Backend مفتاحه ***
/**
 * يرسل مبلغًا من SOL من حساب مرسل محدد إلى مستلم.
 * @param {Keypair} fromKeypair - زوج مفاتيح الحساب المرسل (يجب أن يكون لدى الـ Backend المفتاح الخاص).
 * @param {string} toPublicKeyString - المفتاح العام للمستلم.
 * @param {number | bigint} amountLamports - المبلغ المراد إرساله بالـ lamports.
 * @param {string} [transactionLabel="Generic SOL Transfer"] - تسمية للمعاملة لأغراض التسجيل.
 * @returns {Promise<string>} - توقيع المعاملة الناجحة.
 * @throws {Error} إذا فشلت العملية.
 */
async function transferSol(fromKeypair, toPublicKeyString, amountLamports, transactionLabel = "Generic SOL Transfer") {
    // ... (الكود كما هو، سيعتمد على sendAndConfirmTransaction المحاكاة)
    console.log(`SolanaService (transferSol - ${transactionLabel}): Attempting to send ${amountLamports} lamports from ${fromKeypair.publicKey.toBase58()} to ${toPublicKeyString}`);
    const { Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js'); // استيراد محلي
    const connection = getConnection();

    if (!connection || !fromKeypair) {
        throw new Error(`Solana configuration or sender keypair not initialized for transferSol (${transactionLabel}).`);
    }
    const amountToSendBigInt = BigInt(amountLamports);
    if (amountToSendBigInt <= 0) {
        throw new Error(`Amount to send must be positive for ${transactionLabel}, got ${amountLamports}.`);
    }
    let toPublicKey;
    try { toPublicKey = new PublicKey(toPublicKeyString); }
    catch (e) { throw new Error(`Invalid recipient public key format (${toPublicKeyString}) for ${transactionLabel}: ${e.message}`); }

    let fromBalance;
    try { fromBalance = await connection.getBalance(fromKeypair.publicKey); }
    catch (e) { throw new Error(`Failed to get sender (${fromKeypair.publicKey.toBase58()}) balance for ${transactionLabel}: ${e.message}`);}

    const estimatedTxFee = BigInt(5000);
    const requiredBalance = amountToSendBigInt + estimatedTxFee;

    if (BigInt(fromBalance) < requiredBalance) {
        const errorMsg = `Insufficient balance in sender account ${fromKeypair.publicKey.toBase58()} (${fromBalance} lamports) to send ${amountToSendBigInt} for ${transactionLabel}. Required: ${requiredBalance}`;
        console.error(`SolanaService CRITICAL: ${errorMsg}`);
        throw new Error(errorMsg);
    }
    let signature = '';
    try {
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: fromKeypair.publicKey,
                toPubkey: toPublicKey,
                lamports: amountToSendBigInt,
            })
        );
        transaction.feePayer = fromKeypair.publicKey;
        console.log(`SolanaService (transferSol - ${transactionLabel}): Sending and confirming transaction...`);
        signature = await sendAndConfirmTransaction( // سيستخدم النسخة المحاكاة
            connection,
            transaction,
            [fromKeypair],
            { commitment: 'confirmed', skipPreflight: false }
        );
        console.log(`SolanaService (transferSol - ${transactionLabel}): Transfer successful! Signature: ${signature}`);
        return signature;
    } catch (error) {
        console.error(`!!! SolanaService (transferSol - ${transactionLabel}) ERROR DURING SOL TRANSFER (Tx: ${signature || 'N/A'}) !!! From: ${fromKeypair.publicKey.toBase58()} To: ${toPublicKeyString} Amount: ${amountLamports}`, error);
        let specificError = error.message;
        if (error.logs) { specificError = `Transaction failed with logs: ${JSON.stringify(error.logs)}`; }
        throw new Error(`Failed to send SOL for ${transactionLabel}: ${specificError}`);
    }
}


module.exports = {
    prepareCloseMultipleATAsTransaction,
    verifyTransaction,
    sendSolFromHotWallet,
    getAccountBalance,
    transferSol,
};
