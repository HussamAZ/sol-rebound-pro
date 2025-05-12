// backend/jobs/rewardJobs.js
const rewardService = require('../services/rewardService'); // استيراد خدمة المكافآت فقط

/**
 * الدالة التي سيتم جدولتها لتوزيع مكافآت أفضل المحيلين.
 */
async function runTopReferrersRewardJob() {
    const JOB_NAME = "[Top Referrers Cron]";
    console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Starting Execution ---`);
    try {
        // *** لا نحتاج لحساب الفترة هنا، الخدمة تتعامل مع المنطق الآن ***

        // *** استدعاء الخدمة التي تقوم بكل شيء (بما في ذلك الإشعار) ***
        const results = await rewardService.distributeTopReferrerRewards();

        // تسجيل ملخص بسيط بناءً على النتائج المرتجعة (اختياري)
        if (results && results.length > 0) {
            console.log(`${JOB_NAME} Distribution completed via service. ${results.length} recipients processed. Check service logs and Telegram for details.`);
        } else {
            console.log(`${JOB_NAME} No rewards were distributed in this run (as reported by service).`);
        }

    } catch (error) {
        console.error(`[${new Date().toISOString()}] !!! ${JOB_NAME} UNCAUGHT ERROR During Execution !!!`, error);
        // يمكنك إضافة تنبيهات هنا
    } finally {
        console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Finished Execution ---`);
    }
}

/**
 * الدالة التي سيتم جدولتها لتوزيع مكافآت أفضل المغلقين.
 */
async function runTopClosersRewardJob() {
    const JOB_NAME = "[Top Closers Cron]";
    console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Starting Execution ---`);
    try {
        // *** لا نحتاج لحساب الفترة هنا ***
        // *** ولا للتحقق من اليوم ***

        // *** استدعاء الخدمة التي تقوم بكل شيء ***
        const results = await rewardService.distributeTopCloserRewards();

        // تسجيل ملخص بسيط (اختياري)
        if (results && results.length > 0) {
            console.log(`${JOB_NAME} Distribution completed via service. ${results.length} recipients processed. Check service logs and Telegram for details.`);
        } else {
            console.log(`${JOB_NAME} No rewards were distributed in this run (as reported by service).`);
        }

    } catch (error) {
        // *** هذا الـ catch سيلتقط الأخطاء من استدعاء الخدمة ***
        console.error(`[${new Date().toISOString()}] !!! ${JOB_NAME} UNCAUGHT ERROR During Execution !!!`, error);
        // يمكنك إضافة تنبيهات هنا
    } finally {
        console.log(`[${new Date().toISOString()}] --- ${JOB_NAME} Finished Execution ---`);
    }
}

module.exports = {
    runTopReferrersRewardJob,
    runTopClosersRewardJob,
};