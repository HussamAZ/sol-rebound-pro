// backend/controllers/referralController.js
const referralService = require('../services/referralService');
const solanaService = require('../services/solanaService');
const { PublicKey } = require('@solana/web3.js');

exports.getReferralInfo = async (req, res, next) => {
    console.log("Controller: getReferralInfo called. Query:", req.query);
    try {
        const userPublicKeyString = req.query.user;

        if (!userPublicKeyString) {
            return res.status(400).json({ success: false, error: "Missing 'user' query parameter." });
        }
        try {
            new PublicKey(userPublicKeyString); // التحقق من صحة التنسيق
        } catch (e) {
            return res.status(400).json({ success: false, error: 'Invalid user public key format.' });
        }

        const referralData = await referralService.getReferralInfo(userPublicKeyString);

        res.status(200).json({
            success: true,
            data: referralData // هذا سيكون إما البيانات الحقيقية أو الافتراضية
        });

    } catch (error) {
        console.error("!!! Controller Error in getReferralInfo:", error);
        next(error);
    }
};

exports.withdrawReferrals = async (req, res, next) => {
    console.log("Controller: withdrawReferrals called. Body:", req.body);
    try {
        const { userPublicKeyString } = req.body;

        if (!userPublicKeyString) {
            return res.status(400).json({ success: false, error: "Missing userPublicKeyString." });
        }
        let userPublicKey;
        try {
            userPublicKey = new PublicKey(userPublicKeyString);
        } catch (e) {
            return res.status(400).json({ success: false, error: 'Invalid user public key format.' });
        }

        // 1. التحقق من أهلية السحب (بما في ذلك الحد الأدنى)
        const eligibility = await referralService.checkWithdrawalEligibility(userPublicKeyString);
        if (!eligibility.eligible) {
             // أرجع 400 مع تفاصيل الخطأ من الخدمة
             return res.status(400).json({ success: false, error: eligibility.error });
        }

        const amountToWithdrawLamports = eligibility.earningsLamports;

        // 2. محاولة إرسال SOL من المحفظة الساخنة
        // الخدمة solanaService.sendSolFromHotWallet تتحقق من رصيد المحفظة الساخنة داخليًا
        const signature = await solanaService.sendSolFromHotWallet(
            userPublicKeyString,
            amountToWithdrawLamports
        );
        // إذا فشل الإرسال، سيتم رمي خطأ والتقاطه بواسطة catch

        // 3. تصفير رصيد المستخدم في قاعدة البيانات (فقط بعد نجاح الإرسال والتأكيد داخل الخدمة)
        await referralService.resetUserEarnings(userPublicKeyString);

        // 4. إرسال استجابة النجاح
        const { LAMPORTS_PER_SOL } = require('../config/constants');
        const amountSol = amountToWithdrawLamports / LAMPORTS_PER_SOL;
        console.log(`--- Controller Successfully processed withdrawal for ${userPublicKeyString} ---`);
        res.status(200).json({
            success: true,
            message: `Successfully withdrew ${amountSol.toFixed(8)} SOL.`,
            amountSol: amountSol,
            amountLamports: amountToWithdrawLamports, // إرجاع المبلغ بالـ lamports أيضًا
            signature: signature
        });

    } catch (error) {
        console.error("!!! Controller Error in withdrawReferrals:", error);
        // التعامل مع أخطاء محددة من الخدمات
        if (error.message.includes("Insufficient server hot wallet balance")) {
            // لا تخبر المستخدم بالسبب الدقيق، فقط أن الخدمة غير متاحة
             return res.status(503).json({ success: false, error: "Withdrawal service temporarily unavailable. Please try again later." });
        }
        // مرر الأخطاء الأخرى للمعالج العام
        next(error);
    }
};