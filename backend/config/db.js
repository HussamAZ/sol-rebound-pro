// backend/config/db.js
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://mongo:27017/referralDB';
        await mongoose.connect(mongoUri);
        console.log('MongoDB Connected successfully.');
    } catch (error) {
        console.error('!!! FATAL: MongoDB Connection Failed:', error.message);
        // إنهاء العملية بفشل إذا لم نتمكن من الاتصال بـ DB
        process.exit(1);
    }
};

module.exports = connectDB;