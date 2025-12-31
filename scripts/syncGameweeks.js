const axios = require('axios');
const mongoose = require('mongoose');
const Gameweek = require('../models/Gameweek'); // تأكد من صحة المسار لموديل الجولات
require('dotenv').config(); // لتحميل رابط قاعدة البيانات من ملف .env

const syncGameweeks = async () => {
    try {
        console.log('⏳ بدء عملية مزامنة مواعيد الجولات...');

        // 1. الاتصال بقاعدة البيانات (إذا لم تكن متصلة)
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGO_URI);
            console.log('✅ تم الاتصال بقاعدة البيانات');
        }

        // 2. جلب البيانات من FPL API
        const fplResponse = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
        const events = fplResponse.data.events; // مصفوفة الجولات

        if (!events || events.length === 0) {
            throw new Error('لم يتم استلام بيانات من سيرفر الفانتزي');
        }

        // 3. معالجة وتخزين كل جولة
        for (const event of events) {
            const gwData = {
                number: event.id,
                deadline_time: new Date(event.deadline_time),
                status: event.is_current ? 'current' : (event.is_next ? 'next' : 'future')
            };

            // تحديث إذا كانت موجودة أو إنشاء واحدة جديدة (Upsert)
            await Gameweek.findOneAndUpdate(
                { number: event.id },
                gwData,
                { upsert: true, new: true }
            );
        }

        console.log(`🚀 تمت مزامنة ${events.length} جولة بنجاح في قاعدة البيانات المحلية!`);
        
        // إغلاق الاتصال بعد الانتهاء
        process.exit(0);

    } catch (error) {
        console.error('❌ خطأ أثناء المزامنة:', error.message);
        process.exit(1);
    }
};

// تشغيل الدالة
syncGameweeks();