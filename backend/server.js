// backend/server.js
require('dotenv').config(); // تحميل متغيرات البيئة من ملف .env
const express = require('express');
const cors = require('cors');

// --- استيراد وحدات التهيئة ---
const connectDB = require('./config/db'); // للاتصال بـ MongoDB
const { initializeSolana } = require('./config/solana'); // لتهيئة Solana و Vault Auth

// --- استيراد الـ Middleware ---
const apiLimiter = require('./middleware/rateLimiter'); // لتحديد معدل الطلبات
const errorHandler = require('./middleware/errorHandler'); // لمعالجة الأخطاء العامة
const prometheusMiddleware = require('./middleware/prometheusMiddleware'); // لجمع مقاييس Prometheus

// --- استيراد المسارات ---
const apiRoutes = require('./routes/index'); // المسارات الرئيسية تحت /api
const metricsRoutes = require('./routes/metricsRoutes'); // مسار /metrics
const swaggerRoutes = require('./routes/swaggerRoutes'); // مسار /api-docs

// --- استيراد مجدول المهام ---
const { startCronJobs } = require('./jobs/index'); // لبدء المهام المجدولة

// --- إنشاء وتكوين تطبيق Express ---
const app = express();

// --- تطبيق Middleware العام ---
// الوثوق بالبروكسي (مهم إذا كنت خلف Nginx أو موازن تحميل آخر)
app.set('trust proxy', 1);
// تفعيل CORS للسماح بطلبات من الواجهة الأمامية أو مصادر أخرى
app.use(cors());
console.log("Applied CORS middleware.");
// تحليل أجسام الطلبات JSON و URL-encoded (مع تحديد حجم)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
console.log("Applied JSON and URL-encoded body parsers.");
// تفعيل middleware جمع مقاييس Prometheus
app.use(prometheusMiddleware);
console.log("Applied Prometheus middleware.");

// --- تركيب المسارات ---
// مسار Prometheus (لا يخضع للـ rate limiter)
app.use('/metrics', metricsRoutes);
console.log("Mounted /metrics route.");

// --- !! تطبيق Rate Limiter فقط خارج بيئة الاختبار !! ---
if (process.env.NODE_ENV !== 'test') {
    app.use(apiLimiter); // تطبيق Middleware تحديد المعدل
    console.log("Applied Rate Limiter middleware (Non-test environment).");
} else {
    console.log("Skipping Rate Limiter in TEST environment.");
}
// ----------------------------------------------------

// تركيب مسارات API الرئيسية تحت /api
app.use('/api', apiRoutes);
console.log("Mounted API routes under /api.");
// تركيب مسار وثائق Swagger
app.use('/api-docs', swaggerRoutes);
console.log("Mounted /api-docs route.");

// --- معالج الأخطاء العام (يجب أن يكون آخر middleware يتم تطبيقه) ---
app.use(errorHandler);
console.log("Applied Global Error Handler middleware.");
// --- نهاية تكوين تطبيق Express ---


// --- دالة البدء غير المتزامنة (للعمليات التي تحتاج انتظار مثل DB, Solana) ---
async function initializeDependenciesAndJobs() {
    console.log("Initializing dependencies and jobs...");
    try {
        // 1. تهيئة Solana و Vault (خطوة حاسمة يجب أن تنجح)
        // هذه الدالة تقوم أيضًا بتحميل المفتاح السري للخادم من Vault
        await initializeSolana();
        console.log("Solana & Vault initialized successfully.");

        // 2. الاتصال بقاعدة البيانات MongoDB
        await connectDB();
        // console.log() موجودة داخل connectDB

        // 3. بدء المهام المجدولة (Cron Jobs)
        startCronJobs(); // الدالة تطبع سجلاتها الخاصة

        console.log("Dependencies and jobs initialized successfully.");

    } catch (error) {
        // التقاط أي خطأ فادح أثناء التهيئة
        console.error("!!! FATAL: Failed to initialize application dependencies:", error);
        process.exit(1); // إنهاء العملية إذا فشلت التهيئة الحرجة
    }
}

// --- تشغيل الخادم (فقط إذا لم يكن في بيئة الاختبار) ---
if (process.env.NODE_ENV !== 'test') {
    // استدعاء دالة تهيئة التبعيات أولاً
    initializeDependenciesAndJobs().then(() => {
        // بدء الاستماع على المنفذ المحدد فقط بعد نجاح التهيئة
        const PORT = process.env.PORT || 3001;
        app.listen(PORT, () => {
            console.log(`Backend server running successfully and listening on http://localhost:${PORT}`);
            console.log(`Node environment: ${process.env.NODE_ENV || 'development'}`);

             // --- كود طباعة المسارات المسجلة (اختياري، مفيد للتصحيح) ---
            try {
                console.log("--- Registered Routes ---");
                const routes = [];
                app._router.stack.forEach(function print(layer) {
                    if (layer.route) { // المسارات المسجلة مباشرة
                        const path = layer.route.path;
                        const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(', ');
                        if (path) routes.push({ method: methods, path });
                    } else if (layer.name === 'router' && layer.handle.stack) { // مسارات داخل Router
                        let routePrefix = '';
                        if (layer.regexp && layer.regexp.source) {
                            routePrefix = '/' + layer.regexp.source
                                .replace('^\\', '')
                                .replace('\\/?$', '')
                                .replace(/\\\//g, '/')
                                .replace('(?:\\/(?=$))?', '')
                                .replace(/\?\(\?=\/\|\$\)/g, '')
                                .replace(/^\/|\/$/g, '');
                        }
                        layer.handle.stack.forEach(function printRouter(rt) {
                            if (rt.route) {
                                let path = (routePrefix + rt.route.path).replace(/\/+/g, '/');
                                if (path !== '/' && path.endsWith('/')) {
                                    path = path.slice(0, -1);
                                }
                                const methods = Object.keys(rt.route.methods).map(m => m.toUpperCase()).join(', ');
                                if (path) routes.push({ method: methods, path });
                            }
                        });
                    }
                });
                // طباعة المسارات المجمعة
                routes.sort((a, b) => a.path.localeCompare(b.path)).forEach(r => console.log(`${r.method.padEnd(7)} ${r.path}`));
                console.log("--- End Registered Routes ---");
            } catch (e) {
                 console.warn("Could not print registered routes:", e.message);
            }
            // --- نهاية كود طباعة المسارات ---
        });
    }).catch(error => {
        // التقاط الأخطاء التي قد تحدث خلال استدعاء initializeDependenciesAndJobs
        console.error("!!! FATAL: Unhandled error during server startup process:", error);
        process.exit(1);
    });
} else {
     // في بيئة الاختبار، لا نقوم بتشغيل app.listen()
     // ولا نحتاج لتشغيل initializeDependenciesAndJobs لأن الاختبارات تحاكيها.
     console.log("Running in TEST environment. Server configured but not listening. Dependencies mocked.");
}

// --- تصدير تطبيق Express ليتم استخدامه في اختبارات التكامل ---
module.exports = app;