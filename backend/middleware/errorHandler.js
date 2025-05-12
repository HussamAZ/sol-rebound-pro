// backend/middleware/errorHandler.js

// معالج الأخطاء العام
const errorHandler = (err, req, res, next) => {
    console.error("!!! GLOBAL ERROR HANDLER CAUGHT AN ERROR !!!");
    // طباعة معلومات مفيدة من الخطأ
    console.error("Timestamp:", new Date().toISOString());
    console.error("Request URL:", req.originalUrl);
    console.error("Request Method:", req.method);
    console.error("Error Status:", err.status);
    console.error("Error Type:", err.type); // مهم لأخطاء body-parser
    console.error("Error Message:", err.message);
    // لا تطبع جسم الطلب أو المكدس تلقائيًا في الإنتاج لأسباب أمنية
    if (process.env.NODE_ENV !== 'production') {
        console.error("Request Body (if available via err.body):", err.body);
        console.error("Error Stack:", err.stack);
    } else {
         // في الإنتاج، سجل المكدس في مكان آمن إذا لزم الأمر
         console.error("Error Stack (Production - condensed):", err.stack?.split('\n')[1]); // مثال: أول سطر بعد الرسالة
    }

    // أرسل استجابة خطأ مناسبة
    // استخدم err.status إذا كان موجودًا وصالحًا، وإلا استخدم 500
    const statusCode = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;

    // لا ترسل تفاصيل الخطأ الداخلية للمستخدم في الإنتاج
    const errorMessage = (process.env.NODE_ENV !== 'production' || statusCode < 500)
        ? `Server error: ${err.message || 'Something went wrong!'}`
        : 'An internal server error occurred. Please try again later.';

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      // يمكنك تضمين نوع الخطأ إذا كان آمنًا (مثل أخطاء التحقق من الصحة)
      ...(err.type && statusCode < 500 && { type: err.type })
    });
};

module.exports = errorHandler;