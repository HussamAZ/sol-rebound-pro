import * as fs from 'fs';
import anchor from "@coral-xyz/anchor"; // الاستيراد الافتراضي
const { Program, AnchorProvider, Wallet, web3 } = anchor; // استخراج القيم الأساسية
// استيراد BN كقيمة بالطريقة المقترحة
const { BN } = anchor; // <-- الوصول لـ BN من الكائن المستورد افتراضيًا
// استيراد باقي المكتبات (spl-token, chai, etc.)
import { LAMPORTS_PER_SOL, SystemProgram, Transaction, Keypair } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, getAccount, mintTo, } from "@solana/spl-token";
import { expect } from "chai"; // استخدام expect من chai
// --- الثوابت (كما في العقد) ---
const RENT_PER_EMPTY_ATA_BN = new BN(2039280); // استخدام BN للاتساق
const PLATFORM_FEE_PERCENT = new BN(25);
const REFERRAL_COMMISSION_PERCENT = new BN(25);
let authorityKeypair;
const authorityKeypairPath = "D:/MySecureKeys/Solana/contract-authority.json";
try {
    const authoritySecretKeyString = fs.readFileSync(authorityKeypairPath, 'utf-8');
    const authoritySecretKey = Uint8Array.from(JSON.parse(authoritySecretKeyString));
    authorityKeypair = Keypair.fromSecretKey(authoritySecretKey);
    console.log(`Authority Keypair loaded: ${authorityKeypair.publicKey.toBase58()}`);
    // التحقق من تطابق المفتاح العام (اختياري لكن جيد)
    const expectedAuthorityString = "2UrhEmCmL7BUheGdECDePZFB24mPbipqYXk2wPqbXa6f";
    expect(authorityKeypair.publicKey.toBase58()).to.equal(expectedAuthorityString, "Loaded authority key mismatch!");
}
catch (err) {
    console.error(`!!! CRITICAL ERROR loading authority keypair from ${authorityKeypairPath}:`, err);
    throw err;
}
describe("ata-claim", () => {
    // --- الإعداد العام للـ Provider والبرنامج ---
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;
    // المحفظة التي ستدفع رسوم إنشاء الحسابات في الإعداد (ممولة بواسطة anchor test)
    const payerWallet = provider.wallet.payer; // استخدم WalletType المستورد كنوع
    console.log(`Test Payer Wallet (from Anchor Env): ${payerWallet.publicKey.toBase58()}`);
    const program = anchor.workspace.AtaClaim; // استخدم ProgramType المستورد كنوع
    console.log(`Program ID for testing: ${program.programId.toBase58()}`);
    // --- تعريف المتغيرات العامة للحسابات ---
    let mint;
    const treasury = Keypair.generate(); // حساب الخزينة (سيتم تمويله)
    let userKeypair; // المستخدم الذي سيقوم بالإغلاق (سيتم تمويله)
    // --- دالة مساعدة لجلب الرصيد ---
    const getBalance = async (publicKey) => {
        const balanceLamports = await connection.getBalance(publicKey);
        // التحقق مما إذا كان الرصيد null (قد يحدث إذا لم يتم العثور على الحساب)
        if (balanceLamports === null) {
            console.warn(`Warning: getBalance returned null for ${publicKey.toBase58()}. Returning BN(0).`);
            return new BN(0); // إرجاع صفر إذا لم يتم العثور على الرصيد
        }
        // إذا كان الرصيد ليس null، قم بإنشاء BN
        return new BN(balanceLamports);
    };
    // --- الإعداد العام قبل جميع الاختبارات ---
    async function ensureFunded(accountPublicKey, minLamports, payer, label) {
        console.log(`Ensuring account ${label} (${accountPublicKey.toBase58()}) is funded with at least ${minLamports.toString()} lamports...`);
        let currentBalance = await getBalance(accountPublicKey); // استخدم دالتنا المعدلة
        let attempts = 0;
        const maxAttempts = 5; // عدد محاولات الـ airdrop
        const retryDelayMs = 2000; // تأخير بين المحاولات (2 ثانية)
        const airdropAmount = new BN(LAMPORTS_PER_SOL); // طلب 1 SOL في كل مرة
        // استخدام BN كقيمة (من const { BN } = anchor) لا يزال صحيحًا هنا
        while (currentBalance.lt(minLamports) && attempts < maxAttempts) {
            attempts++;
            console.log(`Attempt ${attempts}/${maxAttempts}: ${label} balance is ${currentBalance.toString()}, below ${minLamports.toString()}. Requesting funding transfer...`); // تغيير الرسالة قليلاً
            try {
                // استخدام payer لتمويل الحساب مباشرة
                const tx = new Transaction().add(SystemProgram.transfer({
                    fromPubkey: payer.publicKey,
                    toPubkey: accountPublicKey,
                    lamports: airdropAmount.toNumber(), // تحويل إلى رقم هنا
                }));
                const sig = await provider.sendAndConfirm(tx, [payer], { commitment: "confirmed", skipPreflight: true });
                console.log(`Funding transfer sent for ${label}. Sig: ${sig}`);
                // انتظر قليلاً قبل التحقق من الرصيد مرة أخرى
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                currentBalance = await getBalance(accountPublicKey);
            }
            catch (error) {
                console.warn(`Warning: Funding transfer attempt ${attempts} for ${label} failed:`, error.message);
                // انتظر قبل المحاولة التالية حتى لو فشل الطلب
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            }
        }
        if (currentBalance.lt(minLamports)) {
            throw new Error(`Failed to fund account ${label} (${accountPublicKey.toBase58()}) to required balance ${minLamports.toString()} after ${maxAttempts} attempts. Current balance: ${currentBalance.toString()}`);
        }
        console.log(`Account ${label} (${accountPublicKey.toBase58()}) funded successfully. Current balance: ${currentBalance.toString()}`);
    }
    // --- الإعداد العام قبل جميع الاختبارات (باستخدام ensureFunded) ---
    before(async () => {
        console.log("Global Setup (before all tests) - Connecting to MANUAL validator...");
        // خطوة 0: تحقق أساسي من الاتصال بالمدقق اليدوي
        try {
            await new Promise(resolve => setTimeout(resolve, 1000)); // انتظار قصير جدًا
            const version = await connection.getVersion();
            console.log(`Connected to Manual Validator. Solana Core Version: ${version['solana-core']}`);
        }
        catch (err) {
            console.error("!!! CRITICAL ERROR: Failed to connect to the manually running validator. Is it running correctly?", err);
            throw err;
        }
        // خطوة 1: التحقق من وجود أرصدة للحسابات المحملة (لا حاجة لـ BN هنا للتحقق الأولي)
        console.log("Verifying pre-loaded accounts...");
        const payerBalanceLamports = await connection.getBalance(payerWallet.publicKey);
        const authorityBalanceLamports = await connection.getBalance(authorityKeypair.publicKey); // authorityKeypair تم تحميله من الملف في بداية الاختبار
        console.log(`Pre-loaded Payer Wallet (FcjMow...) Balance: ${payerBalanceLamports / LAMPORTS_PER_SOL} SOL`);
        console.log(`Pre-loaded Authority (2Urh...) Balance: ${authorityBalanceLamports / LAMPORTS_PER_SOL} SOL`);
        if (payerBalanceLamports === null || payerBalanceLamports < LAMPORTS_PER_SOL) {
            throw new Error(`Payer wallet ${payerWallet.publicKey.toBase58()} not loaded correctly by validator.`);
        }
        if (authorityBalanceLamports === null || authorityBalanceLamports < LAMPORTS_PER_SOL / 2) {
            throw new Error(`Authority wallet ${authorityKeypair.publicKey.toBase58()} not loaded correctly by validator.`);
        }
        console.log("Pre-loaded accounts verified.");
        // خطوة 2: تمويل الحسابات الديناميكية (Treasury, User) باستخدام Payer المحمل مسبقًا
        console.log(`Funding treasury account ${treasury.publicKey.toBase58()}...`);
        await provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({
            fromPubkey: payerWallet.publicKey,
            toPubkey: treasury.publicKey,
            lamports: 1 * LAMPORTS_PER_SOL,
        })), [payerWallet], // Payer (FcjMow...) يوقع
        { commitment: "confirmed", skipPreflight: true });
        console.log("Dynamic accounts (Treasury, User) funded.");
        // خطوة 3: إنشاء Mint باستخدام Payer المحمل مسبقًا
        console.log("Creating test mint...");
        try {
            mint = await createMint(connection, payerWallet, payerWallet.publicKey, null, 0);
            console.log(`Test mint created: ${mint.toBase58()}`);
        }
        catch (error) {
            console.error("!!! CRITICAL ERROR creating mint:", error);
            throw error;
        }
        console.log("Global Setup with MANUAL validator complete.");
    }); // نهاية before
    // --- اختبارات close_multiple_atas ---
    describe("close_multiple_atas", () => {
        let userKeypair;
        let userAta1; // حساب ATA للاختبار
        // --- إعداد قبل كل اختبار في هذه المجموعة ---
        beforeEach(async () => {
            // !! إنشاء وتمويل مستخدم جديد لكل اختبار !!
            userKeypair = Keypair.generate();
            console.log(`Funding NEW test user ${userKeypair.publicKey.toBase58()} for this test...`);
            await provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({
                fromPubkey: payerWallet.publicKey,
                toPubkey: userKeypair.publicKey,
                lamports: 2 * LAMPORTS_PER_SOL, // موله بشكل كافٍ
            })), [payerWallet], { commitment: "confirmed", skipPreflight: true });
            console.log(`User funded.`);
            console.log(`Setting up ATA for NEW user ${userKeypair.publicKey.toBase58()} in beforeEach...`);
            const ataInfo = await getOrCreateAssociatedTokenAccount(connection, payerWallet, // Payer for creation
            mint, // Mint الأصلي الذي تم إنشاؤه في before all
            userKeypair.publicKey // Owner of the ATA (المستخدم الجديد)
            );
            userAta1 = ataInfo.address;
            console.log(`ATA created/found for test: ${userAta1.toBase58()}`);
            // التأكد من أن رصيد التوكن صفر وأن رصيد اللامبورت هو الإيجار
            const ataAccountInfo = await getAccount(connection, userAta1);
            expect(ataAccountInfo.amount.toString()).to.equal('0', "ATA token amount should be 0 initially");
            const ataLamports = await getBalance(userAta1);
            expect(ataLamports.eq(RENT_PER_EMPTY_ATA_BN), `ATA lamport balance should be 
            ${RENT_PER_EMPTY_ATA_BN.toString()}`).to.be.true;
        });
        // --- نهاية beforeEach ---
        // --- حالة الاختبار الأولى ---
        it("Closes a single empty ATA without a referrer", async () => {
            // 1. قراءة الأرصدة قبل العملية
            const userBalanceBefore = await getBalance(userKeypair.publicKey);
            const treasuryBalanceBefore = await getBalance(treasury.publicKey);
            const ataLamportsBefore = await getBalance(userAta1); // يجب أن يكون مساويًا لـ RENT_PER_EMPTY_ATA_BN
            // 2. استدعاء تعليمة العقد
            const txSignature = await program.methods
                .closeMultipleAtas(null) // لا يوجد محيل (null)
                .accounts({
                user: userKeypair.publicKey,
                treasury: treasury.publicKey,
                // tokenProgram و systemProgram يتم استنتاجهما بواسطة Anchor
            })
                .remainingAccounts([
                // قائمة الحسابات المراد إغلاقها
                { pubkey: userAta1, isSigner: false, isWritable: true },
            ])
                .signers([userKeypair]) // المستخدم هو من يوقع لتفويض الإغلاق
                .rpc({ commitment: "confirmed" }); // إرسال وانتظار التأكيد
            console.log("Single close (no referrer) tx confirmed:", txSignature);
            // 3. التحقق من أن حساب ATA تم إغلاقه بالفعل
            let errorFound = false;
            try {
                await getAccount(connection, userAta1); // محاولة جلب الحساب المغلق
            }
            catch (error) {
                // نتوقع خطأ TokenAccountNotFoundError
                console.log("Caught expected error after closing ATA:", error.name);
                expect(error.name).to.equal("TokenAccountNotFoundError");
                errorFound = true;
            }
            expect(errorFound, "Expected getAccount to throw TokenAccountNotFoundError").to.be.true;
            // 4. التحقق من تغير الأرصدة
            const userBalanceAfter = await getBalance(userKeypair.publicKey);
            const treasuryBalanceAfter = await getBalance(treasury.publicKey);
            // حسابات متوقعة
            const totalRentRecovered = ataLamportsBefore; // نفس رصيد ATA قبل الإغلاق
            const expectedPlatformFee = totalRentRecovered.mul(PLATFORM_FEE_PERCENT).div(new BN(100));
            // لا يوجد محيل، لذا العمولة صفر، ورسوم الخزينة = رسوم المنصة
            const feeToTreasuryExpected = expectedPlatformFee;
            // التحقق من رصيد الخزينة
            const treasuryBalanceChange = treasuryBalanceAfter.sub(treasuryBalanceBefore);
            console.log(`Treasury balance change: ${treasuryBalanceChange.toString()}. Expected: ${feeToTreasuryExpected.toString()}`);
            expect(treasuryBalanceChange.eq(feeToTreasuryExpected), "Treasury balance did not increase by the expected fee").to.be.true;
            // التحقق من رصيد المستخدم
            // المستخدم يستعيد الإيجار ويطرح منه رسوم المنصة + يدفع رسوم المعاملة
            const expectedUserIncreaseNet = totalRentRecovered.sub(expectedPlatformFee);
            const userBalanceChange = userBalanceAfter.sub(userBalanceBefore);
            // الفرق بين التغير الفعلي والمتوقع يجب أن يكون سالبًا ويمثل رسوم المعاملة
            const difference = userBalanceChange.sub(expectedUserIncreaseNet);
            const maxTxFee = new BN(15000); // تقدير أقصى لرسوم المعاملة بالـ lamports
            console.log(`User balance change: ${userBalanceChange.toString()}. Expected net increase: ${expectedUserIncreaseNet.toString()}. Difference (Tx Fee): ${difference.toString()}`);
            // يجب أن يكون الفرق سالبًا (خسر رسوم المعاملة)
            expect(difference.lten(0), `Difference (${difference}) should be less than or equal to 0`).to.be.true;
            // يجب أن يكون الفرق أكبر من أو يساوي سالب الحد الأقصى لرسوم المعاملة
            expect(difference.gten(maxTxFee.neg()), `Difference (${difference}) should be greater than or equal to negative maxTxFee (-${maxTxFee})`).to.be.true;
        }); // نهاية it(...)
        it("Closes multiple (2) empty ATAs without a referrer", async () => {
            // userAta1 تم إنشاؤه بواسطة beforeEach باستخدام mint الأصلي
            // 1. إنشاء Mint جديد لهذا الاختبار
            console.log("Creating a second mint for multiple close test...");
            const mint2 = await createMint(connection, payerWallet, payerWallet.publicKey, null, 0);
            console.log(`Second mint created: ${mint2.toBase58()}`);
            // 2. إنشاء ATA ثاني باستخدام Mint الجديد
            console.log("Setting up second ATA using the second mint...");
            const ataInfo2 = await getOrCreateAssociatedTokenAccount(connection, payerWallet, mint2, // <-- استخدام Mint الجديد
            userKeypair.publicKey);
            const userAta2 = ataInfo2.address;
            console.log(`Second ATA created/found (using mint2): ${userAta2.toBase58()}`);
            // التحقق من أنه مختلف عن الأول (يجب أن يكون كذلك لأنه لمينت مختلف)
            expect(userAta1.toBase58()).to.not.equal(userAta2.toBase58(), "ATAs should be distinct due to different mints");
            // 3. قراءة الأرصدة قبل العملية
            const userBalanceBefore = await getBalance(userKeypair.publicKey);
            const treasuryBalanceBefore = await getBalance(treasury.publicKey);
            const ata1LamportsBefore = await getBalance(userAta1);
            const ata2LamportsBefore = await getBalance(userAta2);
            // تأكد من أن رصيد ATA الثاني هو الإيجار أيضًا
            expect(ata2LamportsBefore.eq(RENT_PER_EMPTY_ATA_BN), `ATA2 lamport balance should be ${RENT_PER_EMPTY_ATA_BN.toString()}`).to.be.true;
            // 4. استدعاء تعليمة العقد لحسابين (يبقى كما هو)
            const txSignature = await program.methods
                .closeMultipleAtas(null)
                .accounts({
                user: userKeypair.publicKey,
                treasury: treasury.publicKey,
            })
                .remainingAccounts([
                { pubkey: userAta1, isSigner: false, isWritable: true },
                { pubkey: userAta2, isSigner: false, isWritable: true },
            ])
                .signers([userKeypair])
                .rpc({ commitment: "confirmed" });
            console.log("Multiple close (no referrer) tx confirmed:", txSignature);
            // 5. التحقق من إغلاق كلا الحسابين (يبقى كما هو)
            let error1Found = false;
            let error2Found = false;
            try {
                await getAccount(connection, userAta1);
            }
            catch (e) {
                expect(e.name).to.equal("TokenAccountNotFoundError");
                error1Found = true;
            }
            try {
                await getAccount(connection, userAta2);
            }
            catch (e) {
                expect(e.name).to.equal("TokenAccountNotFoundError");
                error2Found = true;
            }
            expect(error1Found, "ATA1 should be closed").to.be.true;
            expect(error2Found, "ATA2 should be closed").to.be.true;
            // 6. التحقق من تغير الأرصدة (يبقى كما هو)
            const userBalanceAfter = await getBalance(userKeypair.publicKey);
            const treasuryBalanceAfter = await getBalance(treasury.publicKey);
            const totalRentRecovered = ata1LamportsBefore.add(ata2LamportsBefore);
            const expectedPlatformFee = totalRentRecovered.mul(PLATFORM_FEE_PERCENT).div(new BN(100));
            const feeToTreasuryExpected = expectedPlatformFee;
            const treasuryBalanceChange = treasuryBalanceAfter.sub(treasuryBalanceBefore);
            console.log(`Treasury balance change (multiple): ${treasuryBalanceChange.toString()}. Expected: ${feeToTreasuryExpected.toString()}`);
            expect(treasuryBalanceChange.eq(feeToTreasuryExpected), "Treasury balance mismatch (multiple)").to.be.true;
            const expectedUserIncreaseNet = totalRentRecovered.sub(expectedPlatformFee);
            const userBalanceChange = userBalanceAfter.sub(userBalanceBefore);
            const difference = userBalanceChange.sub(expectedUserIncreaseNet);
            const maxTxFee = new BN(20000);
            console.log(`User balance change (multiple): ${userBalanceChange.toString()}. Expected net: ${expectedUserIncreaseNet.toString()}. Diff (Tx Fee): ${difference.toString()}`);
            expect(difference.lten(0), `Difference (${difference}) should be <= 0`).to.be.true;
            expect(difference.gten(maxTxFee.neg()), `Difference (${difference}) should be >= -maxTxFee (-${maxTxFee})`).to.be.true;
        });
        it("Closes a single empty ATA with a referrer", async () => {
            // 1. إنشاء حساب للمحيل وتمويله (بشكل بسيط يكفي لاستقبال العمولة)
            const referrerKP = Keypair.generate();
            console.log(`Funding referrer account ${referrerKP.publicKey.toBase58()}...`);
            // لا نحتاج للكثير من الأموال، فقط ما يكفي لإنشاء الحساب وتلقي العمولة
            await provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({
                fromPubkey: payerWallet.publicKey, // الممول المحمل مسبقًا
                toPubkey: referrerKP.publicKey,
                lamports: LAMPORTS_PER_SOL / 100, // 0.01 SOL كافٍ جدًا
            })), [payerWallet], { commitment: "confirmed", skipPreflight: true });
            const referrerBalanceBefore = await getBalance(referrerKP.publicKey);
            // 2. قراءة الأرصدة الأخرى قبل العملية
            // userAta1 تم إنشاؤه في beforeEach
            const userBalanceBefore = await getBalance(userKeypair.publicKey);
            const treasuryBalanceBefore = await getBalance(treasury.publicKey);
            const ataLamportsBefore = await getBalance(userAta1);
            // 3. استدعاء تعليمة العقد مع تمرير مفتاح المحيل
            const txSignature = await program.methods
                .closeMultipleAtas(referrerKP.publicKey) // <-- تمرير مفتاح المحيل
                .accounts({
                user: userKeypair.publicKey,
                treasury: treasury.publicKey,
            })
                .remainingAccounts([
                { pubkey: userAta1, isSigner: false, isWritable: true },
                { pubkey: referrerKP.publicKey, isSigner: false, isWritable: true }, // حساب المحيل يجب أن يكون قابل للكتابة
            ])
                .signers([userKeypair])
                .rpc({ commitment: "confirmed" });
            console.log("Single close with referrer tx confirmed:", txSignature);
            // 4. التحقق من إغلاق ATA
            let errorFound = false;
            try {
                await getAccount(connection, userAta1);
            }
            catch (e) {
                expect(e.name).to.equal("TokenAccountNotFoundError");
                errorFound = true;
            }
            expect(errorFound, "ATA should be closed (referrer test)").to.be.true;
            // 5. التحقق من تغير الأرصدة (مع حساب العمولة)
            const userBalanceAfter = await getBalance(userKeypair.publicKey);
            const treasuryBalanceAfter = await getBalance(treasury.publicKey);
            const referrerBalanceAfter = await getBalance(referrerKP.publicKey);
            const totalRentRecovered = ataLamportsBefore;
            const expectedPlatformFee = totalRentRecovered.mul(PLATFORM_FEE_PERCENT).div(new BN(100));
            const expectedReferralFee = expectedPlatformFee.mul(REFERRAL_COMMISSION_PERCENT).div(new BN(100)); // عمولة المحيل
            const feeToTreasuryExpected = expectedPlatformFee.sub(expectedReferralFee); // الصافي للخزينة
            // التحقق من رصيد الخزينة
            const treasuryBalanceChange = treasuryBalanceAfter.sub(treasuryBalanceBefore);
            console.log(`Treasury balance change (referrer): ${treasuryBalanceChange.toString()}. Expected: ${feeToTreasuryExpected.toString()}`);
            expect(treasuryBalanceChange.eq(feeToTreasuryExpected), "Treasury balance mismatch (referrer)").to.be.true;
            // التحقق من رصيد المحيل
            const referrerBalanceChange = referrerBalanceAfter.sub(referrerBalanceBefore);
            console.log(`Referrer balance change: ${referrerBalanceChange.toString()}. Expected: ${expectedReferralFee.toString()}`);
            expect(referrerBalanceChange.eq(expectedReferralFee), "Referrer balance mismatch").to.be.true;
            // التحقق من رصيد المستخدم
            const expectedUserIncreaseNet = totalRentRecovered.sub(expectedPlatformFee); // المستخدم لا يزال يدفع رسوم المنصة كاملة
            const userBalanceChange = userBalanceAfter.sub(userBalanceBefore);
            const difference = userBalanceChange.sub(expectedUserIncreaseNet);
            const maxTxFee = new BN(15000); // رسوم معاملة عادية
            console.log(`User balance change (referrer): ${userBalanceChange.toString()}. Expected net: ${expectedUserIncreaseNet.toString()}. Diff (Tx Fee): ${difference.toString()}`);
            expect(difference.lten(0), `Difference (${difference}) should be <= 0`).to.be.true;
            expect(difference.gten(maxTxFee.neg()), `Difference (${difference}) should be >= -maxTxFee (-${maxTxFee})`).to.be.true;
        });
        it("Fails to close a non-empty ATA", async () => {
            // 1. إنشاء ATA غير فارغ
            console.log("Setting up non-empty ATA for failure test...");
            const ataInfoNonEmpty = await getOrCreateAssociatedTokenAccount(connection, payerWallet, mint, userKeypair.publicKey);
            await mintTo(// سك عملات فيه
            connection, payerWallet, // Payer
            mint, ataInfoNonEmpty.address, payerWallet.publicKey, // Mint Authority
            100 // Amount
            );
            const ataNonEmpty = ataInfoNonEmpty.address;
            console.log(`Non-empty ATA created and minted: ${ataNonEmpty.toBase58()}`);
            const ataData = await getAccount(connection, ataNonEmpty);
            expect(ataData.amount.toString()).to.equal("100", "Test ATA should have 100 tokens");
            // 2. محاولة إغلاقه واستقبال الخطأ المتوقع
            try {
                await program.methods
                    .closeMultipleAtas(null)
                    .accounts({ user: userKeypair.publicKey, treasury: treasury.publicKey })
                    .remainingAccounts([{ pubkey: ataNonEmpty, isSigner: false, isWritable: true }])
                    .signers([userKeypair])
                    .rpc();
                // إذا لم يرمي خطأ، فشل الاختبار
                expect.fail("Transaction should have failed for non-empty ATA");
            }
            catch (error) {
                // 3. التحقق من الخطأ
                console.log("Caught expected error for non-empty ATA:", error.message);
                // نتحقق من أن الخطأ هو خطأ برنامج Anchor ونحتوي على رمز الخطأ الصحيح
                expect(error instanceof anchor.AnchorError).to.be.true;
                if (error instanceof anchor.AnchorError) {
                    expect(error.error.errorCode.code).to.equal("AtaIsNotEmpty");
                    expect(error.error.errorCode.number).to.equal(6009);
                }
            }
            // 4. التأكد من أن الحساب لم يُغلق ورصيده لم يتغير
            const ataAccountInfoAfter = await getAccount(connection, ataNonEmpty);
            expect(ataAccountInfoAfter.amount.toString()).to.equal("100", "Non-empty ATA should still exist with 100 tokens");
        });
        it("Fails if the referrer is the user", async () => {
            // userAta1 تم إنشاؤه في beforeEach
            try {
                await program.methods
                    .closeMultipleAtas(userKeypair.publicKey) // <-- المحيل هو المستخدم
                    .accounts({ user: userKeypair.publicKey, treasury: treasury.publicKey })
                    .remainingAccounts([
                    { pubkey: userAta1, isSigner: false, isWritable: true },
                    // لا نمرر المستخدم هنا لأنه هو نفسه Signer والحساب الرئيسي
                ])
                    .signers([userKeypair])
                    .rpc();
                expect.fail("Transaction should have failed when referrer is user");
            }
            catch (error) {
                console.log("Caught expected error for referrer is user:", error.message);
                expect(error instanceof anchor.AnchorError).to.be.true;
                if (error instanceof anchor.AnchorError) {
                    expect(error.error.errorCode.code).to.equal("ReferrerCannotBeUser");
                    expect(error.error.errorCode.number).to.equal(6001);
                }
            }
        });
        it("Fails if referrer account is not provided in remainingAccounts", async () => {
            const referrerKP = Keypair.generate(); // لا نحتاج لتمويله لهذا الاختبار
            // userAta1 تم إنشاؤه في beforeEach
            try {
                await program.methods
                    .closeMultipleAtas(referrerKP.publicKey) // <-- نمرر المفتاح كوسيط
                    .accounts({ user: userKeypair.publicKey, treasury: treasury.publicKey })
                    .remainingAccounts([
                    { pubkey: userAta1, isSigner: false, isWritable: true }
                    // <-- حساب المحيل ليس هنا!
                ])
                    .signers([userKeypair])
                    .rpc();
                expect.fail("Transaction should have failed when referrer account is missing");
            }
            catch (error) {
                console.log("Caught expected error for missing referrer account:", error.message);
                // الخطأ المتوقع هنا هو من العقد مباشرة
                expect(error instanceof anchor.AnchorError).to.be.true;
                if (error instanceof anchor.AnchorError) {
                    // نتوقع ReferrerAccountNotFound أو خطأ Anchor عام متعلق بعدم كفاية الحسابات
                    // في حالتنا، الكود يتحقق ويرمي ReferrerAccountNotFound صراحة
                    expect(error.error.errorCode.code).to.equal("ReferrerAccountNotFound");
                    expect(error.error.errorCode.number).to.equal(6012);
                }
            }
        });
        it("Fails if referrer account is not writable", async () => {
            const referrerKP = Keypair.generate();
            await provider.sendAndConfirm(// يجب أن يكون الحساب موجودًا لهذا الاختبار
            new Transaction().add(SystemProgram.transfer({ fromPubkey: payerWallet.publicKey, toPubkey: referrerKP.publicKey, lamports: LAMPORTS_PER_SOL / 100 })), [payerWallet], { commitment: "confirmed", skipPreflight: true });
            // userAta1 تم إنشاؤه في beforeEach
            try {
                await program.methods
                    .closeMultipleAtas(referrerKP.publicKey)
                    .accounts({ user: userKeypair.publicKey, treasury: treasury.publicKey })
                    .remainingAccounts([
                    { pubkey: userAta1, isSigner: false, isWritable: true },
                    { pubkey: referrerKP.publicKey, isSigner: false, isWritable: false }, // <-- غير قابل للكتابة
                ])
                    .signers([userKeypair])
                    .rpc();
                expect.fail("Transaction should have failed when referrer account is not writable");
            }
            catch (error) {
                console.log("Caught expected error for non-writable referrer account:", error.message);
                // الخطأ قد يكون من Anchor (ConstraintMut) أو من العقد (ReferrerAccountNotWritable)
                expect(error instanceof anchor.AnchorError).to.be.true;
                if (error instanceof anchor.AnchorError) {
                    // تحقق من كلا الاحتمالين
                    const isConstraintError = error.error.errorCode.code === 'ConstraintMut';
                    const isCustomError = error.error.errorCode.code === 'ReferrerAccountNotWritable';
                    expect(isConstraintError || isCustomError, `Expected ConstraintMut or ReferrerAccountNotWritable, but got ${error.error.errorCode.code}`).to.be.true;
                }
            }
        });
        // --- نهاية اختبارات حالات الفشل ---
        // --- سنضيف المزيد من حالات الاختبار هنا لاحقًا ---
    }); // نهاية describe("close_multiple_atas")
    describe("distribute_rewards", () => {
        let recipient1;
        let recipient2;
        // إعداد قبل كل اختبار توزيع
        beforeEach(async () => {
            // إنشاء مستلمين جدد لكل اختبار لضمان نظافة الأرصدة
            recipient1 = Keypair.generate();
            recipient2 = Keypair.generate();
            // تمويل بسيط للمستلمين (اختياري، لكن جيد للتأكد من وجودهم)
            console.log(`Funding recipient1 ${recipient1.publicKey.toBase58()}...`);
            await provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({ fromPubkey: payerWallet.publicKey, toPubkey: recipient1.publicKey, lamports: LAMPORTS_PER_SOL / 100 })), [payerWallet], { commitment: "confirmed", skipPreflight: true });
            console.log(`Funding recipient2 ${recipient2.publicKey.toBase58()}...`);
            await provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({ fromPubkey: payerWallet.publicKey, toPubkey: recipient2.publicKey, lamports: LAMPORTS_PER_SOL / 100 })), [payerWallet], { commitment: "confirmed", skipPreflight: true });
            // التأكد من رصيد الخزينة (تم تمويلها بـ 1 SOL في before all)
            const treasuryBalance = await getBalance(treasury.publicKey);
            console.log(`Treasury balance before distribution test: ${treasuryBalance.div(new BN(LAMPORTS_PER_SOL)).toString()} SOL`);
            // تأكد من وجود رصيد كافٍ للاختبار (مثلاً 0.1 SOL)
            expect(treasuryBalance.gt(new BN(LAMPORTS_PER_SOL / 10)), "Treasury needs sufficient balance for distribution tests").to.be.true;
        });
        // --- الاختبار الأول: التوزيع الناجح ---
        it("Successfully distributes rewards from treasury by authority", async () => {
            // 1. تحديد المستلمين والمبالغ
            const recipients = [recipient1.publicKey, recipient2.publicKey];
            const amounts = [new BN(100000), new BN(50000)]; // 0.0001 SOL و 0.00005 SOL
            const totalRewardAmount = amounts[0].add(amounts[1]);
            // 2. قراءة الأرصدة قبل العملية
            const treasuryBalanceBefore = await getBalance(treasury.publicKey);
            const recipient1BalanceBefore = await getBalance(recipient1.publicKey);
            const recipient2BalanceBefore = await getBalance(recipient2.publicKey);
            const authorityBalanceBefore = await getBalance(authorityKeypair.publicKey); // لمراقبة رسوم المعاملة
            // 3. بناء واستدعاء التعليمة (باستخدام بناء يدوي للمعاملة)
            //    نحتاج إلى بناء يدوي بسبب الحاجة لتوقيع الخزينة (treasury) أيضًا
            console.log("Building manual transaction for distribute_rewards...");
            const instruction = await program.methods
                .distributeRewards(amounts)
                .accounts({
                treasury: treasury.publicKey,
                authority: authorityKeypair.publicKey, // السلطة الموقعة
                // systemProgram يتم استنتاجه
            })
                .remainingAccounts(// تمرير المستلمين هنا
            recipients.map(r => ({ pubkey: r, isSigner: false, isWritable: true })))
                .instruction(); // الحصول على التعليمة فقط
            const transaction = new Transaction().add(instruction);
            const { blockhash } = await connection.getLatestBlockhash('confirmed');
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = authorityKeypair.publicKey; // السلطة تدفع الرسوم
            console.log("Sending distribute_rewards transaction manually...");
            // --- !! إرسال وتأكيد يدوي مع كلا الموقعين !! ---
            const txSignature = await web3.sendAndConfirmTransaction(// استخدام web3 مباشرة
            connection, transaction, [authorityKeypair, treasury], // <-- تمرير كلا الموقعين هنا!
            { commitment: "confirmed", skipPreflight: false } // skipPreflight: false جيد للتحقق من الأخطاء مبكرًا
            );
            console.log("Distribute rewards transaction successful:", txSignature);
            // 4. التحقق من تغير الأرصدة
            const treasuryBalanceAfter = await getBalance(treasury.publicKey);
            const recipient1BalanceAfter = await getBalance(recipient1.publicKey);
            const recipient2BalanceAfter = await getBalance(recipient2.publicKey);
            const authorityBalanceAfter = await getBalance(authorityKeypair.publicKey);
            // التحقق من رصيد الخزينة
            const expectedTreasuryBalanceAfter = treasuryBalanceBefore.sub(totalRewardAmount);
            console.log(`Treasury balance after: ${treasuryBalanceAfter.toString()}. Expected: ${expectedTreasuryBalanceAfter.toString()}`);
            expect(treasuryBalanceAfter.eq(expectedTreasuryBalanceAfter), "Treasury balance mismatch after distribution").to.be.true;
            // التحقق من أرصدة المستلمين
            const expectedRecipient1BalanceAfter = recipient1BalanceBefore.add(amounts[0]);
            const expectedRecipient2BalanceAfter = recipient2BalanceBefore.add(amounts[1]);
            console.log(`Recipient 1 balance after: ${recipient1BalanceAfter.toString()}. Expected: ${expectedRecipient1BalanceAfter.toString()}`);
            console.log(`Recipient 2 balance after: ${recipient2BalanceAfter.toString()}. Expected: ${expectedRecipient2BalanceAfter.toString()}`);
            expect(recipient1BalanceAfter.eq(expectedRecipient1BalanceAfter), "Recipient 1 balance mismatch").to.be.true;
            expect(recipient2BalanceAfter.eq(expectedRecipient2BalanceAfter), "Recipient 2 balance mismatch").to.be.true;
            // التحقق من رسوم المعاملة (دفعتها السلطة)
            const txFeePaidByAuthority = authorityBalanceBefore.sub(authorityBalanceAfter);
            console.log(`Tx fee paid by authority: ${txFeePaidByAuthority.toString()}`);
            expect(txFeePaidByAuthority.gt(new BN(0)), "Authority should have paid a tx fee").to.be.true;
            expect(txFeePaidByAuthority.lte(new BN(15000)), "Tx fee paid by authority seems too high").to.be.true; // حد أقصى معقول
        });
        it("Fails to distribute rewards if signer is not the authority", async () => {
            const recipients = [recipient1.publicKey];
            const amounts = [new BN(1000)];
            const wrongSigner = Keypair.generate(); // موقع خاطئ تمامًا
            // مول الموقع الخاطئ ليكون قادرًا على دفع الرسوم
            await provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({ fromPubkey: payerWallet.publicKey, toPubkey: wrongSigner.publicKey, lamports: LAMPORTS_PER_SOL / 10 })), [payerWallet], { commitment: "confirmed", skipPreflight: true });
            try {
                // بناء يدوي لأننا نغير الموقعين
                const instruction = await program.methods
                    .distributeRewards(amounts)
                    .accounts({
                    treasury: treasury.publicKey,
                    authority: wrongSigner.publicKey, // <-- استخدام الموقع الخاطئ هنا
                })
                    .remainingAccounts([{ pubkey: recipients[0], isSigner: false, isWritable: true }])
                    .instruction();
                const transaction = new Transaction().add(instruction);
                const { blockhash } = await connection.getLatestBlockhash('confirmed');
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = wrongSigner.publicKey; // الموقع الخاطئ يدفع الرسوم
                await web3.sendAndConfirmTransaction(connection, transaction, [wrongSigner, treasury], // <-- الموقع الخاطئ و treasury
                { commitment: "confirmed", skipPreflight: false });
                expect.fail("Transaction should have failed (unauthorized signer)");
            }
            catch (error) {
                console.log("Caught expected error for unauthorized signer:", error.message);
                // نتوقع خطأ قيد من Anchor أو خطأ من البرنامج
                expect(error instanceof anchor.AnchorError || error.message.includes("ConstraintHasOne") || error.message.includes("Unauthorized")).to.be.true;
                // للتحقق بشكل أدق إذا كان AnchorError
                if (error instanceof anchor.AnchorError && error.error.errorCode) {
                    expect(error.error.errorCode.code).to.equal("Unauthorized");
                    expect(error.error.errorCode.number).to.equal(6002);
                }
            }
        });
        it("Fails to distribute rewards if treasury balance is insufficient", async () => {
            const recipients = [recipient1.publicKey];
            const treasuryBalanceBefore = await getBalance(treasury.publicKey);
            const amounts = [treasuryBalanceBefore.add(new BN(10000))]; // مبلغ أكبر من رصيد الخزينة
            try {
                const instruction = await program.methods
                    .distributeRewards(amounts)
                    .accounts({ treasury: treasury.publicKey, authority: authorityKeypair.publicKey })
                    .remainingAccounts([{ pubkey: recipients[0], isSigner: false, isWritable: true }])
                    .instruction();
                const transaction = new Transaction().add(instruction);
                const { blockhash } = await connection.getLatestBlockhash('confirmed');
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = authorityKeypair.publicKey;
                await web3.sendAndConfirmTransaction(connection, transaction, [authorityKeypair, treasury], { commitment: "confirmed", skipPreflight: true } // **هام: skipPreflight=true** قد يكون ضروريًا هنا لرؤية خطأ البرنامج الفعلي بدلاً من فشل المحاكاة
                );
                expect.fail("Should have failed (insufficient treasury balance)");
            }
            catch (error) {
                console.log("Caught expected error for insufficient balance:", error.message);
                // --- !! تعديل التحقق !! ---
                // البحث عن رمز الخطأ المخصص (6005) أو خطأ التحويل (0x1) في الرسالة
                const expectedErrorCode = 6005; // ErrorCode::InsufficientTreasuryBalance
                const foundExpectedError = error.message.includes(`"Custom":${expectedErrorCode}`) || // خطأ مؤكد من البرنامج
                    error.message.includes("insufficient lamports") || // خطأ من وقت التشغيل
                    error.message.includes("custom program error: 0x1"); // خطأ تحويل النظام
                expect(foundExpectedError, `Error message should indicate insufficient balance (code ${expectedErrorCode} or similar)`).to.be.true;
                // --- نهاية التعديل ---
            }
        });
        it("Fails if number of amounts does not match number of recipients", async () => {
            const recipients = [recipient1.publicKey]; // مستلم واحد
            const amounts = [new BN(1000), new BN(2000)]; // مبلغين
            try {
                const instruction = await program.methods
                    .distributeRewards(amounts)
                    .accounts({ treasury: treasury.publicKey, authority: authorityKeypair.publicKey })
                    .remainingAccounts([{ pubkey: recipients[0], isSigner: false, isWritable: true }])
                    .instruction();
                const transaction = new Transaction().add(instruction);
                // ... (إضافة blockhash و feePayer كالسابق)
                const { blockhash } = await connection.getLatestBlockhash('confirmed');
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = authorityKeypair.publicKey;
                await web3.sendAndConfirmTransaction(connection, transaction, [authorityKeypair, treasury]);
                expect.fail("Should have failed (mismatch amounts/recipients)");
            }
            catch (error) {
                console.log("Caught expected error for mismatch amounts/recipients:", error.message);
                // --- !! تعديل التحقق !! ---
                const expectedErrorCode = 6003; // ErrorCode::MismatchRewardAmounts
                // البحث عن رمز الخطأ في الرسالة أو السجلات إذا كانت محاكاة
                const foundExpectedError = error.message.includes(`"Custom":${expectedErrorCode}`) ||
                    error.message.includes(`custom program error: 0x${expectedErrorCode.toString(16)}`); // 0x1773
                expect(foundExpectedError, `Error message should indicate mismatch (code ${expectedErrorCode})`).to.be.true;
                // --- نهاية التعديل ---
            }
        });
        it("Fails if recipient list is empty", async () => {
            const amounts = []; // مصفوفة مبالغ فارغة
            try {
                const instruction = await program.methods
                    .distributeRewards(amounts)
                    .accounts({ treasury: treasury.publicKey, authority: authorityKeypair.publicKey })
                    // .remainingAccounts([]) // لا نمرر أي مستلمين
                    .instruction();
                const transaction = new Transaction().add(instruction);
                // ... (إضافة blockhash و feePayer كالسابق)
                const { blockhash } = await connection.getLatestBlockhash('confirmed');
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = authorityKeypair.publicKey;
                await web3.sendAndConfirmTransaction(connection, transaction, [authorityKeypair, treasury]);
                expect.fail("Should have failed (no recipients)");
            }
            catch (error) {
                console.log("Caught expected error for no recipients:", error.message);
                // --- !! تعديل التحقق !! ---
                const expectedErrorCode = 6004; // ErrorCode::NoRecipients
                const foundExpectedError = error.message.includes(`"Custom":${expectedErrorCode}`) ||
                    error.message.includes(`custom program error: 0x${expectedErrorCode.toString(16)}`); // 0x1774
                expect(foundExpectedError, `Error message should indicate no recipients (code ${expectedErrorCode})`).to.be.true;
                // --- نهاية التعديل ---
            }
        });
        it("Fails if a recipient account is not writable", async () => {
            const recipients = [recipient1.publicKey];
            const amounts = [new BN(1000)];
            try {
                const instruction = await program.methods
                    .distributeRewards(amounts)
                    .accounts({ treasury: treasury.publicKey, authority: authorityKeypair.publicKey })
                    .remainingAccounts([
                    { pubkey: recipients[0], isSigner: false, isWritable: false } // <-- غير قابل للكتابة
                ])
                    .instruction();
                const transaction = new Transaction().add(instruction);
                // ... (إضافة blockhash و feePayer كالسابق)
                const { blockhash } = await connection.getLatestBlockhash('confirmed');
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = authorityKeypair.publicKey;
                await web3.sendAndConfirmTransaction(connection, transaction, [authorityKeypair, treasury]);
                expect.fail("Should have failed (recipient not writable)");
            }
            catch (error) {
                console.log("Caught expected error for non-writable recipient:", error.message);
                // --- !! تعديل التحقق !! ---
                const expectedErrorCode = 6006; // ErrorCode::AccountNotWritable
                // قد يفشل في المحاكاة أو في التنفيذ الفعلي
                const foundExpectedError = error.message.includes(`"Custom":${expectedErrorCode}`) ||
                    error.message.includes(`custom program error: 0x${expectedErrorCode.toString(16)}`) || // 0x1776
                    error.message.includes("An account required to be writable"); // خطأ وقت تشغيل محتمل
                expect(foundExpectedError, `Error message should indicate non-writable account (code ${expectedErrorCode} or similar runtime error)`).to.be.true;
                // --- نهاية التعديل ---
            }
        });
        // --- سنضيف اختبارات الفشل هنا لاحقًا ---
    });
    // --- سنضيف مجموعة اختبارات لـ distribute_rewards هنا لاحقًا ---
}); // نهاية describe("ata-claim")
