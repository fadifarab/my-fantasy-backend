const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// استدعاء الدوال من الكونترولر بعد التحديثات الأخيرة
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
    importPenaltiesExcel
} = require('../controllers/teamController');

// لضمان التوافق بين مسميات الدوال
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

// 🆕 المسار المحدث لجلب الطلبات: يسمح بجلب طلبات فريق معين عبر الـ ID (للمناجير)
router.get('/pending-members/:teamId', protect, getPendingPlayers);

// 🆕 مسار بديل لجلب طلبات فريق المستخدم الحالي (للمناجير)
router.get('/players/pending', protect, getPendingPlayers);

// قبول لاعب (بواسطة المناجير أو الأدمن)
router.put('/accept-member', protect, approvePlayer); // المسار المستخدم في MyTeam.jsx
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

// استيراد سجل مخالفات التشكيلة من ملف إكسل
router.post('/import-penalties-excel', protect, upload.single('file'), importPenaltiesExcel);

// ==========================================
// --- 6. روابط تقنية (معالجة الصور) ---
// ==========================================
router.post('/proxy-image', getImageProxy); 

module.exports = router;