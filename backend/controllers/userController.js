// backend/controllers/userController.js
const referralService = require('../services/referralService');
const { PublicKey } = require('@solana/web3.js');

exports.initializeUser = async (req, res, next) => {
    const { userPublicKeyString, potentialReferrer } = req.body;
    console.log(`UserController (initializeUser) RECV: user=${userPublicKeyString}, potentialReferrer=${potentialReferrer || 'None'}`);

    if (!userPublicKeyString) {
        return res.status(400).json({ success: false, error: "Missing userPublicKeyString." });
    }
    try {
        new PublicKey(userPublicKeyString); // التحقق من صحة تنسيق مفتاح المستخدم
    } catch (e) {
        return res.status(400).json({ success: false, error: 'Invalid user public key format.' });
    }

    let validPotentialReferrer = null;
    if (potentialReferrer) {
        try {
            const refKeyObj = new PublicKey(potentialReferrer);
            if (!refKeyObj.equals(new PublicKey(userPublicKeyString))) { // المحيل لا يمكن أن يكون المستخدم نفسه
                validPotentialReferrer = potentialReferrer;
            } else {
                console.warn(`UserController (initializeUser): Potential referrer is same as user. Ignoring.`);
            }
        } catch (e) {
            console.warn(`UserController (initializeUser): Invalid potentialReferrer format: ${potentialReferrer}. Ignoring.`);
        }
    }

    try {
        const { record, wasCreated } = await referralService.findOrCreateUserOnly(userPublicKeyString, validPotentialReferrer);
        const message = wasCreated ? "User record created successfully." : "User record already exists.";
        // *** إذا تم إنشاء المستخدم للتو وكان له محيل، قم بزيادة عدادات المحيل ***
        if (wasCreated && record.referrer) {
            console.log(`UserController (initializeUser): New user created with referrer ${record.referrer}. Incrementing referrer's counts.`);
            // استدعاء updateReferrerStats لزيادة العدادات فقط (رسوم = 0)
            await referralService.updateReferrerStats(
                record.referrer,        // المحيل الأصلي من قاعدة البيانات
                BigInt(0),              // لا توجد رسوم منصة هنا
                true                    // نعم، قم بزيادة العدادات
            );
        }
        // ---------------------------------------------------------------
        console.log(`UserController (initializeUser) RESP: ${message} For user ${userPublicKeyString}, referrer in DB is ${record.referrer || 'None'}`);
        res.status(200).json({ success: true, message: message, wasCreated: wasCreated, userReferrer: record.referrer });
    } catch (error) {
        console.error("!!! UserController Error in initializeUser:", error);
        // لا تمرر الخطأ مباشرة للواجهة إذا كان حساسًا
        next(new Error("Failed to initialize user record due to a server error."));
    }
};