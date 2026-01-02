const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// استدعاء الدوال من الكونترولر (تأكد من وجودها جميعاً في teamController.js)
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

// ضمان التوافق في حال اختلاف المسمى
const finalSelectFunction = selectTeam || createTeam;

// ==========================================
// --- 1. روابط جلب البيانات الأساسية ---
// ==========================================
router.get('/pl-teams', protect, getPLTeams);
router.get('/me', protect, getMyTeam);

// ==========================================
// --- 2. روابط إنشاء وإدارة الفريق ---
// ==========================================
router.post('/', protect, finalSelectFunction); 
router.post('/select', protect, finalSelectFunction); 
router.put('/change-manager', protect, changeTeamManager);

// ==========================================
// --- 3. روابط إدارة الأعضاء (المناجير) ---
// ==========================================

// جلب طلبات الانضمام لفريق معين (مهم لصفحة MyTeam)
router.get('/pending-members/:teamId', protect, getPendingPlayers);

// قبول العضو (المسار الذي يستدعيه زر القبول في MyTeam)
router.put('/accept-member', protect, approvePlayer);

// مسارات بديلة لضمان عدم تعطل النسخ القديمة من الواجهة
router.get('/players/pending', protect, getPendingPlayers);
router.put('/players/approve', protect, approvePlayer);
router.put('/players/reject', protect, rejectPlayer); 
router.post('/join-request', protect, joinTeamRequest);     

// ==========================================
// --- 4. روابط نظام التبديلات (إداري) ---
// ==========================================
router.post('/request-sub', protect, requestSubstitution); // للمناجير
router.put('/approve-sub', protect, approveSubstitution);  // للأدمن
router.put('/reject-sub', protect, rejectSubstitution);    // للأدمن

// ==========================================
// --- 5. روابط الأدمن (إدارة البطولة) ---
// ==========================================
router.get('/pending', protect, getPendingTeams);          
router.put('/approve-manager', protect, approveManager);  
router.put('/update-list', protect, updateSeasonTeams);   

// استيراد سجل العقوبات من ملف إكسل
router.post('/import-penalties-excel', protect, upload.single('file'), importPenaltiesExcel);

// ==========================================
// --- 6. روابط تقنية ---
// ==========================================
router.post('/proxy-image', getImageProxy); 



module.exports = router;