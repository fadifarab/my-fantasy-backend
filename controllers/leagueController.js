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
/*const assignDreamTeamPositions = (players) => {
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
};*/

/*const assignDreamTeamPositions = (players, tactic = '433') => {
    if (!players || players.length === 0) return [];
    
    // فك شفرة التكتيك (مثلاً "352" تصبح د3، و5، ه2)
    const tDef = parseInt(tactic[0]);
    const tMid = parseInt(tactic[1]);
    const tFwd = parseInt(tactic[2]);

    const squad = players.slice(0, 15);
    if (squad.length < 11) {
        return squad.map(p => ({ ...p, position: 'MID', isStarter: true }));
    }

    // 1. الحارس (دائماً آخر لاعب في الـ 11 الأوائل حسب منطقك الأصلي)
    const gk = { ...squad[10], position: 'GKP', isStarter: true };

    // 2. اللاعبين الـ 10 الآخرين (Outfield)
    const outfield = squad.slice(0, 10);

    // 3. توزيع المهاجمين (يأخذون أول حصة من الـ 10 الأوائل)
    const fwd = outfield.slice(0, tFwd).map((p, index) => ({ 
        ...p, 
        position: 'FWD', 
        isStarter: true, 
        isCaptain: index === 0 // الأول دائماً كابتن
    }));

    // 4. توزيع لاعبي الوسط (يأخذون الحصة التالية)
    const mid = outfield.slice(tFwd, tFwd + tMid).map(p => ({ 
        ...p, 
        position: 'MID', 
        isStarter: true 
    }));

    // 5. توزيع المدافعين (يأخذون ما تبقى من الـ 10)
    const def = outfield.slice(tFwd + tMid, 10).map(p => ({ 
        ...p, 
        position: 'DEF', 
        isStarter: true 
    }));

    // 6. الاحتياط (من اللاعب 12 إلى 15)
    const benchRaw = squad.slice(11, 15);
    const bench = benchRaw.map((p, index) => ({
        ...p,
        position: (index === benchRaw.length - 1) ? 'GKP' : 'SUB',
        isStarter: false
    }));

    return [gk, ...def, ...mid, ...fwd, ...bench];
};*/

const assignDreamTeamPositions = (players, tactic = '433') => {
    if (!players || players.length === 0) return [];
    
    // فك شفرة التكتيك (مثلاً "352" تصبح د3، و5، ه2)
    const tDef = parseInt(tactic[0]);
    const tMid = parseInt(tactic[1]);
    const tFwd = parseInt(tactic[2]);

    const squad = players.slice(0, 15);
    if (squad.length < 11) {
        return squad.map(p => ({ ...p, position: 'MID', isStarter: true }));
    }

    // 1. الحارس (دائماً آخر لاعب في الـ 11 الأوائل حسب منطقك الأصلي)
    const gk = { ...squad[10], position: 'GKP', isStarter: true };

    // 2. اللاعبين الـ 10 الآخرين (Outfield)
    const outfield = squad.slice(0, 10);

    // 3. توزيع المهاجمين (يأخذون أول حصة من الـ 10 الأوائل)
    const fwd = outfield.slice(0, tFwd).map((p, index) => ({ 
        ...p, 
        position: 'FWD', 
        isStarter: true, 
        isCaptain: index === 0 // الأول دائماً كابتن
    }));

    // 4. توزيع لاعبي الوسط (يأخذون الحصة التالية)
    const mid = outfield.slice(tFwd, tFwd + tMid).map(p => ({ 
        ...p, 
        position: 'MID', 
        isStarter: true 
    }));

    // 5. توزيع المدافعين (يأخذون ما تبقى من الـ 10)
    const def = outfield.slice(tFwd + tMid, 10).map(p => ({ 
        ...p, 
        position: 'DEF', 
        isStarter: true 
    }));

    // 6. الاحتياط (من اللاعب 12 إلى 15)
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

// دالة إدارية بحتة لجلب كافة تفاصيل الفرق والأعضاء
const getAdminAllTeams = async (req, res) => {
    try {
        // التأكد من أن المستدعي هو أدمن النظام
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'صلاحية مرفوضة: للمدير فقط' });
        }

        const teams = await Team.find()
            .populate('managerId', 'username') // جلب بيانات مدير الفريق
            .populate({
                path: 'members',
                select: 'username fplId totalPoints' // جلب البيانات التفصيلية للأعضاء
            });

        res.json(teams);
    } catch (error) {
        res.status(500).json({ message: "فشل جلب البيانات الإدارية للفرق" });
    }
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

/*const getStandings = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user.leagueId) return res.status(400).json({ message: 'لست منضماً لدوري' });

        // 1. جلب الفرق مع التأكد من جلب حقل penaltyPoints و stats
        const teams = await Team.find({ leagueId: user.leagueId, isApproved: true })
            .select('name logoUrl stats penaltyPoints missedDeadlines isDisqualified');

        const teamsArray = [...teams];

        // 2. 🚨 منطق الترتيب الخماسي (النقاط النهائية -> البونيس -> نقاط FPL -> المواجهات -> العقوبات)
        teamsArray.sort((a, b) => {
            // أ. الترتيب حسب النقاط النهائية (التي تشمل الخصم والبونيس فعلياً في الباك إند)
            if (b.stats.points !== a.stats.points) {
                return b.stats.points - a.stats.points;
            }

            // ب. في حال التساوي: الترتيب حسب إجمالي نقاط الفانتزي (totalFplPoints)
            if (b.stats.totalFplPoints !== a.stats.totalFplPoints) {
                return b.stats.totalFplPoints - a.stats.totalFplPoints;
            }

            // ج. في حال التساوي: الأقل عقوبات يتصدر
            if (a.penaltyPoints !== b.penaltyPoints) {
                return a.penaltyPoints - b.penaltyPoints;
            }

            return 0;
        });

        // ملاحظة: يمكنك تفعيل منطق المواجهات المباشرة (H2H) هنا إذا أردت تعقيداً أكبر
        
        res.json(teamsArray);
    } catch (error) { 
        res.status(500).json({ message: error.message }); 
    }
};*/

const getStandings = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || !user.leagueId) return res.status(400).json({ message: 'لست منضماً لدوري' });

        // 1. الفرز مباشرة من قاعدة البيانات بناءً على الحقول التي يحدثها المحرك التلقائي
        // الترتيب: 1- النقاط الكلية (تنازلي) 2- إجمالي نقاط الفانتزي (تنازلي) 3- العقوبات (تصاعدي - الأقل يتصدر)
        const teams = await Team.find({ leagueId: user.leagueId, isApproved: true })
            .select('name logoUrl stats penaltyPoints missedDeadlines isDisqualified')
            .sort({ 
                "stats.points": -1, 
                "stats.totalFplPoints": -1, 
                "penaltyPoints": 1 
            });

        // 2. إرجاع النتائج مباشرة
        res.json(teams);
    } catch (error) { 
        res.status(500).json({ message: error.message }); 
    }
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

        // جلب البيانات من GameweekData (للحساب التلقائي)
        const allGwData = await GameweekData.find({ leagueId });
        
        // جلب البيانات من Fixture (للمباريات المستوردة من الإكسل)
        const allFixtures = await Fixture.find({ leagueId, isFinished: true });

        const statsTable = teams.map(team => {
            const teamGwHistory = {};
            let totalNetScore = 0;

            // 1. قراءة النقاط من المواجهات (تشمل المستورد من إكسل)
            allFixtures.forEach(fix => {
                const isHome = fix.homeTeamId.toString() === team._id.toString();
                const isAway = fix.awayTeamId.toString() === team._id.toString();
                
                if (isHome || isAway) {
                    const score = isHome ? fix.homeScore : fix.awayScore;
                    // نخزن السكور في الجولة المحددة
                    teamGwHistory[fix.gameweek] = score;
                }
            });

            // 2. قراءة النقاط من GameweekData (للتغطية في حال عدم وجود Fixture)
            // نستخدم هذا كاحتياط أو لتغطية بيانات الانتقالات إذا لزم الأمر
            allGwData.forEach(data => {
                if (data.teamId.toString() === team._id.toString()) {
                    const score = data.stats.totalPoints || 0;
                    // إذا لم تكن الجولة مسجلة من Fixture، نأخذها من هنا
                    if (teamGwHistory[data.gameweek] === undefined) {
                        teamGwHistory[data.gameweek] = score;
                    }
                }
            });

            // حساب المجموع الكلي الظاهر في الجدول بناءً على التاريخ المسجل
            totalNetScore = Object.values(teamGwHistory).reduce((sum, val) => sum + val, 0);

            return {
                teamId: team._id,
                teamName: team.name,
                managerName: team.managerId ? team.managerId.username : 'Unknown',
                logoUrl: team.logoUrl,
                history: teamGwHistory, // هذه هي القيم التي ستملأ الأعمدة GW4 إلى GW18
                totalScore: totalNetScore
            };
        });

        // ترتيب الجدول حسب إجمالي النقاط
        statsTable.sort((a, b) => b.totalScore - a.totalScore);
        
        res.json({ currentGw: league.currentGw, stats: statsTable });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
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

/*const getLeagueAwards = async (req, res) => {
    try {
        const { leagueId, type, range } = req.query;
        let startGw, endGw;

        if (type === 'gameweek') {
            startGw = endGw = parseInt(range);
        } else if (type === 'month') {
            [startGw, endGw] = range.split(',').map(Number);
        } else {
            // للموسم كامل
            startGw = 1;
            endGw = 38;
        }

        // 1. حساب "بطل الفريق" بناءً على نتائج المباريات (Fixture) لضمان شمول نتائج الإكسل
        const teams = await Team.find({ leagueId, isApproved: true }).populate('managerId', 'username');
        const teamScores = [];

        for (const team of teams) {
            // جلب كل المواجهات المنتهية لهذا الفريق في النطاق الزمني المحدد
            const matches = await Fixture.find({
                leagueId,
                isFinished: true,
                gameweek: { $gte: startGw, $lte: endGw },
                $or: [{ homeTeamId: team._id }, { awayTeamId: team._id }]
            });

            let totalScoreInRange = 0;
            matches.forEach(m => {
                const isHome = m.homeTeamId.toString() === team._id.toString();
                // نأخذ النقاط التي سجلها الفريق في المباراة (سواء مستوردة أو محسوبة)
                totalScoreInRange += isHome ? m.homeScore : m.awayScore;
            });

            teamScores.push({
                ...team.toObject(),
                totalScore: totalScoreInRange
            });
        }

        // فرز الفرق لاختيار البطل (الأعلى سكور فانتزي في الفترة المحددة)
        teamScores.sort((a, b) => b.totalScore - a.totalScore);
        const bestTeam = teamScores[0];

        // 2. حساب "تشكيلة الأحلام" (نفس المنطق العادل: Raw - Hits)
        const allGwData = await GameweekData.find({ 
            leagueId, 
            gameweek: { $gte: startGw, $lte: endGw } 
        }).populate('teamId', 'name logoUrl').populate('lineup.userId', 'username');

        const playerMap = {};
        allGwData.forEach(gw => {
            if (!gw.lineup) return;
            gw.lineup.forEach(p => {
                //if (p.isStarter && p.userId) {
				if (p.userId) {
                    const pId = p.userId._id.toString();
                    const netScore = (p.rawPoints || 0) - (p.transferCost || 0);
                    
                    if (!playerMap[pId]) {
                        playerMap[pId] = { 
                            id: pId, 
                            name: p.userId.username, 
                            teamName: gw.teamId?.name || 'Unknown', 
                            logoUrl: gw.teamId?.logoUrl || null, 
                            score: 0,
                            gws: new Set() // لضمان عدم تكرار اللاعب في نفس الجولة
                        };
                    }
                    
                    // نجمع النقاط مع التأكد من عدم تكرار نفس اللاعب لنفس الجولة
                    const gwKey = `${pId}-${gw.gameweek}`;
                    if (!playerMap[pId].gws.has(gwKey)) {
                        playerMap[pId].score += netScore;
                        playerMap[pId].gws.add(gwKey);
                    }
                }
            });
        });

        const sortedPlayers = Object.values(playerMap).sort((a, b) => b.score - a.score);
        const dreamTeam = assignDreamTeamPositions(sortedPlayers);
        const bestPlayer = dreamTeam.length > 0 ? (dreamTeam.find(p => p.isCaptain) || dreamTeam[0]) : null;

        res.json({ bestTeam, bestPlayer, dreamTeam });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};*/

/*const getLeagueAwards = async (req, res) => {
    try {
        const { leagueId, type, range } = req.query;
        
        // جلب الدوري لمعرفة التكتيك المختار من الأدمن
        const league = await League.findById(leagueId);
        const currentTactic = league.dreamTeamTactic || '433';

        let startGw, endGw;
        if (type === 'gameweek') {
            startGw = endGw = parseInt(range);
        } else if (type === 'month') {
            [startGw, endGw] = range.split(',').map(Number);
        } else {
            startGw = 1; endGw = 38;
        }

        const teams = await Team.find({ leagueId, isApproved: true });
        const teamScores = [];
        for (const team of teams) {
            const matches = await Fixture.find({
                leagueId, isFinished: true,
                gameweek: { $gte: startGw, $lte: endGw },
                $or: [{ homeTeamId: team._id }, { awayTeamId: team._id }]
            });
            let totalScoreInRange = 0;
            matches.forEach(m => {
                totalScoreInRange += (m.homeTeamId.toString() === team._id.toString()) ? m.homeScore : m.awayScore;
            });
            teamScores.push({ ...team.toObject(), totalScore: totalScoreInRange });
        }
        teamScores.sort((a, b) => b.totalScore - a.totalScore);
        const bestTeam = teamScores[0];

        const allGwData = await GameweekData.find({ 
            leagueId, gameweek: { $gte: startGw, $lte: endGw } 
        }).populate('teamId', 'name logoUrl').populate('lineup.userId', 'username');

        const playerMap = {};
        allGwData.forEach(gw => {
            if (!gw.lineup) return;
            gw.lineup.forEach(p => {
                if (p.userId) {
                    const pId = p.userId._id.toString();
                    const netScore = (p.rawPoints || 0) - (p.transferCost || 0);
                    const gwKey = `${pId}-${gw.gameweek}`;
                    if (!playerMap[pId]) {
                        playerMap[pId] = { id: pId, name: p.userId.username, teamName: gw.teamId?.name || 'Unknown', score: 0, gws: new Set() };
                    }
                    if (!playerMap[pId].gws.has(gwKey)) {
                        playerMap[pId].score += netScore;
                        playerMap[pId].gws.add(gwKey);
                    }
                }
            });
        });

        const sortedPlayers = Object.values(playerMap).sort((a, b) => b.score - a.score);
        
        // ✅ تمرير التكتيك المختار للخوارزمية
        const dreamTeam = assignDreamTeamPositions(sortedPlayers, currentTactic);
        const bestPlayer = dreamTeam.length > 0 ? (dreamTeam.find(p => p.isCaptain) || dreamTeam[0]) : null;

        // إرسال التكتيك للفرونت إند ليرسم الملعب بناءً عليه
        res.json({ bestTeam, bestPlayer, dreamTeam, tactic: currentTactic });
    } catch (error) { res.status(500).json({ message: error.message }); }
};*/

const getLeagueAwards = async (req, res) => {
    try {
        const { leagueId, type, range } = req.query;
        const league = await League.findById(leagueId);
        if (!league) return res.status(404).json({ message: 'البطولة غير موجودة' });

        // 🎯 منطق اختيار التكتيك المنفصل لكل جولة وشهر
        let selectedTactic = '433'; // الافتراضي

        if (type === 'gameweek') {
            const gwNum = parseInt(range);
            const found = league.gwTactics.find(t => t.gw === gwNum);
            selectedTactic = found ? found.tactic : '433';
        } 
        else if (type === 'month') {
            const found = league.monthTactics.find(t => t.range === range);
            selectedTactic = found ? found.tactic : '433';
        } 
        else if (type === 'season') {
            selectedTactic = league.dreamTeamTactic || '433';
        }

        let startGw, endGw;
        if (type === 'gameweek') {
            startGw = endGw = parseInt(range);
        } else if (type === 'month') {
            [startGw, endGw] = range.split(',').map(Number);
        } else {
            startGw = 1; endGw = 38;
        }

        const teams = await Team.find({ leagueId, isApproved: true });
        const teamScores = [];
        for (const team of teams) {
            const matches = await Fixture.find({
                leagueId, isFinished: true,
                gameweek: { $gte: startGw, $lte: endGw },
                $or: [{ homeTeamId: team._id }, { awayTeamId: team._id }]
            });
            let totalScoreInRange = 0;
            matches.forEach(m => {
                totalScoreInRange += (m.homeTeamId.toString() === team._id.toString()) ? m.homeScore : m.awayScore;
            });
            teamScores.push({ ...team.toObject(), totalScore: totalScoreInRange });
        }
        teamScores.sort((a, b) => b.totalScore - a.totalScore);
        const bestTeam = teamScores[0];

        const allGwData = await GameweekData.find({ 
            leagueId, gameweek: { $gte: startGw, $lte: endGw } 
        }).populate('teamId', 'name logoUrl').populate('lineup.userId', 'username');

        const playerMap = {};
        allGwData.forEach(gw => {
            if (!gw.lineup) return;
            gw.lineup.forEach(p => {
                if (p.userId) {
                    const pId = p.userId._id.toString();
                    const netScore = (p.rawPoints || 0) - (p.transferCost || 0);
                    const gwKey = `${pId}-${gw.gameweek}`;
                    if (!playerMap[pId]) {
                        playerMap[pId] = { id: pId, name: p.userId.username, teamName: gw.teamId?.name || 'Unknown', score: 0, gws: new Set() };
                    }
                    if (!playerMap[pId].gws.has(gwKey)) {
                        playerMap[pId].score += netScore;
                        playerMap[pId].gws.add(gwKey);
                    }
                }
            });
        });

        const sortedPlayers = Object.values(playerMap).sort((a, b) => b.score - a.score);
        
        // تطبيق التكتيك المختار بشكل ديناميكي
        const dreamTeam = assignDreamTeamPositions(sortedPlayers, selectedTactic);
        const bestPlayer = dreamTeam.length > 0 ? (dreamTeam.find(p => p.isCaptain) || dreamTeam[0]) : null;

        res.json({ bestTeam, bestPlayer, dreamTeam, tactic: selectedTactic });
    } catch (error) { res.status(500).json({ message: error.message }); }
};



/*const updateLeagueTactic = async (req, res) => {
    try {
        // التحقق من أن المستخدم أدمن
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        
        const { leagueId, tactic } = req.body;
        
        // تحديث حقل التكتيك في موديل الدوري
        const league = await League.findByIdAndUpdate(
            leagueId, 
            { dreamTeamTactic: tactic }, 
            { new: true }
        );
        
        if (!league) return res.status(404).json({ message: "الدوري غير موجود" });

        res.json({ 
            message: `تم تغيير التكتيك إلى ${tactic} بنجاح ✅`, 
            tactic: league.dreamTeamTactic 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};*/

const updateLeagueTactic = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        
        const { leagueId, tactic, type, range } = req.body; 
        const league = await League.findById(leagueId);
        if (!league) return res.status(404).json({ message: 'البطولة غير موجودة' });

        if (type === 'gameweek') {
            const gwNum = parseInt(range);
            const idx = league.gwTactics.findIndex(t => t.gw === gwNum);
            if (idx > -1) league.gwTactics[idx].tactic = tactic;
            else league.gwTactics.push({ gw: gwNum, tactic });
        } 
        else if (type === 'month') {
            const idx = league.monthTactics.findIndex(t => t.range === range);
            if (idx > -1) league.monthTactics[idx].tactic = tactic;
            else league.monthTactics.push({ range, tactic });
        } 
        else if (type === 'season') {
            league.dreamTeamTactic = tactic;
        }

        await league.save();
        res.json({ message: `تم حفظ تكتيك ${tactic} بنجاح ✅` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
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

/*const getLeagueStatsExtended = async (req, res) => {
    try {
        const { leagueId } = req.query;
        const teams = await Team.find({ leagueId, isApproved: true });
        const fixtures = await Fixture.find({ leagueId, isFinished: true }).sort({ gameweek: 1 });

        // 1. الفريق الأعلى جمعاً للنقاط (أفضل هجوم/نقاط FPL)
        const bestAttack = [...teams].sort((a, b) => b.stats.totalFplPoints - a.stats.totalFplPoints)[0];

        // 2. الفريق الأعلى في جولة واحدة
        const allGwData = await GameweekData.find({ leagueId, 'stats.isProcessed': true })
            .populate('teamId', 'name logoUrl');
        
        let highestGwRecord = { points: 0, teamName: '--', gw: 0 };
        allGwData.forEach(data => {
            if (data.stats.totalPoints > highestGwRecord.points) {
                highestGwRecord = {
                    points: data.stats.totalPoints,
                    teamName: data.teamId?.name || 'Unknown',
                    gw: data.gameweek,
                    logoUrl: data.teamId?.logoUrl
                };
            }
        });

        // 3. حساب السلاسل (Win, Unbeaten, Losing Streaks)
        const streaks = teams.map(team => {
            let currentWinStreak = 0, maxWinStreak = 0;
            let currentUnbeaten = 0, maxUnbeaten = 0;
            let currentLosing = 0, maxLosing = 0;

            const teamFixtures = fixtures.filter(f => 
                f.homeTeamId.toString() === team._id.toString() || 
                f.awayTeamId.toString() === team._id.toString()
            );

            teamFixtures.forEach(f => {
                const isHome = f.homeTeamId.toString() === team._id.toString();
                const myScore = isHome ? f.homeScore : f.awayScore;
                const oppScore = isHome ? f.awayScore : f.homeScore;

                // سلسلة الانتصارات
                if (myScore > oppScore) {
                    currentWinStreak++;
                    maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
                } else { currentWinStreak = 0; }

                // سلسلة دون هزيمة
                if (myScore >= oppScore) {
                    currentUnbeaten++;
                    maxUnbeaten = Math.max(maxUnbeaten, currentUnbeaten);
                } else { currentUnbeaten = 0; }

                // سلسلة الهزائم
                if (myScore < oppScore) {
                    currentLosing++;
                    maxLosing = Math.max(maxLosing, currentLosing);
                } else { currentLosing = 0; }
            });

            return { teamName: team.name, logoUrl: team.logoUrl, maxWinStreak, maxUnbeaten, maxLosing };
        });

        const longestWinStreak = [...streaks].sort((a,b) => b.maxWinStreak - a.maxWinStreak)[0];
        const longestUnbeaten = [...streaks].sort((a,b) => b.maxUnbeaten - a.maxUnbeaten)[0];
        const longestLosing = [...streaks].sort((a,b) => b.maxLosing - a.maxLosing)[0];

        // 4. قاعة المشاهير (اللاعبين الأكثر ظهوراً في تشكيلة الأسبوع)
        const allDreamPlayers = [];
        // سنحسب تشكيلة الأحلام لكل جولة مرت
        const currentLeague = await League.findById(leagueId);
        for (let i = 1; i <= currentLeague.currentGw; i++) {
            const gwDreamTeam = await calculateDreamTeamForGw(leagueId, i); // دالة مساعدة
            allDreamPlayers.push(...gwDreamTeam.filter(p => p.isStarter));
        }

        const hallOfFameMap = {};
        allDreamPlayers.forEach(p => {
            if (!hallOfFameMap[p.id]) {
                hallOfFameMap[p.id] = { name: p.name, count: 0, teamName: p.teamName };
            }
            hallOfFameMap[p.id].count++;
        });

        const hallOfFame = Object.values(hallOfFameMap)
            .filter(p => p.count > 1)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        res.json({
            bestAttack,
            highestGwRecord,
            longestWinStreak,
            longestUnbeaten,
            longestLosing,
            hallOfFame
        });
    } catch (error) { res.status(500).json({ message: error.message }); }
};*/

const getLeagueStatsExtended = async (req, res) => {
    try {
        const { leagueId } = req.query;
        const teams = await Team.find({ leagueId, isApproved: true });
        
        // جلب جميع المواجهات المنتهية (هذا الجدول هو المرجع الوحيد للنقاط النهائية بما فيها المستوردة)
        const fixtures = await Fixture.find({ leagueId, isFinished: true }).sort({ gameweek: 1 });

        // 1. الفريق الأعلى جمعاً للنقاط (أفضل هجوم/إجمالي FPL)
        const bestAttack = [...teams].sort((a, b) => b.stats.totalFplPoints - a.stats.totalFplPoints)[0];

        // 2. ✅ الحل: الفريق الأعلى في جولة واحدة (من جدول المواجهات لضمان شمول المستورد من إكسل)
        let highestGwRecord = { points: 0, teamName: '--', gw: 0 };
        
        fixtures.forEach(fix => {
            // فحص نقاط الفريق صاحب الأرض
            if (fix.homeScore > highestGwRecord.points) {
                const homeTeam = teams.find(t => t._id.toString() === fix.homeTeamId.toString());
                highestGwRecord = {
                    points: fix.homeScore,
                    teamName: homeTeam ? homeTeam.name : 'Unknown',
                    gw: fix.gameweek
                };
            }
            // فحص نقاط الفريق الضيف
            if (fix.awayScore > highestGwRecord.points) {
                const awayTeam = teams.find(t => t._id.toString() === fix.awayTeamId.toString());
                highestGwRecord = {
                    points: fix.awayScore,
                    teamName: awayTeam ? awayTeam.name : 'Unknown',
                    gw: fix.gameweek
                };
            }
        });

        // 3. حساب السلاسل (Win, Unbeaten, Losing Streaks)
        const streaks = teams.map(team => {
            let currentWinStreak = 0, maxWinStreak = 0;
            let currentUnbeaten = 0, maxUnbeaten = 0;
            let currentLosing = 0, maxLosing = 0;

            const teamFixtures = fixtures.filter(f => 
                f.homeTeamId.toString() === team._id.toString() || 
                f.awayTeamId.toString() === team._id.toString()
            );

            teamFixtures.forEach(f => {
                const isHome = f.homeTeamId.toString() === team._id.toString();
                const myScore = isHome ? f.homeScore : f.awayScore;
                const oppScore = isHome ? f.awayScore : f.homeScore;

                // سلسلة الانتصارات
                if (myScore > oppScore) {
                    currentWinStreak++;
                    maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
                } else { currentWinStreak = 0; }

                // سلسلة دون هزيمة
                if (myScore >= oppScore) {
                    currentUnbeaten++;
                    maxUnbeaten = Math.max(maxUnbeaten, currentUnbeaten);
                } else { currentUnbeaten = 0; }

                // سلسلة الهزائم
                if (myScore < oppScore) {
                    currentLosing++;
                    maxLosing = Math.max(maxLosing, currentLosing);
                } else { currentLosing = 0; }
            });

            return { teamName: team.name, logoUrl: team.logoUrl, maxWinStreak, maxUnbeaten, maxLosing };
        });

        // 4. قاعة المشاهير
        const allDreamPlayers = [];
        const currentLeague = await League.findById(leagueId);
        for (let i = 1; i <= currentLeague.currentGw; i++) {
            const gwDreamTeam = await calculateDreamTeamForGw(leagueId, i); 
            allDreamPlayers.push(...gwDreamTeam.filter(p => p.isStarter));
        }

        const hallOfFameMap = {};
        allDreamPlayers.forEach(p => {
            if (!hallOfFameMap[p.id]) {
                hallOfFameMap[p.id] = { name: p.name, count: 0, teamName: p.teamName };
            }
            hallOfFameMap[p.id].count++;
        });

        const hallOfFame = Object.values(hallOfFameMap)
            .filter(p => p.count > 1)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        res.json({
            bestAttack,
            highestGwRecord,
            longestWinStreak: [...streaks].sort((a,b) => b.maxWinStreak - a.maxWinStreak)[0],
            longestUnbeaten: [...streaks].sort((a,b) => b.maxUnbeaten - a.maxUnbeaten)[0],
            longestLosing: [...streaks].sort((a,b) => b.maxLosing - a.maxLosing)[0],
            hallOfFame
        });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

// دالة مساعدة لحساب تشكيلة الأحلام لجولة معينة (تستخدم نفس منطقك الأصلي)
async function calculateDreamTeamForGw(leagueId, gw) {
    const data = await GameweekData.find({ leagueId, gameweek: gw }).populate('lineup.userId');
    const playerMap = {};
    data.forEach(g => {
        g.lineup.forEach(p => {
            if (p.userId) {
                const pId = p.userId._id.toString();
                if (!playerMap[pId]) playerMap[pId] = { id: pId, name: p.userId.username, score: 0 };
                playerMap[pId].score += (p.rawPoints - p.transferCost);
            }
        });
    });
    const sorted = Object.values(playerMap).sort((a,b) => b.score - a.score);
    // نرجع أعلى 11 لاعب (كمثال مبسط للسرعة)
    return sorted.slice(0, 11).map(p => ({...p, isStarter: true}));
}

module.exports = { 
    createLeague, getMyLeague, joinLeague, getLeagueTeams, getLeagueManagers,
    promoteMember, demoteMember, getStandings, getGameweekResults, setLeagueGameweek,
    getLeagueStats, getPlayersStats, syncPlayerHistory, getTeamHistoryFull,
    getLeagueAwards, updateLeagueTactic, getTeamForm, uploadLeagueLogo, syncUserMetaData, getFplSchedule,
    importPastResults, getAdminAllTeams, getLeagueStatsExtended
};