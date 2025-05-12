// backend/controllers/debugController.js
const { runTopReferrersRewardJob, runTopClosersRewardJob } = require('../jobs/rewardJobs');
const { runResetWeeklyCountersJob } = require('../jobs/maintenanceJobs');
const { runTreasurySweepJob } = require('../jobs/treasuryJob');

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
            // --- تم حذف حالة 'hot-wallet-funding' ---
            case 'treasury-sweep':
                jobPromise = runTreasurySweepJob();
                jobFriendlyName = "Treasury Sweep to Final Storage";
                break;
            default:
                return res.status(404).json({ success: false, error: 'Job not found' });
        }
        res.status(202).json({ success: true, message: `Job '${jobFriendlyName}' triggered successfully. Check server logs for details.` });
        await jobPromise;
        console.log(`[Debug API] Job '${jobFriendlyName}' completed.`);
    } catch (error) {
         console.error(`[Debug API] Error triggering job ${jobName}:`, error);
    }
};
module.exports = { triggerJob };