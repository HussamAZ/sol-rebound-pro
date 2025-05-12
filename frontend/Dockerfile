# frontend/Dockerfile

# المرحلة 1: البناء (Build Stage)
# استخدم صورة Node 18 أو إصدار أحدث يدعم Alpine
FROM node:22-alpine AS build
# أو استخدم node:20-alpine أو أحدث إذا فضلت، لكن 18 مستقر

# تعيين مجلد العمل
WORKDIR /app

# --- !!! إضافة: تثبيت أدوات البناء و Linux Headers !!! ---
RUN apk add --no-cache python3 make g++ linux-headers eudev-libs
    # -------------------------------------------------------
# --- !!! إضافة: تثبيت أدوات البناء المطلوبة لـ node-gyp !!! ---
# python3 هو الاسم الشائع لبايثون في Alpine
# make و g++ هما جزء من أدوات البناء الأساسية
RUN apk add --no-cache python3 make g++
# ----------------------------------------------------------

# نسخ ملفات الاعتماديات أولاً
COPY package.json ./
COPY package-lock.json ./

# تثبيت الاعتماديات (يمكن إزالة --force الآن إذا حلت مشاكل التوافق)
# جرب أولاً بدون --force
RUN npm install
# إذا فشل بسبب peer dependencies، يمكنك استخدام:
# RUN npm install --legacy-peer-deps
# أو كحل أخير:
# RUN npm install --force

# نسخ باقي كود الواجهة الأمامية
COPY . .

# بناء التطبيق للإنتاج
RUN npm run build

# المرحلة 2: الإنتاج (Production Stage)
# استخدم صورة Nginx حديثة ومستقرة
FROM nginx:1.27-alpine-slim
# أو 1.26 أو أحدث

# نسخ ملفات البناء من المرحلة السابقة
COPY --from=build /app/build /usr/share/nginx/html

# نسخ ملف تكوين Nginx مخصص (إذا كان موجودًا)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# فتح المنفذ 80
EXPOSE 80

# الأمر الافتراضي لتشغيل Nginx
CMD ["nginx", "-g", "daemon off;"]