// src/api/axiosInstance.js
import axios from 'axios';

// استخدم اسم خدمة الباك اند والمنفذ الداخلي
const API_BASE_URL = '/api'; // المسار الذي سيعالجه Nginx كبروكسي

const apiClient = axios.create({
  baseURL: '/api', // <-- تأكد من أنه هكذا
  timeout: 15000, // زيادة المهلة قليلاً (15 ثانية)
  headers: {
    'Content-Type': 'application/json',
    // يمكنك إضافة أي headers ثابتة أخرى هنا
  }
});

// يمكنك إضافة interceptors هنا للتعامل مع الأخطاء أو التوكنز بشكل مركزي
apiClient.interceptors.response.use(
  response => response, // إعادة الاستجابة الناجحة كما هي
  error => {
    // التعامل مع الأخطاء بشكل مركزي
    console.error('Axios API Error:', error.response || error.message);
    // يمكنك اختيار رمي الخطأ مرة أخرى أو التعامل معه هنا
    return Promise.reject(error);
  }
);

export default apiClient;