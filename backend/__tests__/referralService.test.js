// backend/__tests__/referralService.test.js

process.env.ENCRYPTION_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

const {
    getReferralInfo,
    findOrCreateUserAndUpdateCounts,
    updateReferrerStats,
    checkWithdrawalEligibility,
    resetUserEarnings,
    findOrCreateUserOnly
} = require('../services/referralService');
const { LAMPORTS_PER_SOL, REFERRAL_COMMISSION_PERCENT_CONTRACT, MIN_REFERRAL_WITHDRAW_SOL } = require('../config/constants');
const { Keypair } = require('@solana/web3.js');

const mockLean = jest.fn();
const mockToObject = jest.fn();

jest.mock('../models/Referral', () => ({
    findOne: jest.fn(() => ({ // افتراضيًا يُرجع كائنًا به lean
        lean: mockLean
    })),
    findOneAndUpdate: jest.fn(() => ({
        lean: mockLean
    })),
    create: jest.fn(() => ({
        toObject: mockToObject
    })),
    updateMany: jest.fn(),
    aggregate: jest.fn(),
}));
const Referral = require('../models/Referral');

describe('ReferralService', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        mockLean.mockReset();
        mockToObject.mockReset();
    });

    describe('getReferralInfo', () => {
        test('should return user data with calculated SOL when user exists', async () => {
            const mockUserData = {
                user: 'ExistingUserPublicKey123', referrer: 'iv:tag:encryptedReferrer',
                totalEarnings: 150000000, weeklyEarnings: 50000000,
                referralsCount: 5, closedAccounts: 25, weeklyClosedAccounts: 10, weeklyReferralsCount: 2,
            };
            mockLean.mockResolvedValue(mockUserData);

            const result = await getReferralInfo('ExistingUserPublicKey123');

            expect(Referral.findOne).toHaveBeenCalledWith({ user: 'ExistingUserPublicKey123' });
            expect(mockLean).toHaveBeenCalledTimes(1);
            expect(result.user).toBe('ExistingUserPublicKey123');
            expect(result.totalEarningsSol).toBeCloseTo(0.15);
            expect(result.isNewUser).toBeUndefined();
        });

        test('should return default structure when user does not exist', async () => {
            mockLean.mockResolvedValue(null);
            const result = await getReferralInfo('NewUserPublicKey789');
            expect(result.isNewUser).toBe(true);
            expect(result.user).toBe('NewUserPublicKey789');
        });

        test('should return default structure when findOne throws an error', async () => {
            const dbError = new Error("Simulated DB Error for findOne");
            // --- تعديل هنا: جعل findOne يرمي الخطأ، وليس .lean() ---
            Referral.findOne.mockImplementation(() => {
                 // لا نرجع كائنًا به .lean()، بل نرمي الخطأ مباشرة من findOne
                throw dbError;
            });
            // -----------------------------------------------------

            const result = await getReferralInfo('UserWithErrorXYZ');
            expect(result.isNewUser).toBe(true);
            expect(result.user).toBe('UserWithErrorXYZ');
            expect(mockLean).not.toHaveBeenCalled(); // .lean() لا يجب أن يُستدعى
        });
    });

    // ... (باقي اختبارات referralService.test.js كما هي، مع التأكد من أن محاكاة .lean و .toObject يتم استدعاؤها بشكل صحيح)
    // على سبيل المثال، في findOrCreateUserOnly:
    describe('findOrCreateUserOnly', () => {
        const userKey = Keypair.generate().publicKey.toBase58();
        const referrerKey = Keypair.generate().publicKey.toBase58();

        test('should find existing user and return their record', async () => {
            const encryptedReferrer = "iv:tag:someEncryptedData";
            const mockExistingUser = { user: userKey, referrer: encryptedReferrer };
            // إعادة تعيين mockLean قبل هذا الاختبار للتأكد من أنه لا يتأثر باختبارات سابقة
            mockLean.mockReset().mockResolvedValue(mockExistingUser);
            // تأكد أن findOne يُرجع الكائن الذي يحتوي على lean
            Referral.findOne.mockImplementation(() => ({ lean: mockLean }));


            const result = await findOrCreateUserOnly(userKey, null);

            expect(Referral.findOne).toHaveBeenCalledWith({ user: userKey });
            expect(mockLean).toHaveBeenCalledTimes(1);
            expect(Referral.create).not.toHaveBeenCalled();
            expect(result.wasCreated).toBe(false);
            expect(result.record.user).toBe(userKey);
            // هنا، decryptDataLocal ستُرجع القيمة المشفرة لأن مفتاح التشفير في الاختبار وهمي
            expect(result.record.referrer).toBe(encryptedReferrer);
        });

        test('should create new user with referrer if potentialReferrer is valid', async () => {
            // إعداد findOne ليرجع null
            mockLean.mockReset().mockResolvedValue(null);
            Referral.findOne.mockImplementation(() => ({ lean: mockLean }));

            const expectedNewRecordPlain = { user: userKey, referrer: referrerKey }; // البيانات قبل toObject
            // إعداد create ليرجع كائنًا به toObject
            mockToObject.mockReset().mockReturnValue(expectedNewRecordPlain); // toObject يرجع البيانات العادية
             Referral.create.mockImplementation(() => ({ toObject: mockToObject }));


            const result = await findOrCreateUserOnly(userKey, referrerKey);

            expect(Referral.create).toHaveBeenCalledWith(expect.objectContaining({ referrer: referrerKey }));
            expect(result.wasCreated).toBe(true);
            // decryptDataLocal ستُستدعى على referrerKey (الذي لم يُشفر بعد من DB)
            // لذا، يجب أن تُرجع referrerKey كما هو
            expect(result.record.referrer).toBe(referrerKey);
        });
    });
    // ... (أكمل باقي الاختبارات بنفس الطريقة، مع التأكد من أن mockLean و mockToObject يتم استدعاؤهما كما هو متوقع)
    // ... (اختبارات findOrCreateUserAndUpdateCounts, updateReferrerStats, checkWithdrawalEligibility, resetUserEarnings)

    // مثال لتصحيح اختبار في findOrCreateUserAndUpdateCounts
    describe('findOrCreateUserAndUpdateCounts', () => {
        const existingUserKey = Keypair.generate().publicKey.toBase58();
        const newUserKey = Keypair.generate().publicKey.toBase58();
        const validReferrerKey = Keypair.generate().publicKey.toBase58();

        test('should find existing user, update counts, and return correct flags', async () => {
            const encryptedExistingReferrer = "iv:tag:existingUserReferrer";
            const existingUserDataRaw = { user: existingUserKey, referrer: encryptedExistingReferrer, closedAccounts: 10, weeklyClosedAccounts: 2 };
            const expectedUpdatedRecordRaw = { ...existingUserDataRaw, closedAccounts: 15, weeklyClosedAccounts: 7, referrer: encryptedExistingReferrer };

            // المحاكاة لـ findOne في findOrCreateUserOnly
            mockLean.mockReset().mockResolvedValueOnce(existingUserDataRaw);
            Referral.findOne.mockImplementationOnce(() => ({ lean: mockLean }));

            // المحاكاة لـ findOneAndUpdate
            mockLean.mockResolvedValueOnce(expectedUpdatedRecordRaw);
            Referral.findOneAndUpdate.mockImplementationOnce(() => ({ lean: mockLean }));


            const result = await findOrCreateUserAndUpdateCounts(existingUserKey, 5, null);

            expect(Referral.findOne).toHaveBeenCalledWith({ user: existingUserKey });
            expect(Referral.findOneAndUpdate).toHaveBeenCalledWith(
                { user: existingUserKey },
                { $inc: { closedAccounts: 5, weeklyClosedAccounts: 5 } },
                { new: true, upsert: false }
            );
            expect(Referral.create).not.toHaveBeenCalled();
            expect(result.userRecord.closedAccounts).toBe(15);
            expect(result.userRecord.referrer).toBe(encryptedExistingReferrer);
            expect(result.wasNewUserWithReferrer).toBe(false);
        });
    });
    // ... أكمل بنفس الطريقة لباقي الاختبارات
    describe('updateReferrerStats', () => {
        const mockReferrerKey = Keypair.generate().publicKey.toBase58();

        test('should inc earnings and counts if new referral and positive fee', async () => {
            const platformFee = BigInt(2000000);
            const expectedCommission = Number((platformFee * BigInt(REFERRAL_COMMISSION_PERCENT_CONTRACT)) / BigInt(100));
            const expectedInc = {
                totalEarnings: expectedCommission, weeklyEarnings: expectedCommission,
                referralsCount: 1, weeklyReferralsCount: 1,
            };
            Referral.findOneAndUpdate.mockResolvedValue({});

            await updateReferrerStats(mockReferrerKey, platformFee, true);

            expect(Referral.findOneAndUpdate).toHaveBeenCalledWith(
                { user: mockReferrerKey },
                { $inc: expectedInc },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
        });
    });

    describe('checkWithdrawalEligibility', () => {
        const mockUserKey = Keypair.generate().publicKey.toBase58();
        const minWithdrawLamports = BigInt(Math.ceil(MIN_REFERRAL_WITHDRAW_SOL * LAMPORTS_PER_SOL));

        test('should return not eligible if user record not found', async () => {
            mockLean.mockReset().mockResolvedValue(null);
            Referral.findOne.mockImplementationOnce(() => ({ lean: mockLean }));
            const result = await checkWithdrawalEligibility(mockUserKey);
            expect(result.eligible).toBe(false);
            expect(result.error).toBe("User record not found.");
        });
    });

    describe('resetUserEarnings', () => {
        const mockUserKey = Keypair.generate().publicKey.toBase58();
        test('should call findOneAndUpdate to set totalEarnings to 0', async () => {
            Referral.findOneAndUpdate.mockResolvedValue({});
            await resetUserEarnings(mockUserKey);
            expect(Referral.findOneAndUpdate).toHaveBeenCalledWith(
                { user: mockUserKey },
                { $set: { totalEarnings: 0 } },
                { new: true, upsert: true, setDefaultsOnInsert: true }
            );
        });
    });

});