const express = require('express');
const router = express.Router();
const leagueController = require('../controllers/leagueController');
const adminController = require('../controllers/adminController'); // 👈 أضف هذا السطر
const { protect, admin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
//const auth = require('../middleware/auth'); 

// Create & Join
router.post('/', protect, leagueController.createLeague);
router.get('/me', protect, leagueController.getMyLeague);
router.post('/join', protect, leagueController.joinLeague);

// Management
router.get('/teams', protect, leagueController.getLeagueTeams);
router.get('/managers', protect, leagueController.getLeagueManagers);
router.put('/promote', protect, leagueController.promoteMember);
router.put('/demote', protect, leagueController.demoteMember);
router.get('/admin/all-teams', protect, admin, leagueController.getAdminAllTeams);

// Stats & Results
router.get('/standings', protect, leagueController.getStandings);
//router.get('/standings', leagueController.getStandings);
router.get('/results/:gw', protect, leagueController.getGameweekResults);
router.get('/stats', protect, leagueController.getLeagueStats);

// ✅ تم تعديل الاسم من players-stats إلى player-stats ليطابق طلب الفرونت آند
router.get('/player-stats', protect, leagueController.getPlayersStats);

// 👇 التعديل 1: تغيير POST إلى PUT ليطابق الفرونت إند
router.put('/set-gameweek', protect, leagueController.setLeagueGameweek);

// Sync Logic
// 👇 التعديل 2: تغيير الاسم إلى /sync-players ليطابق الفرونت إند
router.post('/sync-players', protect, leagueController.syncPlayerHistory);

router.post('/sync-metadata', protect, leagueController.syncUserMetaData);

// Team specific
router.get('/team-history-full/:teamId', leagueController.getTeamHistoryFull);
router.get('/form-guide', protect, leagueController.getTeamForm);
router.post('/logo', protect, upload.single('logo'), leagueController.uploadLeagueLogo);

// Awards & Schedule
router.get('/awards', protect, leagueController.getLeagueAwards);
router.get('/schedule', protect, leagueController.getFplSchedule);
router.post('/update-tactic', protect, leagueController.updateLeagueTactic);
router.get('/extended-stats', protect, leagueController.getLeagueStatsExtended); 

// ==========================================
// --- روابط المركز الإعلامي (فيسبوك) ---
// ==========================================

// 1. مسار جلب المعاينة (يستخدم Puppeteer لالتقاط الصورة وإرسالها للفرونت آند)
router.post('/get-preview', protect, admin, adminController.getPreview);

// 2. مسار النشر النهائي (يرسل الصورة والوصف إلى API فيسبوك)
router.post('/publish-to-facebook', protect, admin, adminController.publishToFacebook);

module.exports = router;
 