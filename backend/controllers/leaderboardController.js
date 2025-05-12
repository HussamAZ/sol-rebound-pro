// backend/controllers/leaderboardController.js
const referralService = require('../services/referralService'); // نفترض أن دوال الجلب موجودة هنا

// دالة مساعدة لاختصار المفتاح العام (يمكن نقلها لملف utils لاحقًا)
function shortenPublicKey(publicKey) {
    if (!publicKey || typeof publicKey !== 'string' || publicKey.length < 8) {
        return publicKey || 'N/A';
    }
    return `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`;
}

/**
 * معالج لجلب أفضل المحيلين الأسبوعيين
 * GET /api/leaderboards/top-referrers
 */
exports.getTopReferrers = async (req, res, next) => {
    const limit = parseInt(req.query.limit, 10) || 15;
    console.log(`Controller: getTopReferrers (weekly) called with limit: ${limit}`);
    try {
        // *** استدعاء الدالة الجديدة من الخدمة ***
        const topWeeklyReferrersData = await referralService.getWeeklyTopReferrers(limit);
        console.log(`Controller: Fetched ${topWeeklyReferrersData.length} top weekly referrers from service.`);

        const formattedData = topWeeklyReferrersData.map((user, index) => ({
            rank: index + 1,
            publicKey: user.user,
            shortKey: shortenPublicKey(user.user),
            // *** الحقول التي ستعرضها الواجهة ***
            weeklyReferrals: user.weeklyReferralsCount || 0, // المعيار الأساسي للترتيب
            weeklyEarnings: user.weeklyEarnings || 0,       // للعرض
            totalReferrals: user.referralsCount || 0,       // للعرض كمعلومة إضافية
        }));

        res.status(200).json({
            success: true,
            data: formattedData
        });
    } catch (error) {
        console.error("!!! Controller Error in getTopReferrers (weekly):", error);
        error.message = `Failed to get top weekly referrers: ${error.message}`;
        next(error);
    }
};

/**
 * معالج لجلب أفضل المغلقين الأسبوعيين
 * GET /api/leaderboards/top-closers
 */
exports.getTopClosers = async (req, res, next) => {
    const limit = parseInt(req.query.limit, 10) || 15; // <-- تغيير الحد الافتراضي إلى 15
    console.log(`Controller: getTopClosers called with limit: ${limit}`);
    try {
        // تأكد من أن الدالة في الخدمة تقبل limit وتستخدمه
        const topClosersData = await referralService.getTopClosersByWeeklyCount(limit);
        console.log(`Controller: Fetched ${topClosersData.length} top closers from service.`);
        // ... (باقي منطق التنسيق والعرض) ...
         const formattedData = topClosersData.map((user, index) => ({
             rank: index + 1,
             publicKey: user.user,
             shortKey: shortenPublicKey(user.user),
             weeklyClosedAccounts: user.weeklyClosedAccounts || 0,
         }));
         res.status(200).json({
             success: true,
             data: formattedData
         });

    } catch (error) {
        // معالجة الأخطاء
        console.error("!!! Controller Error in getTopClosers:", error);
        error.message = `Failed to get top closers: ${error.message}`;
        next(error);
    }
};