const Fixture = require('../models/Fixture');
const Team = require('../models/Team');
const GameweekData = require('../models/GameweekData');
const { updateLeagueStandingsInternal } = require('./gameweekController');
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

// 🛠️ دالة داخلية لتحديث جدول الترتيب بالكامل (The Standings Engine)
/*const updateLeagueStandingsInternal = async (leagueId) => {
    const teams = await Team.find({ leagueId, isApproved: true });
    
    for (const team of teams) {
        // 1. حساب نقاط المواجهات (3 للفوز، 1 للتعادل)
        const matches = await Fixture.find({
            leagueId,
            isFinished: true,
            $or: [{ homeTeamId: team._id }, { awayTeamId: team._id }]
        });

        let fixturePoints = 0;
        let won = 0, drawn = 0, lost = 0, played = 0, totalFplPoints = 0;

        matches.forEach(m => {
            played++;
            const isHome = m.homeTeamId.toString() === team._id.toString();
            const myScore = isHome ? m.homeScore : m.awayScore;
            const oppScore = isHome ? m.awayScore : m.homeScore;
            
            totalFplPoints += myScore;

            if (myScore > oppScore) { fixturePoints += 3; won++; }
            else if (myScore === oppScore) { fixturePoints += 1; drawn++; }
            else { lost++; }
        });

        // 2. جلب البونيس والعقوبات من الموديل مباشرة كما هي مخزنة
        const bonus = team.stats.bonusPoints || 0; 
        const penalties = team.penaltyPoints || 0; // العقوبات المخزنة في الموديل

        // 3. المعادلة النهائية: نقاط الدوري = (نقاط المباريات) + (البونيس) - (العقوبات)
        const finalPoints = fixturePoints + bonus - penalties;

        // 4. تحديث الفريق بالقيم التراكمية الصحيحة
        await Team.findByIdAndUpdate(team._id, {
            $set: {
                'stats.points': Math.max(0, finalPoints), // المجموع الكلي للدوري
                'stats.played': played,
                'stats.won': won,
                'stats.drawn': drawn,
                'stats.lost': lost,
                'stats.totalFplPoints': totalFplPoints // إجمالي نقاط الفانتزي (كسر التعادل)
            }
        });
    }

    // 5. إعادة فرز المراكز بناءً على النقاط النهائية
    const sortedTeams = await Team.find({ leagueId, isApproved: true });
    sortedTeams.sort((a, b) => (b.stats.points - a.stats.points) || (b.stats.totalFplPoints - a.stats.totalFplPoints));
    
    await Promise.all(sortedTeams.map((team, index) => 
        Team.findByIdAndUpdate(team._id, { $set: { 'stats.position': index + 1 } })
    ));
};*/

// جلب تفاصيل المباراة
const getMatchDetails = async (req, res) => {
    try {
        const { fixtureId } = req.params;
        const fixture = await Fixture.findById(fixtureId)
            .populate('homeTeamId', 'name logoUrl managerId')
            .populate('awayTeamId', 'name logoUrl managerId')
            .populate({ path: 'homeTeamId', populate: { path: 'managerId', select: 'username' }})
            .populate({ path: 'awayTeamId', populate: { path: 'managerId', select: 'username' }});

        if (!fixture) return res.status(404).json({ message: 'المباراة غير موجودة' });

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

// تحديث جدول الترتيب يدوياً
const updateLeagueTable = async (req, res) => {
  try {
    const isInternalRequest = !req.headers; 
    if (!isInternalRequest && (!req.user || req.user.role !== 'admin')) {
        return res.status(403).json({ message: 'للأدمن فقط' });
    }

    const { leagueId } = req.body;
    await updateLeagueStandingsInternal(leagueId);

    if (res) res.json({ message: "تم تحديث الترتيب والنتائج بنجاح ✅" });
  } catch (error) { 
    console.error("❌ Error in updateLeagueTable:", error.message);
    if (res) res.status(500).json({ message: error.message }); 
  }
};

// إنشاء المباريات من ملف CSV
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

// استيراد النتائج من إكسل (المعدلة لتحديث الجدول فوراً)
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
                
                // ملء GameweekData لضمان ظهور النقاط في التشكيلة
                await GameweekData.findOneAndUpdate(
                    { teamId: h._id, gameweek: row.GW },
                    { 'stats.totalPoints': row.HomeScore, 'stats.isProcessed': true, leagueId },
                    { upsert: true }
                );
                await GameweekData.findOneAndUpdate(
                    { teamId: a._id, gameweek: row.GW },
                    { 'stats.totalPoints': row.AwayScore, 'stats.isProcessed': true, leagueId },
                    { upsert: true }
                );
            }
        }

        // 🚩 استدعاء المحرك لتحديث الترتيب بناءً على البيانات المستوردة
        await updateLeagueStandingsInternal(leagueId);
        
        res.json({ message: "تم الاستيراد وتحديث الجدول بنجاح ✅" });
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

        // 👈 التعديل الجوهري: إضافة 1 لرقم الجولة الحالية
        // إذا كان currentGw = 19، سيبحث النظام عن مواجهات الجولة 20
        const nextGw = league.currentGw + 1;

        const fixture = await Fixture.findOne({
            leagueId: league._id, 
            gameweek: nextGw, // استخدام الجولة القادمة
            $or: [ { homeTeamId: team._id }, { awayTeamId: team._id } ]
        })
        .populate('homeTeamId', 'name logoUrl')
        .populate('awayTeamId', 'name logoUrl');

        if (!fixture) return res.json({ hasFixture: false });

        const isHome = fixture.homeTeamId._id.toString() === team._id.toString();
        
        res.json({ 
            hasFixture: true, 
            opponent: isHome ? fixture.awayTeamId : fixture.homeTeamId, 
            isHome, 
            fixtureId: fixture._id,
            gameweek: nextGw // إرسال رقم الجولة للتأكد في الواجهة
        });
    } catch (error) { 
        res.status(500).json({ message: error.message }); 
    }
};

module.exports = { 
  generateLeagueFixtures, 
  updateLeagueTable, 
  getFixturesByGameweek, 
  getMatchDetails, 
  getNextOpponent, 
  importResultsFromExcel 
};