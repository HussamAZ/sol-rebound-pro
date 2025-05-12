// backend/jobs/index.js
const cron = require('node-cron');
const { runTopReferrersRewardJob, runTopClosersRewardJob } = require('./rewardJobs');
const { runResetWeeklyCountersJob } = require('./maintenanceJobs');
const { runTreasurySweepJob } = require('./treasuryJob'); // <-- تم تغيير اسم الدالة المستوردة

function startCronJobs() {
    console.log("Scheduling cron jobs...");

    // 1. مكافأة أفضل المحيلين (السبت 23:40 GMT)
    cron.schedule('40 23 * * 6', runTopReferrersRewardJob, { scheduled: true, timezone: "Etc/GMT" });
    console.log("Scheduled: Top Referrers Reward Job (Sat 23:40 GMT)");

    // 2. مكافأة أفضل المغلقين (السبت 23:45 GMT)
    cron.schedule('45 23 * * 6', runTopClosersRewardJob, { scheduled: true, timezone: "Etc/GMT" });
    console.log("Scheduled: Top Closers Reward Job (Sat 23:45 GMT)");

    // 3. تصفير العدادات الأسبوعية (الأحد 00:00 GMT)
    cron.schedule('0 0 * * 0', runResetWeeklyCountersJob, { scheduled: true, timezone: "Etc/GMT" });
    console.log("Scheduled: Reset Weekly Counters Job (Sun 00:00 GMT)");

    // 4. كنس الخزينة إلى التخزين النهائي (الأحد 00:05 GMT) - *** تعديل التوقيت ***
    // سنجعلها بعد تصفير العدادات بخمس دقائق لضمان اكتمال أي عمليات متعلقة بالأسبوع المنتهي
    cron.schedule('5 0 * * 0', runTreasurySweepJob, { scheduled: true, timezone: "Etc/GMT" });
    console.log("Scheduled: Treasury Sweep to Final Storage Job (Sun 00:05 GMT)"); // تعديل السجل

    console.log("Cron jobs scheduled successfully.");
}

module.exports = { startCronJobs };
