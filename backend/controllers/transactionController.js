// backend/controllers/transactionController.js
const solanaService = require('../services/solanaService');
const referralService = require('../services/referralService');
const platformEarningService = require('../services/platformEarningService');
const { PublicKey } = require('@solana/web3.js');
const {
    RENT_PER_EMPTY_ATA_LAMPORTS,
    PLATFORM_FEE_PERCENT_CONTRACT,
    // REFERRAL_COMMISSION_PERCENT_CONTRACT // لم نعد نحتاجها هنا مباشرة
} = require('../config/constants');
const { recordPlatformEarning, calculateNetFeeToTreasury } = require('../services/platformEarningService');
// لا حاجة لاستيراد Referral Model هنا

exports.prepareCloseTx = async (req, res, next) => {
    console.log("Controller (prepareCloseTx): Called. Body:", req.body);
    try {
        const { userPublicKeyString, ataAddresses, referrerPublicKeyString } = req.body;

        if (!userPublicKeyString || !Array.isArray(ataAddresses) || ataAddresses.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing required parameters (userPublicKeyString, ataAddresses).' });
        }


        try { new PublicKey(userPublicKeyString); }
        catch (e) { return res.status(400).json({ success: false, error: 'Invalid userPublicKeyString format.' }); }


        try { ataAddresses.forEach(addr => new PublicKey(addr)); }
        catch (e) { return res.status(400).json({ success: false, error: `Invalid ATA address format.` }); }


        let originalReferrerFromDB = null;
        try {
            // استخدم findOrCreateUserOnly للبحث (لن ينشئ إذا كان المستخدم موجودًا)
            // referrerPublicKeyString هنا لا يؤثر على البحث إذا كان المستخدم موجودًا
            const { record: userRecordFromDB } = await referralService.findOrCreateUserOnly(userPublicKeyString, referrerPublicKeyString);
            originalReferrerFromDB = userRecordFromDB?.referrer; // يجب أن يكون مفكوك التشفير
            console.log(`Ctrl (prepareCloseTx): Fetched original referrer for user ${userPublicKeyString} from DB: ${originalReferrerFromDB || 'None'}`);
        } catch (dbError) {
            console.error(`Ctrl (prepareCloseTx): Error fetching user record to get original referrer: ${dbError.message}`);
            // يمكنك اختيار كيفية التعامل مع هذا الخطأ، ربما الاستمرار بدون محيل أصلي
            // أو إرجاع خطأ 500. لنرجع خطأ الآن للوضوح.
            return next(new Error("Server error fetching user data before preparing transaction."));
        }
        // -------------------------------------------------------------

        console.log("Ctrl (prepareCloseTx): Calling solanaService.prepareCloseMultipleATAsTransaction...");
        const { transactionBase64, platformFeeLamports } = await solanaService.prepareCloseMultipleATAsTransaction(
            userPublicKeyString,
            ataAddresses,
            originalReferrerFromDB, // <-- تمرير المحيل الأصلي من DB
            RENT_PER_EMPTY_ATA_LAMPORTS,
            PLATFORM_FEE_PERCENT_CONTRACT
        );
        console.log("Ctrl (prepareCloseTx): Received prepared transaction from service.");
        res.status(200).json({
            success: true,
            transaction: transactionBase64,
            platformFeeLamports: platformFeeLamports
        });
    } catch (error) {
        console.error("!!! Controller Error in prepareCloseTx:", error.message);
        error.message = `Failed to prepare close transaction: ${error.message}`; // أضف سياقًا
        next(error);
    }
};

exports.confirmCloseTx = async (req, res, next) => {
    console.log("Controller (confirmCloseTx): Called. Body:", req.body);
    try {
        const { signature, userPublicKeyString, referrerPublicKeyString, closedCount, platformFeeLamportsString } = req.body;

        if (!signature || !userPublicKeyString || typeof closedCount !== 'number' || closedCount <= 0 || !platformFeeLamportsString) {
            return res.status(400).json({ success: false, error: 'Missing or invalid confirmation parameters.' });
        }
        try { new PublicKey(userPublicKeyString); }
        catch (e) { return res.status(400).json({ success: false, error: 'Invalid user public key format.' }); }

        let platformFeeLamportsBigInt;
        try {
            platformFeeLamportsBigInt = BigInt(platformFeeLamportsString);
            if (platformFeeLamportsBigInt < 0) throw new Error("Platform fee cannot be negative.");
        }
        catch (e) { return res.status(400).json({ success: false, error: `Invalid platformFeeLamportsString: ${platformFeeLamportsString}` });}
        const numberOfClosedAccounts = closedCount;

        // المحيل من URL يُستخدم فقط لتحديد ما إذا كانت إحالة جديدة عند إنشاء المستخدم
        let referrerFromUrlForNewUserCheck = null;
        if (referrerPublicKeyString) {
            try {
                 const refKeyObj = new PublicKey(referrerPublicKeyString);
                 const userKeyObj = new PublicKey(userPublicKeyString);
                 if (!refKeyObj.equals(userKeyObj)) { // لا يمكن أن يكون المحيل هو المستخدم نفسه
                     referrerFromUrlForNewUserCheck = referrerPublicKeyString;
                 }
            } catch(e) { console.warn(`Ctrl (confirmCloseTx): Invalid referrerPublicKeyString from req body: ${referrerPublicKeyString}. Ignoring for new user check.`); }
        }
        console.log(`Ctrl (confirmCloseTx) Parsed: User=${userPublicKeyString}, ReferrerFromUrlForNewUserCheck=${referrerFromUrlForNewUserCheck || 'None'}, Closed=${numberOfClosedAccounts}, Fee=${platformFeeLamportsBigInt}`);

        await solanaService.verifyTransaction(signature, userPublicKeyString);
        console.log("Ctrl (confirmCloseTx): Transaction verified successfully by solanaService.");

        console.log("Ctrl (confirmCloseTx): Starting database updates...");

        // الخطوة 1: تحديث/إنشاء سجل المستخدم الذي قام بالإغلاق.
        // `referrerFromUrlForNewUserCheck` سيستخدمه `findOrCreateUserAndUpdateCounts` فقط إذا كان المستخدم جديدًا تمامًا.
        const { userRecord, wasNewUserWithReferrer } = await referralService.findOrCreateUserAndUpdateCounts(
            userPublicKeyString,
            numberOfClosedAccounts,
            referrerFromUrlForNewUserCheck
        );
        // `userRecord.referrer` يجب أن يكون الآن المحيل الأصلي (مفكوك التشفير إذا كان مشفرًا) أو null.
        console.log(`Ctrl (confirmCloseTx): User record processed. userRecord.referrer: 
            ${userRecord?.referrer || 'None'}. wasNewUserWithReferrer: ${wasNewUserWithReferrer}`);

        // الخطوة 2: تحديد المحيل الفعلي الذي سيحصل على العمولة (من قاعدة البيانات)
        const actualReferrerToCredit = userRecord?.referrer; // هذا هو المحيل الأصلي
        console.log(`Ctrl (confirmCloseTx): Actual referrer to credit (from user's DB record): ${actualReferrerToCredit || 'None'}`);

        // الخطوة 3: تحديث إحصائيات المحيل الفعلي (إذا كان موجودًا)
        if (actualReferrerToCredit) {
            try {
                new PublicKey(actualReferrerToCredit); // تحقق سريع
                console.log(`Ctrl (confirmCloseTx): Valid original referrer ${actualReferrerToCredit}. Updating earnings.`);
                // *** تحديث الأرباح فقط، لا تزيد العدادات هنا ***
                await referralService.updateReferrerStats(
                    actualReferrerToCredit,
                    platformFeeLamportsBigInt, // مرر رسوم المنصة لتضاف للأرباح
                    false                   // لا تزد العدادات هنا
                );
            } catch (e) {
                 console.error(`Ctrl (confirmCloseTx) CRITICAL: originalReferrerKey "${actualReferrerToCredit}" from DB is not valid. Error: ${e.message}`);
            }
        } else {
            console.log("Ctrl (confirmCloseTx): No actual referrer found. Skipping referrer earnings update.");
        }

        // الخطوة 4: حساب وتسجيل أرباح المنصة الصافية
        // الخصم يعتمد على وجود محيل فعلي في قاعدة بيانات المستخدم
        const netFeeToTreasuryLamports = platformEarningService.calculateNetFeeToTreasury( // استدعاء مباشر
            platformFeeLamportsBigInt,
            !!actualReferrerToCredit
        );
        await platformEarningService.recordPlatformEarning(netFeeToTreasuryLamports, signature, userPublicKeyString); // استدعاء مباشر
        console.log(`Ctrl (confirmCloseTx): Platform earning recorded (Net: ${netFeeToTreasuryLamports}).`);

        console.log("--- Controller (confirmCloseTx): Successfully processed ---");
        res.status(200).json({ success: true, message: 'Database updated successfully.' });

    } catch (error) {
        console.error("!!! Controller Error in confirmCloseTx:", error.message);
        if (error.message.includes("fee payer mismatch") || error.message.includes("failed on-chain") || error.message.includes("not found or not confirmed")) {
             return res.status(400).json({ success: false, error: `Transaction verification failed: ${error.message}` });
        }
        // أضف رسالة أكثر تفصيلاً للأخطاء العامة
        next(new Error(`Failed to confirm close transaction: ${error.message || 'Unknown server error'}`));
    }
};