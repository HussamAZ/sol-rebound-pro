// src/setupTests.js
import '@testing-library/jest-dom';

// --- Polyfill for Web Crypto API in Jest/Node environment ---
import { webcrypto } from 'node:crypto'; // استخدم 'node:crypto' للإصدارات الحديثة أو 'crypto'

// تأكد من وجود global.crypto و getRandomValues
if (typeof global.crypto !== 'object') {
  // إذا لم يكن global.crypto موجودًا، قم بإنشائه.
  // في Node.js >= 19، يمكنك تعيين webcrypto مباشرة:
  // global.crypto = webcrypto;
  // للإصدارات الأقدم أو للتوافق الأوسع:
  global.crypto = {};
}

if (typeof global.crypto.getRandomValues !== 'function') {
  // إذا لم تكن الدالة موجودة، قم بتعيينها من webcrypto الخاص بـ Node.js
  global.crypto.getRandomValues = function(buffer) {
    // webcrypto.getRandomValues يتوقع Uint8Array أو أنواع مشابهة
    // تأكد من أن buffer هو النوع الصحيح أو قم بتحويله إذا لزم الأمر
    if (buffer instanceof ArrayBuffer) {
        return webcrypto.getRandomValues(new Uint8Array(buffer));
    } else if (!(buffer instanceof Uint8Array ||
                 buffer instanceof Uint16Array ||
                 buffer instanceof Uint32Array ||
                 buffer instanceof Int8Array ||
                 buffer instanceof Int16Array ||
                 buffer instanceof Int32Array ||
                 buffer instanceof BigInt64Array ||
                 buffer instanceof BigUint64Array ||
                 buffer instanceof Float32Array ||
                 buffer instanceof Float64Array ||
                 buffer instanceof DataView)) {
        // قد تحتاج لمعالجة أنواع أخرى أو رمي خطأ إذا لزم الأمر
        console.warn("Unsupported buffer type passed to polyfilled getRandomValues:", buffer);
        // كحل مؤقت، يمكنك محاولة ملئه بأصفار (غير آمن للتشفير الفعلي!)
        // ولكن الأفضل هو التأكد من أن المكتبة تمرر النوع الصحيح.
        // لـ Keypair.generate، يجب أن يكون النوع صحيحًا.
         return webcrypto.getRandomValues(new Uint8Array(buffer.byteLength)); // مثال
    }
     return webcrypto.getRandomValues(buffer);
  };
}

// (اختياري ولكن قد يكون مفيدًا) تأكد من وجود subtle أيضًا
if (typeof global.crypto.subtle !== 'object') {
  global.crypto.subtle = webcrypto.subtle;
}
// --- End of Polyfill ---

console.log('Jest setup: Web Crypto polyfill applied.'); // للتأكيد