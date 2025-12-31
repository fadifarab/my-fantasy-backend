const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); // 🆕 ضروري جداً لمعالجة رفع ملفات الإكسل

// استدعاء الدوال من الكونترولر (تم إضافة importPenaltiesExcel)
const { 
    getPLTeams, 
    selectTeam, 
    createTeam, 
    updateSeasonTeams, 
    getMyTeam,
    approveManager,       
    getPendingTeams,    
    joinTeamRequest,    
    getPendingPlayers,  
    approvePlayer,
    getImageProxy,
    requestSubstitution,
    approveSubstitution,
    rejectSubstitution,
    changeTeamManager,
    importPenaltiesExcel // 🆕 2. إضافة الدالة الجديدة هنا
} = require('../controllers/teamController');

// لضمان عدم حدوث خطأ إذا كانت الدالة غير موجودة
const finalSelectFunction = selectTeam || createTeam;

// ==========================================
// --- 1. روابط عامة وخاصة بالمستخدم ---
// ==========================================
router.get('/pl-teams', protect, getPLTeams);
router.get('/me', protect, getMyTeam);
router.put('/change-manager', protect, changeTeamManager);

// ==========================================
// --- 2. روابط اختيار وإنشاء الفريق ---
// ==========================================
router.post('/', protect, finalSelectFunction); 
router.post('/select', protect, finalSelectFunction); 

// ==========================================
// --- 3. روابط انضمام اللاعبين والموافقات ---
// ==========================================
router.post('/join-request', protect, joinTeamRequest);      
router.get('/players/pending', protect, getPendingPlayers); 
router.put('/players/approve', protect, approvePlayer);      

// ==========================================
// --- 4. روابط نظام التبديلات (Substitution) ---
// ==========================================
router.post('/request-sub', protect, requestSubstitution); // للمناجير: طلب تغيير
router.put('/approve-sub', protect, approveSubstitution);  // للأدمن: موافقة
router.put('/reject-sub', protect, rejectSubstitution);    // للأدمن: رفض

// ==========================================
// --- 5. روابط الأدمن (إدارة البطولة والاستيراد) ---
// ==========================================
router.get('/pending', protect, getPendingTeams);         
router.put('/approve-manager', protect, approveManager);  
router.put('/update-list', protect, updateSeasonTeams);   

// 🆕 المسار الجديد لاستيراد سجل مخالفات التشكيلة من ملف إكسل
// ملاحظة: 'file' هو اسم الحقل الذي سنرسله من الفرونت إند عبر FormData
router.post('/import-penalties-excel', protect, upload.single('file'), importPenaltiesExcel);

// ==========================================
// --- 6. روابط تقنية (معالجة الصور) ---
// ==========================================
router.post('/proxy-image', getImageProxy); 

module.exports = router;