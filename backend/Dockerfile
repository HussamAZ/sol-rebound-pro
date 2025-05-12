# استخدم نسخة Node 18-alpine كصورة أساسية
FROM node:22-alpine AS build

# إنشاء مجلد للعمل داخل الحاوية
WORKDIR /app

# نسخ ملفات package.json و package-lock.json (إن وجدت) لتثبيت الاعتمادات
COPY package*.json ./

# تثبيت الاعتمادات
RUN npm install

# نسخ باقي ملفات المشروع إلى الحاوية
COPY . .

# فتح المنفذ 3001 الذي يستخدمه التطبيق
EXPOSE 3001

# تشغيل التطبيق باستخدام الأمر node server.js
CMD ["node", "server.js"]
