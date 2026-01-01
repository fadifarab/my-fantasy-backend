const Fixture = require('../models/Fixture');
const Team = require('../models/Team');
const GameweekData = require('../models/GameweekData');
const League = require('../models/League');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const TEAM_NAME_MAPPING = {
  'Spurs': 'Tottenham', 'Forest': "Nott'm Forest", 'Leeds Utd': 'Leeds United',
  'Man Utd': 'Man Utd', 'Man City': 'Man City', 'Sheffield Utd': 'Sheffield United',
  'Luton': 'Luton Town',
};

const normalizeTeamName = (csvName) => {
  const cleanName = csvName ? csvName.toString().trim() : '';
  return TEAM_NAME_MAPPING[cleanName] || cleanName;
};

// جلب تفاصيل المباراة (إصلاح الفوضى والنتائج المعكوسة)
const getMatchDetails = async (req, res) => {
    try {
        const { fixtureId } = req.params;
        const fixture = await Fixture.findById(fixtureId)
            .populate('homeTeamId', 'name logoUrl managerId')
            .populate('awayTeamId', 'name logoUrl managerId')
            .populate({ path: 'homeTeamId', populate: { path: 'managerId', select: 'username' }})
            .populate({ path: 'awayTeamId', populate: { path: 'managerId', select: 'username' }});

        if (!fixture) return res.status(404).json({ message: 'المباراة غير موجودة' });

        // جلب التشكيلات بناءً على معرفات المباراة لضمان عدم الانعكاس
        const homeLineup = await GameweekData.findOne({ 
            teamId: fixture.homeTeamId._id, 
            gameweek: fixture.gameweek 
        }).populate('lineup.userId', 'username position fplId');

        const awayLineup = await GameweekData.findOne({ 
            teamId: fixture.awayTeamId._id, 
            gameweek: fixture.gameweek 
        }).populate('lineup.userId', 'username position fplId');

        res.json({ fixture, homeLineup, awayLineup });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateLeagueTable = async (req, res) => {
  try {
    // ✅ السماح بالمرور إذا كان الطلب داخلياً من المجدول (لا يوجد headers) أو إذا كان المستخدم أدمن
    const isInternalRequest = !req.headers; 
    if (!isInternalRequest && (!req.user || req.user.role !== 'admin')) {
        return res.status(403).json({ message: 'للأدمن فقط' });
    }

    const { leagueId } = req.body;
    const league = await League.findById(leagueId);
    if (!league) {
        if (res) return res.status(404).json({ message: "League not found" });
        return;
    }

    const currentGw = league.currentGw;
    const currentFixtures = await Fixture.find({ leagueId, gameweek: currentGw });
    
    for (let match of currentFixtures) {
        // جلب نقاط الجولة للفريقين
        const homeData = await GameweekData.findOne({ teamId: match.homeTeamId, gameweek: currentGw });
        const awayData = await GameweekData.findOne({ teamId: match.awayTeamId, gameweek: currentGw });

        const hPts = (homeData && homeData.stats) ? (homeData.stats.totalPoints || 0) : 0;
        const aPts = (awayData && awayData.stats) ? (awayData.stats.totalPoints || 0) : 0;

        // تحديث نتيجة المباراة بناءً على نقاط الفانتزي المحسوبة
        match.homeScore = hPts;
        match.awayScore = aPts;
        match.isFinished = true; // نعتبرها منتهية لأن النقاط تُحدث حياً
        await match.save();
    }

    if (res) res.json({ message: "تم تحديث الترتيب والنتائج بنجاح ✅" });
  } catch (error) { 
    console.error("❌ Error in updateLeagueTable:", error.message);
    if (res) res.status(500).json({ message: error.message }); 
  }
};

const generateLeagueFixtures = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
    const { leagueId } = req.body;
    await Fixture.deleteMany({ leagueId });
    const csvPath = path.join(__dirname, '..', 'Classeur3.csv'); 
    const fileContent = fs.readFileSync(csvPath, 'utf8');
    const lines = fileContent.split(/\r?\n/); 
    const userTeams = await Team.find({ leagueId });
    const teamMap = {};
    userTeams.forEach(t => { teamMap[t.name] = t._id; });
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(';');
      if (parts.length < 3) continue;
      const hId = teamMap[normalizeTeamName(parts[1])];
      const aId = teamMap[normalizeTeamName(parts[2])];
      if (hId && aId) {
        await Fixture.create({ leagueId, gameweek: parseInt(parts[0]), homeTeamId: hId, awayTeamId: aId });
      }
    }
    res.json({ message: "تم إنشاء المباريات ✅" });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

const getFixturesByGameweek = async (req, res) => {
    try {
        const { leagueId, gw } = req.params;
        const fixtures = await Fixture.find({ leagueId, gameweek: parseInt(gw) })
            .populate('homeTeamId', 'name logoUrl')
            .populate('awayTeamId', 'name logoUrl');
        res.json(fixtures);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const getNextOpponent = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const team = await Team.findById(user.teamId);
        const league = await League.findById(team.leagueId);
        const fixture = await Fixture.findOne({
            leagueId: league._id, gameweek: league.currentGw,
            $or: [ { homeTeamId: team._id }, { awayTeamId: team._id } ]
        }).populate('homeTeamId', 'name logoUrl').populate('awayTeamId', 'name logoUrl');
        if (!fixture) return res.json({ hasFixture: false });
        const isHome = fixture.homeTeamId._id.toString() === team._id.toString();
        res.json({ hasFixture: true, opponent: isHome ? fixture.awayTeamId : fixture.homeTeamId, isHome, fixtureId: fixture._id });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const importResultsFromExcel = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        const { leagueId } = req.body;
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        for (const row of data) {
            const h = await Team.findOne({ name: normalizeTeamName(row.Home), leagueId });
            const a = await Team.findOne({ name: normalizeTeamName(row.Away), leagueId });
            if (h && a) {
                await Fixture.findOneAndUpdate(
                    { leagueId, gameweek: row.GW, homeTeamId: h._id, awayTeamId: a._id },
                    { homeScore: row.HomeScore, awayScore: row.AwayScore, isFinished: true },
                    { upsert: true }
                );
            }
        }
        res.json({ message: "تم الاستيراد بنجاح ✅" });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

module.exports = { generateLeagueFixtures, updateLeagueTable, getFixturesByGameweek, getMatchDetails, getNextOpponent, importResultsFromExcel };