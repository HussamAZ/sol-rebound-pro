// backend/controllers/transactionController.js

const solanaService = require('../services/solanaService');
const referralService = require('../services/referralService');
const platformEarningService = require('../services/platformEarningService');
const { PublicKey } = require('@solana/web3.js');
const constants = require('../config/constants');
// تم حذف الـ imports الخاصة بالمسابقة لأنها لم تعد مطلوبة

// دالة prepareCloseTx تبقى كما هي في ملفك الحالي، لا حاجة لتغييرها
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
            const { record: userRecordFromDB } = await referralService.findOrCreateUserOnly(userPublicKeyString, referrerPublicKeyString);
            originalReferrerFromDB = userRecordFromDB?.referrer;
        } catch (dbError) {
            return next(new Error("Server error fetching user data before preparing transaction."));
        }

        const { transactionBase64, platformFeeLamports } = await solanaService.prepareCloseMultipleATAsTransaction(
            userPublicKeyString,
            ataAddresses,
            originalReferrerFromDB,
            constants.RENT_PER_EMPTY_ATA_LAMPORTS,
            constants.PLATFORM_FEE_PERCENT_CONTRACT
        );
        res.status(200).json({
            success: true,
            transaction: transactionBase64,
            platformFeeLamports: platformFeeLamports.toString()
        });
    } catch (error) {
        next(error);
    }
};


// --- النسخة الكاملة والمعدلة لهذه الدالة ---
exports.confirmCloseTx = async (req, res, next) => {
    console.log("Controller (confirmCloseTx): Called. Body:", req.body);
    try {
        const { signature, userPublicKeyString, referrerPublicKeyString, closedCount, platformFeeLamportsString } = req.body;

        if (!signature || !userPublicKeyString || typeof closedCount !== 'number' || closedCount <= 0 || !platformFeeLamportsString) {
            return res.status(400).json({ success: false, error: 'Missing or invalid confirmation parameters.' });
        }
        
        await solanaService.verifyTransaction(signature, userPublicKeyString);
        console.log(`Ctrl (confirmCloseTx): Transaction ${signature} verified successfully.`);

        // 1. تحديث عدادات المستخدم وتحديد ما إذا كانت هذه هي أول عملية إغلاق له
        const { userRecord, wasFirstEverCloseAction } = await referralService.findOrCreateUserAndUpdateCounts(
            userPublicKeyString,
            closedCount,
            referrerPublicKeyString 
        );

        // 2. الحصول على المحيل الفعلي من سجل المستخدم
        const actualReferrerToCredit = userRecord?.referrer;

        // 3. إذا كان هناك محيل، قم بتحديث إحصائياته
        if (actualReferrerToCredit) {
            console.log(`Ctrl (confirmCloseTx): User has an original referrer: ${actualReferrerToCredit}. Updating referrer's stats.`);
            
            const platformFeeLamportsBigInt = BigInt(platformFeeLamportsString);

            // استدعاء دالة تحديث المحيل مع تمرير العلامة الصحيحة
            await referralService.updateReferrerStats(
                actualReferrerToCredit, 
                platformFeeLamportsBigInt,
                wasFirstEverCloseAction
            );

        } else {
            console.log("Ctrl (confirmCloseTx): No actual referrer found. Skipping referrer stats update.");
        }

        // 4. تسجيل أرباح المنصة الصافية
        const platformFeeLamportsBigInt = BigInt(platformFeeLamportsString);
        const netFeeToTreasuryLamports = platformEarningService.calculateNetFeeToTreasury(
            platformFeeLamportsBigInt, !!actualReferrerToCredit
        );
        await platformEarningService.recordPlatformEarning(netFeeToTreasuryLamports, signature, userPublicKeyString, closedCount);
        
        res.status(200).json({ success: true, message: 'Database updated successfully.' });

    } catch (error) {
        console.error("!!! Controller Error in confirmCloseTx:", error.message, error.stack);
        if (error.message.includes("fee payer mismatch") || error.message.includes("failed on-chain")) {
             return res.status(400).json({ success: false, error: `Transaction verification failed: ${error.message}` });
        }
        next(new Error(`Failed to confirm close transaction: ${error.message}`));
    }
};

