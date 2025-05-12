// backend/__tests__/platformEarningService.test.js

// استيراد الدالة التي نريد اختبارها
const { calculateNetFeeToTreasury } = require('../services/platformEarningService');
// استيراد الثابت بشكل صحيح
const { REFERRAL_COMMISSION_PERCENT_CONTRACT } = require('../config/constants');

// وصف مجموعة الاختبارات لهذه الخدمة
describe('PlatformEarningService', () => {

    // وصف الاختبارات الخاصة بدالة calculateNetFeeToTreasury
    describe('calculateNetFeeToTreasury', () => {

        // حالة الاختبار 1: لا يوجد محيل
        test('should return the full platform fee when there is no referrer', () => {
            const platformFee = BigInt(1000000); // 1 مليون لامبورت
            const hasReferrer = false;
            const expectedNetFee = BigInt(1000000);

            // استدعاء الدالة وحفظ النتيجة
            const actualNetFee = calculateNetFeeToTreasury(platformFee, hasReferrer);

            // التأكد من أن النتيجة الفعلية تساوي النتيجة المتوقعة
            expect(actualNetFee).toBe(expectedNetFee);
        });

        // حالة الاختبار 2: يوجد محيل ورسوم موجبة
        test('should return the platform fee minus referral commission when there is a referrer', () => {
            const platformFee = BigInt(1000000); // 1 مليون لامبورت
            const hasReferrer = true;
            // حساب العمولة المتوقعة (25% من 1 مليون = 250 ألف)
            const expectedCommission = (platformFee * BigInt(REFERRAL_COMMISSION_PERCENT_CONTRACT)) / BigInt(100);
            // حساب الصافي المتوقع (1 مليون - 250 ألف = 750 ألف)
            const expectedNetFee = platformFee - expectedCommission;

            const actualNetFee = calculateNetFeeToTreasury(platformFee, hasReferrer);

            expect(actualNetFee).toBe(expectedNetFee);
        });

        // حالة الاختبار 3: رسوم منصة صفرية (مع أو بدون محيل)
        test('should return zero when platform fee is zero', () => {
            const platformFee = BigInt(0);
            expect(calculateNetFeeToTreasury(platformFee, false)).toBe(BigInt(0));
            expect(calculateNetFeeToTreasury(platformFee, true)).toBe(BigInt(0));
        });

         // حالة الاختبار 4: رسوم منصة صغيرة جدًا
         test('should handle small platform fees correctly with referrer', () => {
            const platformFee = BigInt(10); // 10 lamports
            const hasReferrer = true;
            // العمولة = (10 * 25) / 100 = 2.5 -> تصبح 2 (قسمة صحيحة في BigInt)
            const expectedCommission = (platformFee * BigInt(REFERRAL_COMMISSION_PERCENT_CONTRACT)) / BigInt(100); // = 2n
            const expectedNetFee = platformFee - expectedCommission; // 10 - 2 = 8n

            const actualNetFee = calculateNetFeeToTreasury(platformFee, hasReferrer);
            expect(actualNetFee).toBe(expectedNetFee);
         });
    });
});