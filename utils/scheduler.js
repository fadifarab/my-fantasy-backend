const cron = require('node-cron');
const League = require('../models/League');
const { calculateScores } = require('../controllers/gameweekController');
// ✅ تم تعديل الاسم هنا من updateTable إلى updateLeagueTable ليطابق الـ Controller
const { updateLeagueTable } = require('../controllers/fixtureController'); 

const startAutomatedUpdates = () => {
    cron.schedule('*/5 * * * *', async () => {
        console.log('🔄 بدء دورة التحديث الشاملة (النقاط + النتائج)...');
        const leagues = await League.find({});

        for (const league of leagues) {
            try {
                // 1. تحديث الحالة إلى "جاري العمل"
                await League.findByIdAndUpdate(league._id, { autoUpdateStatus: 'running' });

                // 2. حساب النقاط (تحديث نقاط اللاعبين والفرق)
                await calculateScores(
                    { user: { role: 'admin' }, body: { leagueId: league._id } },
                    { json: () => {} }
                );

                // 3. تحديث نتائج المباريات والجدول
                // ✅ تم تعديل الاسم هنا أيضاً لاستدعاء الدالة الصحيحة
                await updateLeagueTable(
                    { body: { leagueId: league._id } },
                    { json: () => {} }
                );

                // 4. تسجيل النجاح والوقت النهائي
                await League.findByIdAndUpdate(league._id, { 
                    autoUpdateStatus: 'success',
                    lastAutoUpdate: new Date()
                });

                console.log(`✅ تم تحديث النقاط ونتائج المباريات لدوري: ${league.name}`);
            } catch (error) {
                await League.findByIdAndUpdate(league._id, { autoUpdateStatus: 'failed' });
                console.error(`❌ خطأ أثناء تحديث دوري ${league.name}:`, error.message);
            }
        }
    });
};

module.exports = startAutomatedUpdates;