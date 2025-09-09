// backend/services/referralService.js
const Referral = require('../models/Referral');
const { MIN_REFERRAL_WITHDRAW_SOL, LAMPORTS_PER_SOL, REFERRAL_COMMISSION_PERCENT_CONTRACT,
    PLATFORM_FEE_PERCENT_CONTRACT } = require('../config/constants');
const { PublicKey } = require('@solana/web3.js');
const crypto = require('crypto'); // استيراد crypto هنا

// دالة لتشفير البيانات باستخدام AES-256-GCM
function encryptData(data) {
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
        console.error("CRITICAL: ENCRYPTION_KEY is missing or invalid. Cannot encrypt data.");
        return data;
    }
    // تحقق لمنع التشفير المزدوج
    if (typeof data === 'string' && data.includes(':') && data.split(':').length === 3) {
        console.warn("Attempting to double-encrypt data. Returning value as is:", data);
        return data;
    }
    try {
        const algorithm = 'aes-256-gcm';
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let encrypted = cipher.update(String(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
        console.error("Encryption failed:", error);
        return String(data);
    }
}


// أضف هذه الدالة في بداية الملف
function generateReferralCode(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * (النسخة النهائية والمعدلة)
 * يبحث عن سجل المستخدم أو ينشئه. يعتمد على getter في الموديل لفك التشفير تلقائيًا.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم.
 * @param {string|null} potentialReferrerKeyString - المفتاح العام للمحيل المحتمل.
 * @returns {Promise<{record: object, wasCreated: boolean}>} - كائن يحتوي على سجل المستخدم وعلامة الإنشاء.
 */
async function findOrCreateUserOnly(userPublicKeyString, potentialReferrerKeyString) {
    console.log(`ReferralService (findOrCreateUserOnly): User=${userPublicKeyString}, PotentialReferrer=${potentialReferrerKeyString || 'None'}`);

    // الخطوة 1: ابحث عن المستخدم باستخدام .lean() مع تفعيل getters
    // هذا سيضمن أن حقل 'referrer' سيتم فك تشفيره تلقائيًا إذا وجد
    let userRecordDoc = await Referral.findOne({ user: userPublicKeyString });
    let userRecord = userRecordDoc ? userRecordDoc.toObject() : null;

    let wasCreated = false;

    // الخطوة 2: إذا لم يتم العثور على المستخدم، قم بإنشاء سجل جديد
    if (!userRecord) {
        wasCreated = true;
        let referrerToSet = null;

        if (potentialReferrerKeyString) {
            try {
                // تحقق من أن المحيل ليس هو المستخدم نفسه
                if (potentialReferrerKeyString !== userPublicKeyString) {
                    // لا نحتاج للتحقق من وجود المحيل هنا، فقط نثق في المدخلات.
                    // عملية التحقق من صحة المحيل يمكن أن تتم في طبقة أعلى إذا لزم الأمر.
                    referrerToSet = potentialReferrerKeyString;
                } else {
                     console.warn(`ReferralService: Attempted to set referrer to the user themselves. Ignoring.`);
                }
            } catch (e) {
                 console.error(`ReferralService: Invalid potentialReferrerKeyString format provided: ${potentialReferrerKeyString}. Error: ${e.message}`);
            }
        }
        
        console.log(`ReferralService: User not found. Creating new record with referrer: ${referrerToSet || 'None'}`);
        
        // عند الإنشاء، سيقوم 'setter' في الموديل بتشفير حقل 'referrer' تلقائيًا
        const createdUser = await Referral.create({
            user: userPublicKeyString,
            referrer: referrerToSet,
        });

        // استخدم .toObject() لتحويل مستند Mongoose إلى كائن عادي،
        // وهذا سيقوم بتطبيق 'getter' لفك تشفير حقل 'referrer' الذي تم تشفيره للتو.
        userRecord = createdUser.toObject();

    } else {
        console.log(`ReferralService: Found existing user record for ${userPublicKeyString}.`);
        // userRecord هنا بالفعل يحتوي على حقل referrer مفكوك التشفير بفضل .lean({ getters: true })
    }

    // الخطوة 3: إرجاع النتيجة
    // لا حاجة لفك تشفير يدوي هنا على الإطلاق.
    console.log(`ReferralService (findOrCreateUserOnly): Returning. Referrer (from getter): ${userRecord.referrer || 'None'}, WasCreated: ${wasCreated}`);
    return { record: userRecord, wasCreated };
}

/**
 * (النسخة النهائية والمعدلة)
 * يعالج عملية تأكيد الإغلاق، ويحدث عدادات المستخدم، ويحدد ما إذا كانت هذه هي أول عملية إغلاق ناجحة للمستخدم.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم.
 * @param {number} numberOfClosedAccounts - عدد الحسابات المغلقة.
 * @param {string|null} referrerFromUrlIfAny - المفتاح العام للمحيل من URL (لربط المستخدم الجديد فقط).
 * @returns {Promise<{userRecord: object, wasFirstEverCloseAction: boolean}>} - كائن يحتوي على سجل المستخدم المحدث، وعلامة تشير إلى ما إذا كانت هذه أول عملية إغلاق.
 */
async function findOrCreateUserAndUpdateCounts(userPublicKeyString, numberOfClosedAccounts, referrerFromUrlIfAny) {
    console.log(`ReferralService (findOrCreateUserAndUpdateCounts): User=${userPublicKeyString}, Closed=${numberOfClosedAccounts}, ReferrerFromUrl=${referrerFromUrlIfAny || 'None'}`);

    // الخطوة 1: ابحث عن المستخدم أولاً دون تعديل أي شيء
    const initialUserDoc = await Referral.findOne({ user: userPublicKeyString });

    let wasFirstEverCloseAction = false;
    
    // الخطوة 2: تحقق مما إذا كانت هذه هي أول عملية إغلاق
    // إذا لم يكن هناك سجل، أو كان عدد الإغلاقات صفرًا، فهذه هي المرة الأولى.
    if (!initialUserDoc || initialUserDoc.closedAccounts === 0) {
        wasFirstEverCloseAction = true;
        console.log(`ReferralService: Detected first-ever close action for user ${userPublicKeyString}.`);
    }

    // الخطوة 3: قم بإنشاء/تحديث سجل المستخدم وزيادة عدادات الإغلاق
    // نستخدم findOneAndUpdate مع upsert: true لدمج منطق الإنشاء والتحديث
    const updatedUserDoc = await Referral.findOneAndUpdate(
        { user: userPublicKeyString },
        { 
            $inc: { 
                closedAccounts: numberOfClosedAccounts, 
                weeklyClosedAccounts: numberOfClosedAccounts 
            },
            // استخدم $setOnInsert لتعيين المحيل فقط عند إنشاء السجل لأول مرة
            // هذا يمنع تغيير المحيل الأصلي في المستقبل
            $setOnInsert: { 
                referrer: referrerFromUrlIfAny && referrerFromUrlIfAny !== userPublicKeyString ? referrerFromUrlIfAny : null
            }
        },
        { 
            new: true, // أرجع المستند المحدث
            upsert: true, // أنشئ المستند إذا لم يكن موجودًا
            setDefaultsOnInsert: true
        }
    );
    
    if (!updatedUserDoc) {
        // هذا السيناريو لا يجب أن يحدث مع upsert: true، ولكنه احترازي
        throw new Error(`Failed to find or create user record for ${userPublicKeyString}.`);
    }
    
    // الخطوة 4: حوّل المستند إلى كائن عادي لتطبيق الـ getters بشكل صحيح
    const updatedUserRecord = updatedUserDoc.toObject();

    console.log(`ReferralService: User record for ${userPublicKeyString} is now updated. Referrer: ${updatedUserRecord.referrer || 'None'}`);

    // الخطوة 5: أرجع السجل المحدث والعلامة التي تحدد ما إذا كانت هذه أول عملية
    return { userRecord: updatedUserRecord, wasFirstEverCloseAction: wasFirstEverCloseAction };
}

/**
 * (النسخة النهائية والمعدلة)
 * يقوم بتحديث إحصائيات المحيل (الأرباح، وعداد الإحالات إذا لزم الأمر).
 * @param {string|null} actualReferrerInDB - المفتاح العام للمحيل.
 * @param {bigint} platformFeeLamportsBigInt - إجمالي رسوم المنصة.
 * @param {boolean} isFirstEverCloseAction - هل هذه أول عملية إغلاق للمستخدم المُحال؟
 */
async function updateReferrerStats(actualReferrerInDB, platformFeeLamportsBigInt, isFirstEverCloseAction) {
    if (!actualReferrerInDB) {
        console.log("ReferralService (updateReferrerStats): No actual referrer. Skipping update.");
        return;
    }

    const updateData = { $inc: {} };
    let logMessage = `Updating stats for referrer ${actualReferrerInDB}:`;

    // 1. تحديث الأرباح دائمًا إذا كانت هناك رسوم
    if (platformFeeLamportsBigInt > 0) {
        const referralCommissionLamportsBigInt = (platformFeeLamportsBigInt * BigInt(REFERRAL_COMMISSION_PERCENT_CONTRACT)) / BigInt(100);
        const commissionAsNumber = Number(referralCommissionLamportsBigInt);
        
        if (commissionAsNumber > 0) {
            updateData.$inc.totalEarnings = commissionAsNumber;
            updateData.$inc.weeklyEarnings = commissionAsNumber;
            logMessage += ` Earnings +${commissionAsNumber}.`;
        }
    }

    // 2. تحديث عدادات الإحالة فقط إذا كانت هذه هي أول عملية إغلاق ناجحة للمُحال
    if (isFirstEverCloseAction) {
        updateData.$inc.referralsCount = 1;
        updateData.$inc.weeklyReferralsCount = 1;
        logMessage += ` Referrals +1.`;
    }

    // 3. قم بتنفيذ التحديث فقط إذا كان هناك شيء لتحديثه
    if (Object.keys(updateData.$inc).length === 0) {
        console.log(`ReferralService (updateReferrerStats): No earnings or counters to update for referrer ${actualReferrerInDB}.`);
        return;
    }

    console.log(logMessage);
    try {
        await Referral.findOneAndUpdate(
            { user: actualReferrerInDB },
            updateData,
            { upsert: true, setDefaultsOnInsert: true }
        );
        console.log(`ReferralService: Referrer stats for ${actualReferrerInDB} updated successfully.`);
    } catch (error) {
        console.error(`!!! ReferralService ERROR updating referrer stats for ${actualReferrerInDB}:`, error);
    }
}

/**
 * (النسخة النهائية والمعدلة)
 * يجلب معلومات الإحالة لمستخدم معين. إذا كان المستخدم موجودًا وليس لديه رمز إحالة،
 * فسيتم إنشاء رمز فريد وتعيينه له وحفظه في قاعدة البيانات.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم.
 * @returns {Promise<object>} - كائن يحتوي على بيانات الإحالة الكاملة.
 */
async function getReferralInfo(userPublicKeyString) {
    console.log(`ReferralService (getReferralInfo): Querying for user: ${userPublicKeyString}`);
    let userRecord;
    try {
        // الخطوة 1: ابحث عن مستند Mongoose أولاً (بدون .lean() أو .toObject())
        let userRecordDoc = await Referral.findOne({ user: userPublicKeyString });

        // الخطوة 2: إذا وجدنا المستخدم ولكنه يفتقر إلى رمز إحالة، قم بإنشاء واحد.
        if (userRecordDoc && !userRecordDoc.referralCode) {
            console.log(`User ${userPublicKeyString} found but has no referral code. Generating one...`);
            let newCode;
            let codeExists = true;
            let attempts = 0;
            const MAX_ATTEMPTS = 10; // لمنع حلقة لا نهائية

            while (codeExists && attempts < MAX_ATTEMPTS) {
                attempts++;
                newCode = generateReferralCode();
                const existingUserWithCode = await Referral.findOne({ referralCode: newCode }).select('_id');
                if (!existingUserWithCode) {
                    codeExists = false;
                }
            }
            
            if (!codeExists) {
                console.log(`Assigning new, unique referral code '${newCode}' to user ${userPublicKeyString}`);
                userRecordDoc.referralCode = newCode;
                try {
                    // احفظ التغيير في قاعدة البيانات، وأعد تعيين userRecordDoc بالمستند المحدث
                    userRecordDoc = await userRecordDoc.save(); 
                } catch (saveError) {
                    console.error(`Error saving new referral code for user ${userPublicKeyString}. This might happen in a race condition. The user will be served without a code for now. Error:`, saveError.message);
                    // في حالة حدوث خطأ نادر، استمر بدونه لهذه المرة
                    userRecordDoc = await Referral.findOne({ user: userPublicKeyString });
                }
            } else {
                 console.error(`Could not generate a unique referral code after ${MAX_ATTEMPTS} attempts. The user will be served without a code for now.`);
            }
        }
        
        // الخطوة 3: الآن، قم بتحويل المستند إلى كائن عادي لتطبيق getters
        userRecord = userRecordDoc ? userRecordDoc.toObject() : null;

    } catch (dbError) {
        console.error(`ReferralService (getReferralInfo): DB error querying for ${userPublicKeyString}:`, dbError.message);
        userRecord = null; // تعامل مع خطأ قاعدة البيانات كأن المستخدم غير موجود
    }

    let finalReferralData;

    // الخطوة 4: إذا وجدنا السجل (أو تم تحديثه)، قم بتنسيقه وإضافة الحقول المحسوبة
    if (userRecord) {
        console.log(`ReferralService (getReferralInfo): Data found. Referrer (from getter) is: ${userRecord.referrer || 'None'}. Code: ${userRecord.referralCode || 'N/A'}`);
        // لا حاجة لفك تشفير يدوي هنا على الإطلاق
        finalReferralData = {
            ...userRecord,
            totalEarningsSol: (userRecord.totalEarnings || 0) / LAMPORTS_PER_SOL,
            weeklyEarningsSol: (userRecord.weeklyEarnings || 0) / LAMPORTS_PER_SOL,
            closedAccounts: userRecord.closedAccounts || 0,
            referralsCount: userRecord.referralsCount || 0,
            weeklyClosedAccounts: userRecord.weeklyClosedAccounts || 0,
            weeklyReferralsCount: userRecord.weeklyReferralsCount || 0,
            totalEarningsLamports: userRecord.totalEarnings || 0,
            weeklyEarningsLamports: userRecord.weeklyEarnings || 0,
        };
    } else {
        // الخطوة 5: إذا لم يتم العثور على السجل، قم بإنشاء كائن افتراضي
        console.log(`ReferralService (getReferralInfo): No data for ${userPublicKeyString}. Returning default structure.`);
        finalReferralData = {
            user: userPublicKeyString, referrer: null, referralCode: null, totalEarnings: 0, referralsCount: 0,
            closedAccounts: 0, weeklyEarnings: 0, weeklyClosedAccounts: 0, weeklyReferralsCount: 0,
            createdAt: new Date(), updatedAt: new Date(), totalEarningsSol: 0.0, weeklyEarningsSol: 0.0,
            totalEarningsLamports: 0, weeklyEarningsLamports: 0, isNewUser: true
        };
    }
    
    return finalReferralData;
}


/**
 * يتحقق مما إذا كان المستخدم مؤهلاً لسحب أرباحه.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم.
 * @returns {Promise<{eligible: boolean, earningsLamports: number, error?: string}>}
 */
async function checkWithdrawalEligibility(userPublicKeyString) {
    console.log(`ReferralService (checkWithdrawalEligibility): Checking for ${userPublicKeyString}`);
    const referralData = await Referral.findOne({ user: userPublicKeyString }).lean(); // لا نحتاج لفك تشفير المحيل هنا

    if (!referralData) {
        return { eligible: false, earningsLamports: 0, error: "User record not found." };
    }
    const earningsLamports = referralData.totalEarnings || 0;
    const minWithdrawLamports = BigInt(Math.ceil(MIN_REFERRAL_WITHDRAW_SOL * LAMPORTS_PER_SOL));

    if (BigInt(earningsLamports) < minWithdrawLamports) {
        return {
            eligible: false,
            earningsLamports: earningsLamports,
            error: `Insufficient referral balance. Minimum withdrawal is ${MIN_REFERRAL_WITHDRAW_SOL} SOL.`
        };
    }
    return { eligible: true, earningsLamports: earningsLamports };
}

/**
 * يقوم بتصفير رصيد أرباح المستخدم بعد السحب الناجح.
 * @param {string} userPublicKeyString - المفتاح العام للمستخدم.
 */
async function resetUserEarnings(userPublicKeyString) {
    console.log(`ReferralService (resetUserEarnings): Resetting earnings for ${userPublicKeyString}.`);
    try {
        await Referral.findOneAndUpdate(
            { user: userPublicKeyString },
            { $set: { totalEarnings: 0 } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        console.log(`ReferralService (resetUserEarnings): User ${userPublicKeyString} earnings reset to 0.`);
    } catch (dbUpdateError) {
        console.error(`!!! ReferralService CRITICAL: DB error resetting earnings for ${userPublicKeyString} !!!`, dbUpdateError);
    }
}

/**
 * @async
 * @function getWeeklyTopReferrers
 * @description يجلب قائمة أفضل المحيلين بناءً على عدد الإحالات الجديدة التي قاموا بها خلال الأسبوع الحالي/المنتهي (`weeklyReferralsCount`).
 * يُستخدم لعرض لوحة المتصدرين الأسبوعية للمحيلين ولتحديد الفائزين بالجوائز الأسبوعية.
 * @param {number} [limit=15] - الحد الأقصى لعدد المستخدمين المراد جلبه.
 * @returns {Promise<Array<object>>} مصفوفة من سجلات المستخدمين مرتبة.
 */
async function getWeeklyTopReferrers(limit = 15) { // تم تغيير اسم الدالة
    console.log(`ReferralService: Fetching top ${limit} referrers by *weekly* referral count.`);
    try {
        // البحث عن المستخدمين الذين لديهم weeklyReferralsCount > 0
        // الترتيب تنازليًا حسب weeklyReferralsCount، ثم weeklyEarnings (كترتيب ثانوي)
        const topReferrers = await Referral.find({ weeklyReferralsCount: { $gt: 0 } })
            .sort({ weeklyReferralsCount: -1, weeklyEarnings: -1 }) // *** الترتيب الأساسي بـ weeklyReferralsCount ***
            .limit(limit)
            .lean({ getters: true });
        console.log(`ReferralService: Found ${topReferrers.length} top weekly referrers.`);
        return topReferrers;
    } catch (error) {
        console.error("!!! ReferralService ERROR fetching top weekly referrers:", error);
        return [];
    }
}


/**
 * يجلب أفضل المغلقين بناءً على عدد الحسابات المغلقة أسبوعيًا.
 * (ملاحظة: لا نحتاج لفك تشفير referrer هنا)
 * @param {number} limit - عدد النتائج المطلوبة.
 * @returns {Promise<Array<object>>}
 */
async function getTopClosersByWeeklyCount(limit = 10) {
    console.log(`ReferralService (getTopClosers): Fetching top ${limit}`);
    try {
        const topClosersRaw = await Referral.find({ weeklyClosedAccounts: { $gt: 0 } })
            .sort({ weeklyClosedAccounts: -1 })
            .limit(limit)
            .lean();
        console.log(`ReferralService (getTopClosers): Found ${topClosersRaw.length} raw records.`);
        return topClosersRaw;
    } catch (error) {
        console.error("!!! ReferralService ERROR fetching top closers:", error);
        return [];
    }
}

/**
 * يقوم بتصفير جميع العدادات الأسبوعية في قاعدة البيانات.
 * @returns {Promise<{matchedCount: number, modifiedCount: number}>}
 */
async function resetAllWeeklyCounters() {
    console.log(`ReferralService: Resetting all weekly counters...`);
    try {
        const updateResult = await Referral.updateMany(
            { $or: [
                { weeklyEarnings: { $ne: 0 } },
                { weeklyClosedAccounts: { $ne: 0 } },
                { weeklyReferralsCount: { $ne: 0 } },
            ]},
            { $set: {
                weeklyEarnings: 0,
                weeklyClosedAccounts: 0,
                weeklyReferralsCount: 0,
            }}
        );
        console.log(`ReferralService: Reset weekly counters. Matched: ${updateResult.matchedCount}, Modified: ${updateResult.modifiedCount}`);
        return { matchedCount: updateResult.matchedCount, modifiedCount: updateResult.modifiedCount };
    } catch (error) {
         console.error(`!!! ReferralService ERROR during Weekly Counters Reset !!!`, error);
         throw error;
    }
}

/**
 * يحسب إجمالي الأرباح المعلقة (غير المسحوبة) للمحيلين.
 * @returns {Promise<bigint>}
 */
async function getTotalOutstandingReferralFees() {
     console.log(`ReferralService: Calculating total outstanding referral fees...`);
     try {
         const aggregation = await Referral.aggregate([
             { $group: { _id: null, total: { $sum: '$totalEarnings' } } }
         ]);
         const totalLamports = aggregation.length > 0 ? aggregation[0].total : 0;
         const totalLamportsRounded = Math.round(totalLamports);
         console.log(`ReferralService: Total outstanding fees calculated: ${totalLamportsRounded} lamports`);
         return BigInt(totalLamportsRounded);
     } catch (error) {
         console.error("!!! ReferralService ERROR calculating outstanding fees:", error);
         return BigInt(0);
     }
}

/**
 * يعالج معاملة إغلاق ناجحة. يقوم بإنشاء المستخدم إذا لم يكن موجودًا،
 * ويربطه بالمحيل، ويزيد عدادات الإغلاق.
 * @param {string} userPublicKeyString - المستخدم الذي قام بالإغلاق.
 * @param {number} closedCount - عدد الحسابات المغلقة.
 * @param {string|null} referrerFromUrl - المحيل المحتمل من الواجهة.
 * @returns {Promise<{actualReferrer: string|null, wasNewUser: boolean}>}
 */
async function processSuccessfulClose(userPublicKeyString, closedCount, referrerFromUrl) {
    let userRecord = await Referral.findOne({ user: userPublicKeyString });
    
    let wasNewUser = false;
    let actualReferrer = null;

    if (!userRecord) {
        // المستخدم جديد تمامًا
        wasNewUser = true;
        
        let referrerToSet = null;
        if (referrerFromUrl && referrerFromUrl !== userPublicKeyString) {
            referrerToSet = referrerFromUrl;
        }

        userRecord = await Referral.create({
            user: userPublicKeyString,
            referrer: referrerToSet,
            closedAccounts: closedCount,
            weeklyClosedAccounts: closedCount,
            // referralCode: ... (إذا كنت تستخدمه)
        });
        
        actualReferrer = referrerToSet;
        
    } else {
        // المستخدم موجود بالفعل، فقط قم بزيادة عدادات الإغلاق
        userRecord.closedAccounts += closedCount;
        userRecord.weeklyClosedAccounts += closedCount;
        await userRecord.save();
        
        // المحيل الفعلي هو المحيل المسجل بالفعل في قاعدة البيانات
        // نحتاج إلى فك تشفيره (لأننا لم نستخدم .lean({getters:true}))
        actualReferrer = userRecord.get('referrer'); 
    }

    return { actualReferrer, wasNewUser };
}

async function findUserByCode(code) {
    if (!code) return null;
    return await Referral.findOne({ referralCode: code }).lean({ getters: true });
}

/**
 * يحصل على إحصائيات مجمعة لشريك معين بناءً على رمز الإحالة الخاص به.
 * @param {string} refCode - رمز الإحالة الخاص بالشريك.
 * @returns {Promise<object|null>} - كائن يحتوي على الإحصائيات، أو null إذا كان الرمز غير صالح.
 */
async function getStatsForReferralCode(refCode) {
    if (!refCode) return null;

    // 1. ابحث عن المستخدم (الشريك) صاحب رمز الإحالة
    const partner = await Referral.findOne({ referralCode: refCode.toUpperCase() }).lean();

    if (!partner) {
        return null; // الرمز غير موجود
    }

    // 2. احصل على الإحصائيات المباشرة من سجل الشريك
    const userCount = partner.referralsCount || 0;
    const totalEarningsLamports = partner.totalEarnings || 0;
    const totalEarningsSOL = totalEarningsLamports / LAMPORTS_PER_SOL;

    // 3. احسب إجمالي المعاملات من جميع المستخدمين الذين أحالهم هذا الشريك
    // هذا هو الجزء الأكثر تعقيدًا لأنه يتطلب تجميع البيانات
    const referredUsersStats = await Referral.aggregate([
        {
            // ابحث عن جميع المستخدمين الذين محيلهم هو هذا الشريك
            // ملاحظة: يجب علينا تشفير عنوان الشريك للبحث في الحقل المشفر
            $match: { referrer: encryptData(partner.user) } // `encryptData` يجب أن تكون متاحة في هذا النطاق
        },
        {
            // قم بتجميعهم وحساب مجموع إغلاقاتهم
            $group: {
                _id: null,
                totalTransactions: { $sum: "$closedAccounts" }
            }
        }
    ]);

    const transactionCount = referredUsersStats.length > 0 ? referredUsersStats[0].totalTransactions : 0;

    // 4. أعد الكائن النهائي بالصيغة المطلوبة
    return {
        userCount,
        transactionCount,
        totalEarningsSOL: parseFloat(totalEarningsSOL.toFixed(6)) // تقريب لـ 6 خانات عشرية
    };
}

module.exports = {
    findOrCreateUserAndUpdateCounts,
    updateReferrerStats,
    getReferralInfo,
    checkWithdrawalEligibility,
    resetUserEarnings,
    getWeeklyTopReferrers,
    getTopClosersByWeeklyCount,
    resetAllWeeklyCounters,
    getTotalOutstandingReferralFees,
    findOrCreateUserOnly,
    processSuccessfulClose,
    findUserByCode,
    getStatsForReferralCode,
};

