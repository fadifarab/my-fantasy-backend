// server/controllers/fixtureController.js
const Fixture = require('../models/Fixture');
const Team = require('../models/Team');
const GameweekData = require('../models/GameweekData');
const League = require('../models/League');
const User = require('../models/User'); // ضروري لجلب بيانات المدير
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx'); // تأكد من تثبيت الحزمة npm install xlsx

const TEAM_NAME_MAPPING = {
  'Spurs': 'Tottenham',
  'Forest': "Nott'm Forest",
  'Leeds Utd': 'Leeds United',
  'Man Utd': 'Man Utd',
  'Man City': 'Man City',
  'Sheffield Utd': 'Sheffield United',
  'Luton': 'Luton Town',
};

const normalizeTeamName = (csvName) => {
  const cleanName = csvName ? csvName.toString().trim() : '';
  return TEAM_NAME_MAPPING[cleanName] || cleanName;
};

// ==========================================
// 1. إنشاء جدول المباريات (من ملف CSV الأصلي)
// ==========================================
const generateLeagueFixtures = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });

    const { leagueId } = req.body;
    console.log(`--- 📂 إعادة بناء الجدول للبطولة: ${leagueId} ---`);

    await Fixture.deleteMany({ leagueId });
    console.log("🗑️ تم حذف المباريات القديمة.");

    const csvPath = path.join(__dirname, '..', 'Classeur3.csv'); 
    if (!fs.existsSync(csvPath)) return res.status(404).json({ message: 'ملف CSV غير موجود' });

    const fileContent = fs.readFileSync(csvPath, 'utf8');
    const lines = fileContent.split(/\r?\n/); 
    const userTeams = await Team.find({ leagueId });
    
    const teamMap = {};
    userTeams.forEach(t => { teamMap[t.name] = t.id; });

    let fixturesCreated = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(';');
      if (parts.length < 3) continue;

      const round = parseInt(parts[0]);
      const homeName = normalizeTeamName(parts[1]);
      const awayName = normalizeTeamName(parts[2]);

      const userHomeId = teamMap[homeName];
      const userAwayId = teamMap[awayName];

      if (userHomeId && userAwayId) {
            await Fixture.create({
                leagueId, gameweek: round, homeTeamId: userHomeId, awayTeamId: userAwayId
            });
            console.log(`✅ تم إنشاء: جولة ${round} | ${homeName} VS ${awayName}`);
            fixturesCreated++;
      }
    }
    
    res.json({ message: `تم إعادة بناء الجدول بنجاح! المباريات الحالية: ${fixturesCreated}` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 2. 🆕 دالة استيراد نتائج المواجهات من ملف Excel
// ==========================================
const importResultsFromExcel = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        if (!req.file) return res.status(400).json({ message: 'الرجاء رفع ملف Excel' });

        const { leagueId } = req.body;
        console.log(`--- 📥 جاري استيراد نتائج Excel للبطولة: ${leagueId} ---`);

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        let importedCount = 0;
        for (const row of data) {
            // الأعمدة المطلوبة: GW, HomeTeam, AwayTeam, HomeScore, AwayScore
            const gw = row.GW || row.gw || row.Gameweek;
            const homeName = normalizeTeamName(row.HomeTeam || row.Home);
            const awayName = normalizeTeamName(row.AwayTeam || row.Away);
            const homeScore = row.HomeScore || row.homescore || 0;
            const awayScore = row.AwayScore || row.awayscore || 0;
            
            const home = await Team.findOne({ name: homeName, leagueId });
            const away = await Team.findOne({ name: awayName, leagueId });

            if (home && away) {
                await Fixture.findOneAndUpdate(
                    { leagueId, gameweek: gw, homeTeamId: home._id, awayTeamId: away._id },
                    { 
                        homeScore: parseInt(homeScore), 
                        awayScore: parseInt(awayScore), 
                        isFinished: true 
                    },
                    { upsert: true }
                );
                importedCount++;
            }
        }
        res.json({ message: `تم استيراد ${importedCount} نتيجة بنجاح! يرجى الآن الضغط على "تحديث جدول الترتيب" لإعادة الحساب.` });
    } catch (error) {
        console.error("Excel Import Error:", error);
        res.status(500).json({ message: "خطأ في معالجة ملف الإكسل" });
    }
};

// ==========================================
// 3. تحديث النتائج والإحصائيات (إعادة حساب شاملة + بونص آلي)
// ==========================================
const updateLeagueTable = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });

    const { leagueId } = req.body;
    const league = await League.findById(leagueId);
    if (!league) return res.status(404).json({ message: 'البطولة غير موجودة' });
    
    const currentGw = league.currentGw;
    console.log(`--- 🔄 تحديث جدول الترتيب للجولة الحالية: ${currentGw} ---`);

    // أ. تحديث نتائج مباريات الجولة الحالية بناءً على بيانات التشكيلات المحفوظة
    const currentFixtures = await Fixture.find({ leagueId, gameweek: currentGw });
    
    for (let match of currentFixtures) {
        const homeData = await GameweekData.findOne({ teamId: match.homeTeamId, gameweek: currentGw });
        const awayData = await GameweekData.findOne({ teamId: match.awayTeamId, gameweek: currentGw });

        const homePts = homeData ? homeData.stats.totalPoints : 0;
        const awayPts = awayData ? awayData.stats.totalPoints : 0;

        match.homeScore = homePts;
        match.awayScore = awayPts;
        match.isFinished = true;

        if (homePts > awayPts) match.winnerId = match.homeTeamId;
        else if (awayPts > homePts) match.winnerId = match.awayTeamId;
        else match.winnerId = null;

        await match.save();
    }

    // ب. 🚨 إعادة حساب الترتيب (Standings) من الصفر لضمان الدقة
    const allTeams = await Team.find({ leagueId });
    const teamStatsMap = {};

    allTeams.forEach(team => {
        teamStatsMap[team._id.toString()] = {
            played: 0, won: 0, drawn: 0, lost: 0, points: 0, 
            totalFplPoints: 0,
            bonusPoints: 0, // سنعيد استنتاجه من النتائج
            missedDeadlines: team.missedDeadlines || 0
        };
    });

    const allFinishedFixtures = await Fixture.find({ leagueId, isFinished: true });
    const scoresPerGw = {}; // لتخزين نقاط الفرق في كل جولة

    for (const match of allFinishedFixtures) {
        const hId = match.homeTeamId.toString();
        const aId = match.awayTeamId.toString();
        const gw = match.gameweek;

        if (teamStatsMap[hId] && teamStatsMap[aId]) {
            teamStatsMap[hId].played += 1;
            teamStatsMap[aId].played += 1;
            teamStatsMap[hId].totalFplPoints += match.homeScore;
            teamStatsMap[aId].totalFplPoints += match.awayScore;

            if (match.homeScore > match.awayScore) {
                teamStatsMap[hId].won += 1; teamStatsMap[hId].points += 3; teamStatsMap[aId].lost += 1;
            } else if (match.awayScore > match.homeScore) {
                teamStatsMap[aId].won += 1; teamStatsMap[aId].points += 3; teamStatsMap[hId].lost += 1;
            } else {
                teamStatsMap[hId].drawn += 1; teamStatsMap[hId].points += 1;
                teamStatsMap[aId].drawn += 1; teamStatsMap[aId].points += 1;
            }

            // تجميع السكور لكل فريق في كل جولة لاستنتاج البونص
            if (!scoresPerGw[gw]) scoresPerGw[gw] = [];
            scoresPerGw[gw].push({ teamId: hId, score: match.homeScore });
            scoresPerGw[gw].push({ teamId: aId, score: match.awayScore });
        }
    }

    // جـ. 🌟 استنتاج نقاط البونص (النقاط الذهبية) آلياً 🌟
    for (const gw in scoresPerGw) {
        const teamsInGw = scoresPerGw[gw];
        if (teamsInGw.length === 0) continue;

        const maxScore = Math.max(...teamsInGw.map(t => t.score));
        const winners = teamsInGw.filter(t => t.score === maxScore);

        winners.forEach(w => {
            if (teamStatsMap[w.teamId]) teamStatsMap[w.teamId].bonusPoints += 1;
        });
    }

    // د. تطبيق العقوبات وحساب النقاط النهائية
    for (const teamId in teamStatsMap) {
        const stats = teamStatsMap[teamId];
        let deduction = 0;
        if (stats.missedDeadlines === 2) deduction = 1;
        else if (stats.missedDeadlines === 3) deduction = 3;
        
        stats.points = (stats.points + stats.bonusPoints) - deduction;
    }

    // هـ. حفظ الإحصائيات في قاعدة البيانات
    for (const team of allTeams) {
        const newStats = teamStatsMap[team._id.toString()];
        if (newStats) {
            team.stats = newStats;
            await team.save();
        }
    }

    res.json({ message: `🚀 تم تحديث الجدول واستنتاج البونص آلياً لـ ${allTeams.length} فريق.` });

  } catch (error) {
    console.error("Update Table Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 4. الدوال الفرعية (بدون اختصار)
// ==========================================

const getFixturesByGameweek = async (req, res) => {
    try {
        const { leagueId, gw } = req.params;
        const fixtures = await Fixture.find({ leagueId, gameweek: parseInt(gw) })
            .populate('homeTeamId', 'name logoUrl')
            .populate('awayTeamId', 'name logoUrl');
        res.json(fixtures);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const getMatchDetails = async (req, res) => {
    try {
        const { fixtureId } = req.params;
        if (!fixtureId || !fixtureId.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ message: 'ID غير صحيح' });

        const fixture = await Fixture.findById(fixtureId)
            .populate('homeTeamId', 'name logoUrl managerId')
            .populate('awayTeamId', 'name logoUrl managerId')
            .populate({ path: 'homeTeamId', populate: { path: 'managerId', select: 'username' }})
            .populate({ path: 'awayTeamId', populate: { path: 'managerId', select: 'username' }});

        if (!fixture) return res.status(404).json({ message: 'المباراة غير موجودة' });

        let homeGwData = await GameweekData.findOne({ teamId: fixture.homeTeamId._id, gameweek: fixture.gameweek }).populate('lineup.userId', 'username fplId');
        let awayGwData = await GameweekData.findOne({ teamId: fixture.awayTeamId._id, gameweek: fixture.gameweek }).populate('lineup.userId', 'username fplId');

        if (!fixture.isFinished) {
            const mask = (data) => {
                if (!data || !data.lineup) return data;
                const filtered = data.lineup.filter(p => p.isStarter).map(p => {
                    const obj = p.toObject();
                    obj.isCaptain = false; obj.isViceCaptain = false;
                    return obj;
                });
                const clean = data.toObject();
                clean.lineup = filtered; clean.activeChip = 'hidden';
                return clean;
            };
            homeGwData = mask(homeGwData); awayGwData = mask(awayGwData);
        }
        res.json({ fixture, homeLineup: homeGwData, awayLineup: awayGwData });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const getNextOpponent = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user.teamId) return res.json(null);

        const userTeam = await Team.findById(user.teamId);
        const league = await League.findById(userTeam.leagueId || user.leagueId);
        if (!league) return res.json(null);

        const fixture = await Fixture.findOne({
            leagueId: league._id, gameweek: league.currentGw,
            $or: [ { homeTeamId: userTeam._id }, { awayTeamId: userTeam._id } ]
        }).populate('homeTeamId', 'name logoUrl').populate('awayTeamId', 'name logoUrl');

        if (!fixture) return res.json({ hasFixture: false });
        const isHome = fixture.homeTeamId._id.toString() === userTeam._id.toString();
        const opponent = isHome ? fixture.awayTeamId : fixture.homeTeamId;

        res.json({ hasFixture: true, opponent, gameweek: league.currentGw, isHome, fixtureId: fixture._id });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

module.exports = { 
    generateLeagueFixtures, 
    updateLeagueTable, 
    getFixturesByGameweek, 
    getMatchDetails, 
    getNextOpponent,
    importResultsFromExcel 
};