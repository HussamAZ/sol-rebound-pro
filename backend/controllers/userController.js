// backend/controllers/userController.js
const referralService = require('../services/referralService');
const { PublicKey } = require('@solana/web3.js');

/**
 * (النسخة النهائية والمعدلة)
 * يعالج نقطة النهاية /api/users/initialize.
 * يتحقق مما إذا كان المعرف المُمرر هو رمز إحالة قصير أم عنوان محفظة كامل.
 * يجد عنوان المحفظة للمحيل ثم يستدعي الخدمة لإنشاء المستخدم الجديد وربطه.
 */
exports.initializeUser = async (req, res, next) => {
    const { userPublicKeyString, potentialReferrer } = req.body;
    console.log(`UserController (initializeUser) RECV: user=${userPublicKeyString}, potentialReferrer=${potentialReferrer || 'None'}`);

    if (!userPublicKeyString) {
        return res.status(400).json({ success: false, error: "Missing userPublicKeyString." });
    }
    try {
        new PublicKey(userPublicKeyString);
    } catch (e) {
        return res.status(400).json({ success: false, error: 'Invalid user public key format.' });
    }

    let referrerWalletAddress = null;

    if (potentialReferrer) {
        // التحقق إذا كان المعرف المُمرر هو رمز قصير أم عنوان محفظة كامل
        if (potentialReferrer.length < 20 && !potentialReferrer.includes('...')) { 
            // افترض أنه رمز قصير إذا كان طوله أقل من 20 (عنوان المحفظة الكامل أطول بكثير)
            console.log(`UserController: Incoming referral is a short code: ${potentialReferrer}`);
            try {
                // استخدم الخدمة للعثور على المستخدم صاحب الرمز
                const referrerUserRecord = await referralService.findUserByCode(potentialReferrer.toUpperCase());
                if (referrerUserRecord) {
                    referrerWalletAddress = referrerUserRecord.user; // حصلنا على عنوان المحفظة الحقيقي
                    console.log(`UserController: Found wallet address ${referrerWalletAddress} for code ${potentialReferrer}`);
                } else {
                    console.warn(`UserController: Referral code ${potentialReferrer} not found in database.`);
                }
            } catch (dbError) {
                console.error(`UserController: DB error looking up referral code ${potentialReferrer}:`, dbError);
                // استمر بدون محيل في حالة حدوث خطأ في قاعدة البيانات
            }
        } else {
            // افترضه عنوان محفظة وتحقق من صحته
            try {
                new PublicKey(potentialReferrer);
                referrerWalletAddress = potentialReferrer;
                console.log(`UserController: Incoming referral is a full wallet address: ${referrerWalletAddress}`);
            } catch (e) {
                console.warn(`UserController: Invalid wallet address format for referrer: ${potentialReferrer}. Ignoring.`);
            }
        }
    }
    
    // الآن، استخدم referrerWalletAddress الذي حصلنا عليه
    let validPotentialReferrer = null;
    if (referrerWalletAddress && referrerWalletAddress !== userPublicKeyString) {
        validPotentialReferrer = referrerWalletAddress;
    }

    try {
        // استدعاء الخدمة لإنشاء السجل وربطه بالمحيل (إذا وجد)
        const { record, wasCreated } = await referralService.findOrCreateUserOnly(userPublicKeyString, validPotentialReferrer);
        
        const message = wasCreated 
            ? "User record created successfully." 
            : "User record already exists.";
        
        console.log(`UserController (initializeUser) RESP: ${message} For user ${userPublicKeyString}, referrer in DB is ${record.referrer || 'None'}`);
        
        // أرجع الاستجابة النهائية مع المحيل الفعلي من قاعدة البيانات
        res.status(200).json({ 
            success: true, 
            message: message, 
            wasCreated: wasCreated, 
            userReferrer: record.referrer // هذا سيكون دائمًا عنوان المحفظة
        });

    } catch (error) {
        console.error("!!! UserController Error in initializeUser:", error);
        // مرر الخطأ إلى معالج الأخطاء العام
        next(new Error("Failed to initialize user record due to a server error."));
    }
};


