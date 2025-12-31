const League = require('../models/League');
const User = require('../models/User'); 
const Team = require('../models/Team'); 
const GameweekData = require('../models/GameweekData');
const Fixture = require('../models/Fixture');
const { getUserHistory } = require('../services/fplService');
const axios = require('axios');
const XLSX = require('xlsx'); // 🆕 تأكد من تثبيت الحزمة npm install xlsx

// ==========================================
// 1. خوارزمية التشكيلة المثالية (Dream Team)
// ==========================================
const assignDreamTeamPositions = (players) => {
    if (!players || players.length === 0) return [];
    const squad = players.slice(0, 15);
    
    if (squad.length < 11) {
        return squad.map(p => ({ ...p, position: 'MID', isStarter: true }));
    }

    const startersRaw = squad.slice(0, 11);
    const gk = { ...startersRaw[10], position: 'GKP', isStarter: true };
    const outfield = startersRaw.slice(0, 10);

    const fwd = outfield.slice(0, 3).map(p => ({ ...p, position: 'FWD', isStarter: true, isCaptain: p === outfield[0] }));
    const mid = outfield.slice(3, 7).map(p => ({ ...p, position: 'MID', isStarter: true }));
    const def = outfield.slice(7, 10).map(p => ({ ...p, position: 'DEF', isStarter: true }));

    const benchRaw = squad.slice(11, 15);
    const bench = benchRaw.map((p, index) => ({
        ...p,
        position: (index === benchRaw.length - 1) ? 'GKP' : 'SUB',
        isStarter: false
    }));

    return [gk, ...def, ...mid, ...fwd, ...bench];
};

// ==========================================
// 2. الدوال الأساسية
// ==========================================

const createLeague = async (req, res) => {
  try {
    const { name } = req.body;
    const exists = await League.findOne({ adminId: req.user.id });
    if (exists) return res.status(400).json({ message: 'لديك بطولة قائمة بالفعل' });
    const code = 'LEAGUE-' + Math.floor(1000 + Math.random() * 9000);
    const league = await League.create({ name, code, adminId: req.user.id, currentGw: 1 });
    await User.findByIdAndUpdate(req.user.id, { leagueId: league._id });
    res.status(201).json(league);
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const getMyLeague = async (req, res) => {
    try {
        let league = await League.findOne({ adminId: req.user.id });
        if (!league) {
            const user = await User.findById(req.user.id).populate('leagueId');
            league = user.leagueId;
        }
        if (!league) return res.status(404).json({ message: 'لا توجد بطولة مرتبطة بك' });
        res.json(league);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const joinLeague = async (req, res) => {
    try {
        const { code } = req.body;
        const league = await League.findOne({ code });
        if (!league) return res.status(404).json({ message: 'كود البطولة غير صحيح' });
        await User.findByIdAndUpdate(req.user.id, { leagueId: league._id });
        res.json({ message: `تم الانضمام لبطولة ${league.name} بنجاح` });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const getLeagueTeams = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user.leagueId) return res.status(400).json({ message: 'يجب أن تنضم لدوري أولاً' });
        const teams = await Team.find({ leagueId: user.leagueId, isApproved: true }).populate('managerId', 'username');
        res.json(teams);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const getLeagueManagers = async (req, res) => {
  try {
    let queryLeagueId;
    const league = await League.findOne({ adminId: req.user.id });
    if (league) queryLeagueId = league._id;
    else {
       const user = await User.findById(req.user.id);
       queryLeagueId = user.leagueId;
    }
    if (!queryLeagueId) return res.json([]);
    const managers = await User.find({ leagueId: queryLeagueId })
      .select('username role fplId teamId')
      .populate({ path: 'teamId', select: 'name managerId', populate: { path: 'managerId', select: '_id' } }); 
    res.json(managers);
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const getTeamHistoryFull = async (req, res) => {
    try {
        const { teamId } = req.params;
        const team = await Team.findById(teamId).populate('managerId', 'username');
        const history = await GameweekData.find({ teamId }).populate('lineup.userId').sort({ gameweek: 1 });
        res.json({ team, history });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const promoteMember = async (req, res) => {
    try {
        const { memberId } = req.body;
        const myLeague = await League.findOne({ adminId: req.user.id });
        if (!myLeague) return res.status(403).json({ message: 'للأدمن فقط' });
        const updatedMember = await User.findByIdAndUpdate(memberId, { role: 'admin' }, { new: true });
        res.json({ message: `تم ترقية ${updatedMember.username}`, member: updatedMember });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const demoteMember = async (req, res) => {
    try {
        const { memberId } = req.body;
        const myLeague = await League.findOne({ adminId: req.user.id });
        if (!myLeague) return res.status(403).json({ message: 'للأدمن فقط' });
        const member = await User.findById(memberId);
        let newRole = 'player'; 
        if (member.teamId) {
            const team = await Team.findById(member.teamId);
            if (team && team.managerId.toString() === memberId.toString()) newRole = 'manager';
        }
        await User.findByIdAndUpdate(memberId, { role: newRole });
        res.json({ message: `تم سحب الصلاحيات من ${member.username}` });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

// ==========================================
// 3. الإحصائيات والنتائج
// ==========================================

const getStandings = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user.leagueId) return res.status(400).json({ message: 'لست منضماً لدوري' });

        const teams = await Team.find({ leagueId: user.leagueId, isApproved: true });
        const teamsArray = [...teams];

        // 🚨 منطق الترتيب الثلاثي (نقاط الدوري -> فارق أهداف/نقاط مجمعة -> مواجهات مباشرة)
        for (let i = 0; i < teamsArray.length; i++) {
            for (let j = i + 1; j < teamsArray.length; j++) {
                let teamA = teamsArray[i];
                let teamB = teamsArray[j];
                let swap = false;

                if (teamB.stats.points > teamA.stats.points) {
                    swap = true;
                } else if (teamB.stats.points === teamA.stats.points) {
                    if (teamB.stats.totalFplPoints > teamA.stats.totalFplPoints) {
                        swap = true;
                    } else if (teamB.stats.totalFplPoints === teamA.stats.totalFplPoints) {
                        const h2hFixtures = await Fixture.find({
                            leagueId: user.leagueId,
                            isFinished: true,
                            $or: [
                                { homeTeamId: teamA._id, awayTeamId: teamB._id },
                                { homeTeamId: teamB._id, awayTeamId: teamA._id }
                            ]
                        });
                        let pointsA = 0, pointsB = 0;
                        h2hFixtures.forEach(fix => {
                            const isAHome = fix.homeTeamId.toString() === teamA._id.toString();
                            const scoreA = isAHome ? fix.homeScore : fix.awayScore;
                            const scoreB = isAHome ? fix.awayScore : fix.homeScore;
                            if (scoreA > scoreB) pointsA += 3;
                            else if (scoreB > scoreA) pointsB += 3;
                            else { pointsA += 1; pointsB += 1; }
                        });
                        if (pointsB > pointsA) swap = true;
                    }
                }
                if (swap) [teamsArray[i], teamsArray[j]] = [teamsArray[j], teamsArray[i]];
            }
        }
        res.json(teamsArray);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const getGameweekResults = async (req, res) => {
    try {
        const { gw } = req.params;
        const user = await User.findById(req.user.id);
        const results = await GameweekData.find({ leagueId: user.leagueId, gameweek: gw }).populate('teamId', 'name logoUrl').sort({ 'stats.totalPoints': -1 }); 
        res.json(results);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const setLeagueGameweek = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        const { leagueId, gw } = req.body;
        const league = await League.findByIdAndUpdate(leagueId, { currentGw: gw }, { new: true });
        res.json({ message: `تم التغيير إلى GW${gw}`, league });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const getLeagueStats = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user.leagueId) return res.status(400).json({ message: 'لست منضماً لدوري' });
        const leagueId = user.leagueId;
        const league = await League.findById(leagueId);
        const teams = await Team.find({ leagueId, isApproved: true }).populate('managerId', 'username');
        const allGwData = await GameweekData.find({ leagueId });
        const statsTable = teams.map(team => {
            const teamGwHistory = {};
            let totalNetScore = 0;
            allGwData.forEach(data => {
                if (data.teamId.toString() === team._id.toString()) {
                    const score = data.stats.totalPoints || 0;
                    teamGwHistory[data.gameweek] = score;
                    totalNetScore += score;
                }
            });
            return {
                teamId: team._id, teamName: team.name, managerName: team.managerId ? team.managerId.username : 'Unknown',
                logoUrl: team.logoUrl, history: teamGwHistory, totalScore: totalNetScore
            };
        });
        statsTable.sort((a, b) => b.totalScore - a.totalScore);
        res.json({ currentGw: league.currentGw, stats: statsTable });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const getPlayersStats = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || !user.leagueId) return res.status(400).json({ message: 'لست منضماً لدوري' });
        const users = await User.find({ leagueId: user.leagueId }).select('username fplId');
        const playerStatsPromises = users.map(async (u) => {
            let stats = { userId: u._id, username: u.username, fplId: u.fplId || 'N/A', totalPoints: 0, played: 0, overallRank: 0 };
            if (u.fplId) {
                try {
                    const response = await axios.get(`https://fantasy.premierleague.com/api/entry/${u.fplId}/`, { timeout: 5000 });
                    const fplData = response.data;
                    stats.totalPoints = fplData.summary_overall_points || 0;
                    stats.played = fplData.current_event || 0;
                    stats.overallRank = fplData.summary_overall_rank || 0;
                } catch (err) { console.error(`⚠️ Error FPL for ${u.username}:`, err.message); }
            }
            return stats;
        });
        const leaderboard = await Promise.all(playerStatsPromises);
        leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
        res.json(leaderboard);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

// 🆕 دالة استيراد نتائج المواجهات من ملف Excel
const importPastResults = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'الرجاء رفع ملف Excel' });
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        let importedCount = 0;

        for (const row of data) {
            const { GW, HomeTeam, AwayTeam, HomeScore, AwayScore } = row;
            const home = await Team.findOne({ name: HomeTeam, leagueId: req.user.leagueId });
            const away = await Team.findOne({ name: AwayTeam, leagueId: req.user.leagueId });

            if (home && away) {
                await Fixture.findOneAndUpdate(
                    { leagueId: req.user.leagueId, gameweek: GW, homeTeamId: home._id, awayTeamId: away._id },
                    { homeScore: HomeScore, awayScore: AwayScore, isFinished: true },
                    { upsert: true }
                );
                importedCount++;
            }
        }
        res.json({ message: `تم استيراد ${importedCount} نتيجة بنجاح ✅. يرجى "تحديث جدول الترتيب" الآن.` });
    } catch (error) { res.status(500).json({ message: "خطأ في معالجة ملف الإكسل" }); }
};

const syncPlayerHistory = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        const { leagueId } = req.body;
        const league = await League.findById(leagueId);
        const currentGw = league.currentGw;
        const users = await User.find({ leagueId });
        let processedCount = 0;
        for (const user of users) {
            if (!user.fplId || !user.teamId) continue;
            const historyData = await getUserHistory(user.fplId);
            if (!historyData || !historyData.current) continue;
            const updatePromises = [];
            for (const event of historyData.current) {
                const gw = event.event;
                if (gw > currentGw) continue; 
                const task = async () => {
                    try {
                        let gwData = await GameweekData.findOne({ teamId: user.teamId, gameweek: gw });
                        if (!gwData) gwData = await GameweekData.create({ leagueId, teamId: user.teamId, gameweek: gw, lineup: [], activeChip: 'none' });
                        const playerInLineup = gwData.lineup.find(p => p.userId.toString() === user._id.toString());
                        const netScore = event.points - event.event_transfers_cost;
                        if (!playerInLineup) {
                            gwData.lineup.push({ userId: user._id, isStarter: true, isCaptain: false, rawPoints: event.points, transferCost: event.event_transfers_cost, finalScore: netScore });
                            gwData.markModified('lineup');
                            await gwData.save();
                        } else if (playerInLineup.rawPoints !== event.points) {
                            playerInLineup.rawPoints = event.points;
                            playerInLineup.transferCost = event.event_transfers_cost;
                            playerInLineup.finalScore = netScore;
                            gwData.markModified('lineup');
                            await gwData.save();
                        }
                    } catch (err) { } 
                };
                updatePromises.push(task());
            }
            await Promise.all(updatePromises);
            processedCount++;
        }
        res.json({ message: `⚡ تمت المزامنة لـ ${processedCount} لاعب!` });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const getLeagueAwards = async (req, res) => {
    try {
        const { leagueId, type, range } = req.query; 
        let gwFilter = {};
        if (type === 'gameweek') gwFilter = { gameweek: parseInt(range) };
        else if (type === 'month') {
            const [start, end] = range.split(',').map(Number);
            gwFilter = { gameweek: { $gte: start, $lte: end } };
        }
        const allGwData = await GameweekData.find({ leagueId, ...gwFilter }).populate('teamId', 'name logoUrl managerId').populate({ path: 'teamId', populate: { path: 'managerId', select: 'username' }}).populate('lineup.userId', 'username fplId');
        
        const teamScores = {};
        allGwData.forEach(data => {
            if(!data.teamId) return;
            const tId = data.teamId._id.toString();
            if (!teamScores[tId]) teamScores[tId] = { ...data.teamId.toObject(), totalScore: 0 };
            teamScores[tId].totalScore += (data.stats.totalPoints || 0);
        });
        const sortedTeams = Object.values(teamScores).sort((a, b) => b.totalScore - a.totalScore);
        
        const playerMap = {};
        allGwData.forEach(gw => {
            if (!gw.lineup) return;
            gw.lineup.forEach(p => {
                if (p.isStarter) {
                    const pId = p.userId._id.toString();
                    if (!playerMap[pId]) playerMap[pId] = { id: pId, name: p.userId.username, teamName: gw.teamId.name, logoUrl: gw.teamId.logoUrl, score: 0 };
                    playerMap[pId].score += (p.finalScore || 0);
                }
            });
        });
        const sortedPlayers = Object.values(playerMap).sort((a, b) => b.score - a.score);
        const dreamTeam = assignDreamTeamPositions(sortedPlayers);
        const bestPlayer = dreamTeam.length > 0 ? (dreamTeam.find(p => p.isCaptain) || dreamTeam[0]) : null;

        res.json({ bestTeam: sortedTeams[0], bestPlayer, dreamTeam });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const getTeamForm = async (req, res) => {
    try {
        const { leagueId } = req.query;
        const teams = await Team.find({ leagueId, isApproved: true });
        const formTable = [];
        for (const team of teams) {
            const fixtures = await Fixture.find({ leagueId, isFinished: true, $or: [{ homeTeamId: team._id }, { awayTeamId: team._id }] }).sort({ gameweek: 1 });
            const form = fixtures.map(match => {
                const isHome = match.homeTeamId.toString() === team._id.toString();
                const myScore = isHome ? match.homeScore : match.awayScore;
                const oppScore = isHome ? match.awayScore : match.homeScore;
                if (myScore > oppScore) return 'W';
                if (myScore < oppScore) return 'L';
                return 'D';
            });
            formTable.push({ teamId: team._id, teamName: team.name, logoUrl: team.logoUrl, form: form.slice(-5) });
        }
        res.json(formTable);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const uploadLeagueLogo = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'لم يتم اختيار ملف' });
        const logoUrl = `/uploads/${req.file.filename}`;
        const league = await League.findOneAndUpdate({ adminId: req.user.id }, { logoUrl }, { new: true });
        if (!league) return res.status(404).json({ message: 'البطولة غير موجودة' });
        res.json({ message: 'تم تحديث الشعار بنجاح 📸', logoUrl: league.logoUrl });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const syncUserMetaData = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        const { leagueId } = req.body;
        const users = await User.find({ leagueId });
        let updatedCount = 0;
        for (const user of users) {
            if (!user.fplId) continue;
            try {
                const response = await axios.get(`https://fantasy.premierleague.com/api/entry/${user.fplId}/`);
                const fplData = response.data;
                if (fplData.favourite_team) {
                    user.team = fplData.favourite_team; 
                    await user.save();
                    updatedCount++;
                }
            } catch (err) { }
        }
        res.json({ message: `✅ تم تحديث بيانات القمصان لـ ${updatedCount} لاعب!` });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const getFplSchedule = async (req, res) => {
    try {
        const response = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
        const events = response.data.events;
        const monthsMap = new Map();
        events.forEach(gw => {
            if (!gw.deadline_time) return;
            const date = new Date(gw.deadline_time);
            const monthName = date.toLocaleString('en-US', { month: 'long' });
            if (!monthsMap.has(monthName)) {
                monthsMap.set(monthName, { name: monthName, start: gw.id, end: gw.id });
            } else {
                const current = monthsMap.get(monthName);
                current.end = Math.max(current.end, gw.id);
            }
        });
        const schedule = Array.from(monthsMap.values()).map(m => ({ name: m.name, range: `${m.start},${m.end}` }));
        res.json(schedule);
    } catch (error) { res.status(500).json({ message: "فشل في جلب الجدول من FPL" }); }
};

module.exports = { 
    createLeague, getMyLeague, joinLeague, getLeagueTeams, getLeagueManagers,
    promoteMember, demoteMember, getStandings, getGameweekResults, setLeagueGameweek,
    getLeagueStats, getPlayersStats, syncPlayerHistory, getTeamHistoryFull,
    getLeagueAwards, getTeamForm, uploadLeagueLogo, syncUserMetaData, getFplSchedule,
    importPastResults // 🆕 تصدير الدالة الجديدة
};