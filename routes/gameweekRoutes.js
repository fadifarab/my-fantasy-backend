const express = require('express');
const router = express.Router();
// استيراد الدوال من الكنترولر مع التأكد من إضافة syncGameweeks
const { 
    calculateScores, 
    setLineup, 
    getGwStatus, 
    getTeamGwData,
    syncGameweeks // 👈 الدالة الجديدة للمزامنة
} = require('../controllers/gameweekController');
const { protect } = require('../middleware/authMiddleware');

// 1. حساب النقاط (للأدمن)
router.post('/calculate', protect, calculateScores);

// 2. حفظ التشكيلة
// يطابق API.post('/gameweek/lineup') في الفرونت إند
router.post('/lineup', protect, setLineup);

// 3. حالة الجولة (للعداد)
// يطابق API.get('/gameweek/status') في الفرونت إند
router.get('/status', protect, getGwStatus);

// 4. بيانات الفريق لجولة معينة
router.get('/team-data/:teamId/:gw', protect, getTeamGwData); 

// 5. مزامنة مواعيد الجولات بضغطة زر (للأدمن)
// 🆕 هذا المسار الذي سيتصل به زر المزامنة في لوحة التحكم
router.post('/sync', protect, syncGameweeks);

module.exports = router;