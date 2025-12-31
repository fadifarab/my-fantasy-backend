const express = require('express');
const router = express.Router();
const leagueController = require('../controllers/leagueController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); 

// Create & Join
router.post('/', protect, leagueController.createLeague);
router.get('/me', protect, leagueController.getMyLeague);
router.post('/join', protect, leagueController.joinLeague);

// Management
router.get('/teams', protect, leagueController.getLeagueTeams);
router.get('/managers', protect, leagueController.getLeagueManagers);
router.post('/promote', protect, leagueController.promoteMember);
router.post('/demote', protect, leagueController.demoteMember);

// Stats & Results
router.get('/standings', protect, leagueController.getStandings);
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

module.exports = router;