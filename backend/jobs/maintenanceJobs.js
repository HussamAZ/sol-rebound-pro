// backend/jobs/maintenanceJobs.js
const referralService = require('../services/referralService'); // استيراد الخدمة المسؤولة عن عمليات الإحالة

/**
 * الدالة التي سيتم جدولتها لتصفير العدادات الأسبوعية للمستخدمين.
 * يُفترض أن تعمل هذه المهمة بعد توزيع المكافآت لبدء أسبوع جديد.
 * (مثال: الأحد 00:00 GMT)
 */
async function runResetWeeklyCountersJob() {
    const JOB_NAME = "[Weekly Counters Reset Cron]"; // اسم المهمة للسجلات
    console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Starting Execution ---`);

    try {
        // 1. استدعاء الخدمة لتنفيذ عملية التحديث
        // الخدمة ستقوم باستدعاء Referral.updateMany لتصفير الحقول:
        // weeklyEarnings, weeklyClosedAccounts, weeklyReferralsCount
        console.log(`${JOB_NAME} Attempting to reset weekly counters in the database...`);
        const updateResult = await referralService.resetAllWeeklyCounters();

        // 2. تسجيل نتيجة العملية
        console.log(`${JOB_NAME} Weekly counters reset operation finished. Matched: ${updateResult.matchedCount}, Modified: ${updateResult.modifiedCount}`);
        // ملاحظة: matchedCount قد يكون أكبر من modifiedCount إذا كانت بعض السجلات لديها بالفعل قيم صفرية.

    } catch (error) {
        // 3. التقاط وتسجيل أي أخطاء
        console.error(`[${new Date().toISOString()}] !!! ${JOB_NAME} UNCAUGHT ERROR During Execution !!!`, error);
        // إرسال تنبيه للمراقبة أمر بالغ الأهمية هنا، لأن فشل التصفير يؤثر على دورات المكافآت التالية.
        // alertMonitoringSystem(JOB_NAME, error);
    } finally {
        // 4. تسجيل انتهاء التنفيذ دائمًا
        console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Finished Execution ---`);
    }
}

// تصدير الدالة ليتم استخدامها في jobs/index.js
module.exports = {
    runResetWeeklyCountersJob,
};