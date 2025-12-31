// server/routes/fixtureRoutes.js
const express = require('express');
const router = express.Router();
const { 
    generateLeagueFixtures, 
    getFixturesByGameweek, 
    updateLeagueTable,
    getMatchDetails,
    getNextOpponent,
    importResultsFromExcel // 🆕 استيراد الدالة الجديدة من الكنترولر
} = require('../controllers/fixtureController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); // ✅ استيراد ميدل وير رفع الملفات

// 1. العمليات الإدارية (POST/PUT)
router.post('/generate', protect, generateLeagueFixtures);

// 🆕 مسار استيراد ملف الإكسل (يستخدم Multer لاستقبال الملف تحت اسم 'file')
router.post('/import-excel', protect, upload.single('file'), importResultsFromExcel);

router.put('/update-table', protect, updateLeagueTable);

// 2. الروابط المحددة بالاسم (يجب أن تكون في الأعلى) ⬆️
router.get('/next-opponent', protect, getNextOpponent); 
router.get('/details/:fixtureId', protect, getMatchDetails);

// 3. الروابط المتغيرة Dynamic (توضع في القاع دائماً) ⬇️
router.get('/:leagueId/:gw', protect, getFixturesByGameweek);

module.exports = router;