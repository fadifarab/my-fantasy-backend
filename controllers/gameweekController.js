const GameweekData = require('../models/GameweekData');
const Team = require('../models/Team');
const League = require('../models/League');
const Gameweek = require('../models/Gameweek'); 
const User = require('../models/User'); 
const { getUserFPLPoints, getCurrentGameweekStatus } = require('../services/fplService');
const axios = require('axios');

// 1. مزامنة المواعيد من FPL
const syncGameweeks = async (req, res) => {
    try {
        const fplResponse = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
        const events = fplResponse.data.events;
        for (const event of events) {
            await Gameweek.findOneAndUpdate(
                { number: event.id },
                { 
                    deadline_time: new Date(event.deadline_time),
                    status: event.is_current ? 'current' : (event.is_next ? 'next' : 'future')
                },
                { upsert: true, new: true }
            );
        }
        res.json({ message: `🚀 تمت مزامنة المواعيد بنجاح!` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 2. دالة الحفظ (setLineup)
const setLineup = async (req, res) => {
    try {
        const { players, activeChip, gw } = req.body; 
        const team = await Team.findOne({ managerId: req.user.id });
        
        if (!team) return res.status(404).json({ message: 'أنت لست مناجيراً لأي فريق' });

        const startersCount = players.filter(p => p.isStarter === true).length;
        if (startersCount !== 3) {
            return res.status(400).json({ 
                message: `⛔ خطأ: يجب اختيار 3 لاعبين أساسيين فقط (لقد اخترت ${startersCount})` 
            });
        }

        const league = await League.findById(team.leagueId);
        const targetGw = gw || league.currentGw;

        const localGw = await Gameweek.findOne({ number: targetGw });
        if (localGw && new Date() > new Date(localGw.deadline_time)) {
            return res.status(400).json({ message: `⛔ انتهى وقت التعديل للجولة ${targetGw}!` });
        }

        const formattedPlayers = players.map(p => ({
            userId: p.userId?._id || p.userId, 
            isStarter: p.isStarter,
            isCaptain: p.isCaptain
        }));

        const savedData = await GameweekData.findOneAndUpdate(
            { teamId: team._id, gameweek: targetGw },
            { 
                lineup: formattedPlayers,
                activeChip: activeChip || 'none',
                leagueId: team.leagueId,
                'stats.isProcessed': false 
            },
            { upsert: true, new: true, runValidators: true }
        );

        res.json({ message: `تم حفظ تشكيلة الجولة ${targetGw} بنجاح ✅`, gwData: savedData });
    } catch (error) {
        res.status(500).json({ message: 'خطأ أثناء الحفظ' });
    }
};

// 3. جلب البيانات مع الوراثة
const getTeamGwData = async (req, res) => {
    try {
        const { teamId, gw } = req.params;
        const requestedGw = parseInt(gw);
        const localGw = await Gameweek.findOne({ number: requestedGw });
        const now = new Date();
        
        let allowView = req.user && req.user.role === 'admin';
        if (!allowView && localGw && now > localGw.deadline_time) allowView = true;

        const myTeam = await Team.findOne({ managerId: req.user.id });
        const isOwner = myTeam && myTeam._id.toString() === teamId;

        if (!allowView && !isOwner) {
            return res.status(403).json({ restricted: true, message: '⛔ التشكيلة مخفية' });
        }

        let gwData = await GameweekData.findOne({ teamId, gameweek: requestedGw }).populate('lineup.userId', 'username position fplId');

        if (gwData) return res.json({ ...gwData.toObject(), isInherited: false });

        if (requestedGw > 1) {
            const lastSaved = await GameweekData.findOne({ teamId, gameweek: { $lt: requestedGw } }).sort({ gameweek: -1 }).populate('lineup.userId', 'username position fplId');
            if (lastSaved) return res.json({ ...lastSaved.toObject(), gameweek: requestedGw, activeChip: 'none', isInherited: true });
        }

        const teamData = await Team.findById(teamId).populate('members', 'username fplId position');
        res.json({ members: teamData ? teamData.members : [], noData: true });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

// 4. جلب حالة الجولة
const getGwStatus = async (req, res) => {
    try {
        const { gw } = req.query;
        let status;
        if (gw) {
            const localGw = await Gameweek.findOne({ number: gw });
            if (localGw) status = { id: localGw.number, deadline_time: localGw.deadline_time };
        }
        if (!status) status = await getCurrentGameweekStatus();
        res.json(status);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

// 5. حساب النتائج + العقوبات + مكافأة الفريق الأعلى تنقيطاً
const calculateScores = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        const { leagueId } = req.body;
        const league = await League.findById(leagueId);
        const currentGw = league.currentGw; 
        const allTeams = await Team.find({ leagueId, isApproved: true });

        // مصفوفة لتخزين نتائج الجولة لتحديد الفائز لاحقاً
        let roundResults = [];

        for (const team of allTeams) {
            if (team.isDisqualified) continue;

            let manualEntry = await GameweekData.findOne({ teamId: team._id, gameweek: currentGw });
            let gwData = manualEntry;

            if (!manualEntry) {
                team.missedDeadlines += 1;
                let penaltyType = 'warning'; let deduction = 0;
                if (team.missedDeadlines === 2) { penaltyType = 'minus_1'; deduction = 1; }
                else if (team.missedDeadlines === 3) { penaltyType = 'minus_2'; deduction = 2; }
                else if (team.missedDeadlines >= 4) { penaltyType = 'disqualified'; team.isDisqualified = true; await User.updateMany({ teamId: team._id }, { $set: { teamId: null, role: 'player' } }); }
                
                team.penaltyPoints += deduction;
                team.stats.points -= deduction;
                team.penaltyHistory.push({ gameweek: currentGw, penaltyType });
                
                const lastSaved = await GameweekData.findOne({ teamId: team._id, gameweek: { $lt: currentGw } }).sort({ gameweek: -1 });
                gwData = await GameweekData.create({ teamId: team._id, leagueId, gameweek: currentGw, lineup: lastSaved ? lastSaved.lineup : [], activeChip: 'none' });
            }

            let roundTotal = 0;
            if (gwData.lineup && gwData.lineup.length > 0) {
                for (let slot of gwData.lineup) {
                    if (!slot.userId) continue;
                    const fplData = await getUserFPLPoints(slot.userId.fplId, currentGw);
                    let pts = fplData.gwPoints - fplData.eventTransfersCost;
                    if (slot.isCaptain) pts *= (gwData.activeChip === 'tripleCaptain' ? 3 : 2);
                    if (slot.isStarter || gwData.activeChip === 'benchBoost') roundTotal += pts;
                }
            }
            gwData.stats.totalPoints = roundTotal;
            gwData.stats.isProcessed = true;
            await gwData.save();
            await team.save();
            
            roundResults.push({ teamId: team._id, points: roundTotal, teamName: team.name });
        }

        // 🏆 منطق مكافأة الفريق الأعلى تنقيطاً (نقطة ذهبية)
        if (roundResults.length > 0) {
            // ترتيب النتائج لمعرفة الأعلى
            const sortedResults = roundResults.sort((a, b) => b.points - a.points);
            const topTeam = sortedResults[0];

            // التحقق إذا كان هناك فائز مسجل مسبقاً لهذه الجولة (حالة إعادة الحساب)
            if (league.lastGwWinner && league.lastGwWinner.gameweek === currentGw) {
                // إذا تغير الفائز
                if (league.lastGwWinner.teamId.toString() !== topTeam.teamId.toString()) {
                    // 1. سحب النقطة من الفائز القديم
                    const oldWinner = await Team.findById(league.lastGwWinner.teamId);
                    if (oldWinner) {
                        oldWinner.stats.points = Math.max(0, oldWinner.stats.points - 1);
                        oldWinner.stats.bonusPoints = Math.max(0, oldWinner.stats.bonusPoints - 1);
                        await oldWinner.save();
                    }
                    // 2. منح النقطة للفائز الجديد
                    const newWinner = await Team.findById(topTeam.teamId);
                    newWinner.stats.points += 1;
                    newWinner.stats.bonusPoints += 1;
                    await newWinner.save();
                }
                // في حالة بقاء نفس الفائز مع تغير النقاط، لا نفعل شيئاً للنقاط، فقط نحدث بيانات الدوري
            } else {
                // أول مرة يتم فيها تحديد فائز لهذه الجولة
                const newWinner = await Team.findById(topTeam.teamId);
                newWinner.stats.points += 1;
                newWinner.stats.bonusPoints += 1;
                await newWinner.save();
            }

            // تحديث سجل الفائز في موديل الدوري
            league.lastGwWinner = {
                teamId: topTeam.teamId,
                teamName: topTeam.teamName,
                points: topTeam.points,
                gameweek: currentGw
            };
            await league.save();
        }

        res.json({ message: `تم الحساب وتحديث العقوبات والمكافأة الذهبية بنجاح للجولة ${currentGw}` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { setLineup, calculateScores, getGwStatus, getTeamGwData, syncGameweeks };