// backend/controllers/adminController.js
const fs = require('fs').promises; // استخدام fs.promises للقراءة والكتابة غير المتزامنة
const path = require('path');

// تحديد مسار ملف تخزين وقت الإطلاق
// يفترض أن مجلد 'data' سيكون في نفس مستوى مجلد 'controllers' (أي داخل backend/data)
const LAUNCH_TIME_FILE_PATH = path.join(__dirname, '..', 'data', 'actual_launch_time.txt');

exports.recordActualLaunchTime = async (req, res, next) => {
    console.log("AdminController: Received request to POST /api/admin/record-launch-time");

    try {
        // الخطوة 1: محاولة قراءة الملف أولاً لتحديد ما إذا كان الوقت قد سُجل بالفعل
        console.log(`AdminController: Checking for existing launch time file at: ${LAUNCH_TIME_FILE_PATH}`);
        const recordedTime = await fs.readFile(LAUNCH_TIME_FILE_PATH, 'utf-8');

        // إذا نجحت القراءة، فهذا يعني أن الملف موجود والوقت مسجل بالفعل
        const trimmedTime = recordedTime.trim(); // إزالة أي مسافات بيضاء إضافية
        console.log(`AdminController: Launch time file found. Recorded time: ${trimmedTime}`);
        return res.status(200).json({
            success: true,
            message: 'Actual launch time was already recorded.',
            recordedTime: trimmedTime
        });

    } catch (readError) {
        // الخطوة 2: إذا فشلت القراءة، تحقق من سبب الفشل
        if (readError.code === 'ENOENT') { // ENOENT = Error NO ENTry (الملف غير موجود)
            // الملف غير موجود، لذا يمكننا المتابعة لإنشائه وتسجيل الوقت
            console.log(`AdminController: Launch time file not found. Proceeding to create and record.`);

            try {
                const currentTime = new Date().toISOString();

                // (اختياري ولكن جيد) تأكد من إنشاء مجلد 'data' إذا لم يكن موجودًا
                // path.dirname(LAUNCH_TIME_FILE_PATH) سيُرجع 'backend/data'
                const dataDir = path.dirname(LAUNCH_TIME_FILE_PATH);
                try {
                    // تحقق مما إذا كان المجلد موجودًا
                    await fs.access(dataDir);
                    console.log(`AdminController: Directory ${dataDir} already exists.`);
                } catch (dirAccessError) {
                    // إذا لم يكن المجلد موجودًا (ENOENT)، قم بإنشائه
                    if (dirAccessError.code === 'ENOENT') {
                        await fs.mkdir(dataDir, { recursive: true }); // recursive: true ينشئ المجلدات الأصلية إذا لم تكن موجودة
                        console.log(`AdminController: Created directory ${dataDir} successfully.`);
                    } else {
                        // خطأ آخر غير متوقع أثناء التحقق من المجلد، ارمِ الخطأ
                        console.error(`!!! AdminController Error accessing directory ${dataDir}:`, dirAccessError);
                        throw dirAccessError; // سيلتقطه الـ catch الخارجي
                    }
                }

                // اكتب الوقت الحالي إلى الملف
                await fs.writeFile(LAUNCH_TIME_FILE_PATH, currentTime, 'utf-8');
                console.log(`AdminController: Actual launch time recorded successfully to file. Timestamp: ${currentTime}`);

                return res.status(200).json({
                    success: true,
                    message: 'Actual launch time recorded successfully.',
                    timestamp: currentTime
                });

            } catch (writeError) {
                // فشل أثناء محاولة إنشاء المجلد أو كتابة الملف
                console.error("!!! AdminController Error writing actual launch time file:", writeError);
                // استخدم next(error) لتمرير الخطأ إلى معالج الأخطاء العام
                return next(new Error('Failed to record actual launch time due to a server file system error.'));
            }
        } else {
            // خطأ آخر غير متوقع أثناء محاولة قراءة الملف (ليس ENOENT)
            console.error("!!! AdminController Error checking for existing launch time file (other than ENOENT):", readError);
            return next(new Error('Failed to check launch time status due to a server error.'));
        }
    }
};
