# 1. استخدام نسخة Node مناسبة مع Puppeteer
FROM ghcr.io/puppeteer/puppeteer:latest

# 2. تعيين مجلد العمل
WORKDIR /usr/src/app

# 3. نسخ ملفات التعريف وتثبيت المكتبات
COPY package*.json ./
RUN npm install

# 4. نسخ باقي كود المشروع
COPY . .

# 5. تشغيل التطبيق
CMD ["node", "server.js"]