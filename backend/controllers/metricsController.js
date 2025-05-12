// backend/controllers/metricsController.js
const { promClient } = require('../config/prometheus');

exports.getMetrics = async (req, res, next) => {
    console.log("Controller: getMetrics called.");
    try {
        res.set('Content-Type', promClient.register.contentType);
        res.end(await promClient.register.metrics());
    } catch (ex) {
        console.error("Error generating Prometheus metrics:", ex);
        // مرر الخطأ للمعالج العام
        next(ex);
    }
};