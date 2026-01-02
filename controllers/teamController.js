const Team = require('../models/Team');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const League = require('../models/League');
const Gameweek = require('../models/Gameweek'); 
const GameweekData = require('../models/GameweekData'); 
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const XLSX = require('xlsx');

// =========================================================
// 1. جلب بيانات الفرق والأنظمة
// =========================================================

const getPLTeams = async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) {
            return res.status(404).json({ message: 'لم يتم تحديد فرق هذا الموسم بعد من قبل الأدمن' });
        }
        res.json(settings.activeTeams);
    } catch (error) {
        res.status(500).json({ message: 'حدث خطأ في جلب فرق الدوري' });
    }
};

const updateSeasonTeams = async (req, res) => {
    try {
        const { teams, seasonName } = req.body;
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'فقط مدير النظام يمكنه تحديث فرق الدوري' });
        }
        let settings = await SystemSettings.findOne();
        if (settings) {
            settings.activeTeams = teams;
            settings.seasonName = seasonName || settings.seasonName;
            await settings.save();
        } else {
            settings = await SystemSettings.create({
                seasonName: seasonName || '2025-2026',
                activeTeams: teams
            });
        }
        res.json({ message: 'تم تحديث قائمة فرق الدوري بنجاح', settings });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// =========================================================
// 2. إدارة فريق المستخدم
// =========================================================

const selectTeam = async (req, res) => {
    try {
        const { teamName } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;
        const userLeagueId = req.user.leagueId;

        if (!userLeagueId) return res.status(400).json({ message: 'يجب أن تنضم لبطولة أولاً' });

        const existingTeam = await Team.findOne({ managerId: userId });
        if (existingTeam) return res.status(400).json({ message: 'لديك فريق بالفعل' });

        const settings = await SystemSettings.findOne();
        const validTeam = settings.activeTeams.find(t => t.name === teamName);
        if (!validTeam) return res.status(400).json({ message: 'الفريق المختار غير موجود' });

        const teamTaken = await Team.findOne({ name: teamName, leagueId: userLeagueId });
        if (teamTaken) return res.status(400).json({ message: 'هذا الفريق محجوز بالفعل' });

        const isAutoApproved = userRole === 'admin';

        const team = await Team.create({
            name: validTeam.name,
            logoUrl: validTeam.logo || '',
            managerId: userId,
            leagueId: userLeagueId,
            members: [userId],
            isApproved: isAutoApproved,
            stats: { points: 0, totalFplPoints: 0 }
        });

        let newRole = userRole === 'player' ? 'manager' : userRole;
        await User.findByIdAndUpdate(userId, { teamId: team._id, role: newRole });

        res.status(201).json({
            message: isAutoApproved ? 'تم إنشاء الفريق واعتماده' : 'تم اختيار الفريق! بانتظار الموافقة.',
            team
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMyTeam = async (req, res) => {
    try {
        const { gw } = req.query; 
        const user = await User.findById(req.user.id);
        if (!user || !user.teamId) return res.status(404).json({ message: 'لم تنضم لفريق بعد' });

        const team = await Team.findById(user.teamId)
            .populate('managerId', 'username') 
            .populate('members', 'username fplId role') 
            .populate('pendingMembers', 'username fplId'); 

        let savedGwData = await GameweekData.findOne({ teamId: user.teamId, gameweek: gw }).populate('lineup.userId', 'username fplId position');

        let isInherited = false;
        if (!savedGwData && parseInt(gw) > 1) {
            savedGwData = await GameweekData.findOne({ teamId: user.teamId, gameweek: { $lt: parseInt(gw) } }).sort({ gameweek: -1 }).populate('lineup.userId', 'username fplId position');
            if (savedGwData) isInherited = true;
        }

        const gwInfo = await Gameweek.findOne({ number: gw });

        res.json({
            ...team._doc,
            deadline_time: gwInfo ? gwInfo.deadline_time : null,
            lineup: savedGwData ? savedGwData.lineup : team.members, 
            activeChip: savedGwData ? savedGwData.activeChip : 'none',
            isInherited: isInherited
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// =========================================================
// 3. استيراد البيانات التاريخية
// =========================================================

const importPenaltiesExcel = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        if (!req.file) return res.status(400).json({ message: 'الرجاء رفع ملف إكسل' });

        const { leagueId } = req.body;
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        let updatedCount = 0;
        for (const row of data) {
            const { TeamName, MissedCount } = row;
            const team = await Team.findOne({ name: TeamName, leagueId });

            if (team) {
                const missed = parseInt(MissedCount) || 0;
                team.missedDeadlines = missed;
                
                if (missed === 2) team.penaltyPoints = 1;
                else if (missed === 3) team.penaltyPoints = 2;
                else if (missed >= 4) { team.penaltyPoints = 100; team.isDisqualified = true; }
                else team.penaltyPoints = 0;

                await team.save();
                updatedCount++;
            }
        }
        res.json({ message: `تم تحديث سجل العقوبات لـ ${updatedCount} فريق ✅` });
    } catch (error) {
        res.status(500).json({ message: "خطأ في معالجة الملف" });
    }
};

// =========================================================
// 4. إدارة الموافقات والطلبات (إداري)
// =========================================================

const approveManager = async (req, res) => {
    try {
        const { teamId } = req.body;
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        const team = await Team.findByIdAndUpdate(teamId, { isApproved: true }, { new: true });
        res.json({ message: `تم اعتماد فريق ${team.name} ✅`, team });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getPendingTeams = async (req, res) => {
    try {
        const league = await League.findOne({ adminId: req.user.id });
        if(!league) return res.json([]);
        const pendingTeams = await Team.find({ leagueId: league._id, isApproved: { $ne: true } }).populate('managerId', 'username fplId');
        res.json(pendingTeams);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// =========================================================
// 5. إدارة اللاعبين والانضمام (للمناجير)
// =========================================================

// جلب طلبات الانضمام الخاصة بفريق معين للمناجير
const getPendingPlayers = async (req, res) => {
    try {
        const { teamId } = req.params;
        // التأكد من أن الطالب هو مناجير الفريق أو أدمن
        const team = await Team.findById(teamId || req.user.teamId).populate('pendingMembers', 'username fplId');
        if (!team) return res.status(404).json({ message: 'الفريق غير موجود' });
        res.json(team.pendingMembers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const joinTeamRequest = async (req, res) => {
    try {
        const { teamId } = req.body;
        const userId = req.user.id;
        if (req.user.teamId) return res.status(400).json({ message: 'أنت منضم لفريق بالفعل' });
        const team = await Team.findById(teamId);
        if (team.members.length >= 4) return res.status(400).json({ message: 'الفريق ممتلئ' });
        
        await Team.findByIdAndUpdate(teamId, { $addToSet: { pendingMembers: userId } });
        res.json({ message: `تم إرسال طلب الانضمام بنجاح ⏳` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const approvePlayer = async (req, res) => {
    try {
        const { playerId, teamId } = req.body;
        const targetTeamId = teamId || req.user.teamId;
        const team = await Team.findById(targetTeamId);
        
        if (team.members.length >= 4) return res.status(400).json({ message: 'اكتمل عدد أعضاء الفريق' });

        await Team.findByIdAndUpdate(targetTeamId, {
            $pull: { pendingMembers: playerId },
            $addToSet: { members: playerId }
        });

        await User.findByIdAndUpdate(playerId, { teamId: targetTeamId, isApproved: true });
        res.json({ message: 'تم قبول اللاعب في الفريق بنجاح ✅' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// =========================================================
// 6. نظام التبديلات وتسليم القيادة
// =========================================================

const requestSubstitution = async (req, res) => {
    try {
        const { memberId, reason } = req.body;
        const team = await Team.findById(req.user.teamId);
        if (team.managerId.toString() !== req.user.id.toString()) return res.status(401).json({ message: 'للمناجير فقط' });
        if (team.hasUsedSubstitution) return res.status(400).json({ message: 'استهلكت التغيير المسموح' });

        const member = await User.findById(memberId);
        team.substitutionRequest = { memberId: member._id, memberName: member.username, reason: reason || 'تغيير تكتيكي', createdAt: new Date() };
        await team.save();
        res.json({ message: 'تم إرسال الطلب للأدمن' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const approveSubstitution = async (req, res) => {
    try {
        const { teamId } = req.body;
        const team = await Team.findById(teamId);
        const memberIdToRemove = team.substitutionRequest.memberId;

        await User.findByIdAndUpdate(memberIdToRemove, { $unset: { teamId: "" } });
        await Team.findByIdAndUpdate(teamId, {
            $pull: { members: memberIdToRemove },
            $set: { hasUsedSubstitution: true },
            $unset: { substitutionRequest: "" }
        });
        res.json({ message: 'تمت الموافقة وحذف اللاعب' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const rejectSubstitution = async (req, res) => {
    try {
        const { teamId } = req.body;
        await Team.findByIdAndUpdate(teamId, { $unset: { substitutionRequest: "" } });
        res.json({ message: 'تم رفض طلب التبديل' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const changeTeamManager = async (req, res) => {
    try {
        const { newManagerId } = req.body;
        const currentManagerId = req.user.id;
        const team = await Team.findOne({ managerId: currentManagerId });

        await User.findByIdAndUpdate(currentManagerId, { role: 'player' });
        await User.findByIdAndUpdate(newManagerId, { role: 'manager' });

        team.managerId = newManagerId;
        await team.save();
        res.json({ message: `تم تسليم القيادة بنجاح` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// =========================================================
// 7. معالجة الصور
// =========================================================

const getImageProxy = async (req, res) => {
    try {
        let { imageUrl } = req.body;
        if (!imageUrl) return res.status(400).send('رابط مطلوب');
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const base64Image = `data:${response.headers['content-type']};base64,${Buffer.from(response.data).toString('base64')}`;
        res.json({ base64: base64Image });
    } catch (error) {
        res.status(500).json({ message: 'فشلت معالجة الصورة' });
    }
};

module.exports = { 
    getPLTeams, 
    selectTeam, 
    updateSeasonTeams, 
    getMyTeam, 
    approveManager, 
    getPendingTeams,
    joinTeamRequest,
    getPendingPlayers, // تم التحديث لتعمل بـ teamId
    approvePlayer,     // تم التحديث لتعمل بـ teamId
    requestSubstitution,
    approveSubstitution,
    rejectSubstitution,
    changeTeamManager,
    getImageProxy,
    importPenaltiesExcel
};