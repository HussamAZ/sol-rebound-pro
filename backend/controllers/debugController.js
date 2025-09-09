// backend/controllers/debugController.js
const { runTopReferrersRewardJob, runTopClosersRewardJob } = require('../jobs/rewardJobs');
const { runResetWeeklyCountersJob } = require('../jobs/maintenanceJobs');
const { runTreasurySweepJob } = require('../jobs/treasuryJob');
const contestRewardService = require('../services/contestRewardService'); // <-- استيراد خدمة المسابقة

// دالة لتشغيل المهام المجدولة العادية
const triggerJob = async (req, res, next) => {
    const jobName = req.params.jobName;
    console.log(`[Debug API] Received request to trigger job: ${jobName}`);
    try {
        let jobPromise;
        let jobFriendlyName = jobName;

        switch (jobName) {
            case 'top-referrers':
                jobPromise = runTopReferrersRewardJob();
                jobFriendlyName = "Top Referrers Reward";
                break;
            case 'top-closers':
                jobPromise = runTopClosersRewardJob();
                jobFriendlyName = "Top Closers Reward";
                break;
            case 'reset-counters':
                jobPromise = runResetWeeklyCountersJob();
                jobFriendlyName = "Reset Weekly Counters";
                break;
            case 'treasury-sweep':
                jobPromise = runTreasurySweepJob();
                jobFriendlyName = "Treasury Sweep to Final Storage";
                break;
            default:
                return res.status(404).json({ success: false, error: 'Job not found' });
        }
        // أرسل الاستجابة فورًا بأن المهمة قد بدأت
        res.status(202).json({ success: true, message: `Job '${jobFriendlyName}' triggered successfully. Check server logs for execution details.` });
        // انتظر اكتمال المهمة في الخلفية
        await jobPromise;
        console.log(`[Debug API] Job '${jobFriendlyName}' completed its background execution.`);
    } catch (error) {
         console.error(`[Debug API] Error during background execution of job ${jobName}:`, error);
         // لا يمكن إرسال استجابة أخرى هنا لأنها أُرسلت بالفعل
    }
};

// دالة جديدة لتشغيل توزيع جوائز مسابقة الإطلاق
const triggerLaunchContestPayout = async (req, res, next) => {
    const jobName = "Launch Contest Payout";
    console.log(`[Debug API] Received request to trigger job: ${jobName}`);
    try {
        // نستدعي الخدمة وننتظر نتيجتها لأننا نريد إرجاع تفاصيلها
        const result = await contestRewardService.distributeLaunchContestRewards();
        console.log(`[Debug API] Job '${jobName}' completed. Result:`, JSON.stringify(result, null, 2));

        // إرجاع استجابة بناءً على نتيجة الخدمة
        return res.status(result.success ? 200 : 500).json({
            success: result.success,
            message: result.message || `Job '${jobName}' process finished. Check server logs and Telegram for details.`,
            data: {
                signatures: result.transactionSignatures || [], // تأكد من أن الاسم صحيح
                distributedTo: result.distributedTo,
                totalAmountAttemptedLamports: result.totalAmountAttemptedLamports
            }
        });
    } catch (error) { // يلتقط الأخطاء التي قد تحدث داخل استدعاء الخدمة إذا لم تتعامل معها الخدمة بالكامل
        console.error(`[Debug API] CRITICAL Error triggering job ${jobName}:`, error.message, error.stack);
        return res.status(500).json({
            success: false,
            error: `Critical error triggering job '${jobName}': ${error.message}`
        });
    }
};

module.exports = {
 triggerJob,
 triggerLaunchContestPayout, // <-- تصدير الدالة الجديدة
};
