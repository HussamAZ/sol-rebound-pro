// backend/controllers/statsController.js
const statsService = require('../services/statsService'); // <-- Service جديد

exports.getOverallStats = async (req, res, next) => {
    console.log("Controller: getOverallStats called.");
    try {
        const stats = await statsService.calculateOverallStats();
        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error("!!! Controller Error in getOverallStats:", error);
        error.message = `Failed to get overall stats: ${error.message}`;
        next(error);
    }
};