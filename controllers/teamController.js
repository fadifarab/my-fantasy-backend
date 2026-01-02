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

// @desc    جلب قائمة فرق الدوري الإنجليزي لهذا الموسم
const getPLTeams = async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) {
            return res.status(404).json({ message: 'لم يتم تحديد فرق هذا الموسم بعد من قبل الأدمن' });
        }
        res.json(settings.activeTeams);
    } catch (error) {
        console.error("Error in getPLTeams:", error.message);
        res.status(500).json({ message: 'حدث خطأ في جلب فرق الدوري' });
    }
};

// @desc    تحديث قائمة فرق الدوري (خاص بالأدمن فقط)
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
// 2. إدارة فريق المستخدم (الجوهر)
// =========================================================

// @desc    إنشاء أو اختيار فريق جديد للمستخدم
const selectTeam = async (req, res) => {
    try {
        const { teamName } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;
        const userLeagueId = req.user.leagueId;

        if (!userLeagueId) {
            return res.status(400).json({ message: 'يجب أن تنضم لبطولة أولاً' });
        }

        const existingTeam = await Team.findOne({ managerId: userId });
        if (existingTeam) {
            return res.status(400).json({ message: 'لديك فريق بالفعل' });
        }

        const settings = await SystemSettings.findOne();
        if (!settings) {
            return res.status(500).json({ message: 'خطأ: لا توجد بيانات للفرق في النظام' });
        }

        const validTeam = settings.activeTeams.find(t => t.name === teamName);
        if (!validTeam) {
            return res.status(400).json({ message: 'الفريق المختار غير موجود في الدوري هذا الموسم' });
        }

        const teamTaken = await Team.findOne({ name: teamName, leagueId: userLeagueId });
        if (teamTaken) {
            return res.status(400).json({ message: 'هذا الفريق محجوز بالفعل في هذه البطولة' });
        }

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

        let newRole = userRole;
        if (userRole === 'player') {
            newRole = 'manager';
        }

        await User.findByIdAndUpdate(userId, { 
            teamId: team._id,
            role: newRole 
        });

        res.status(201).json({
            message: isAutoApproved ? 'تم إنشاء الفريق واعتماده بنجاح' : 'تم اختيار الفريق! بانتظار موافقة مدير البطولة.',
            team
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    جلب بيانات فريق المستخدم الحالي (مع الوراثة والتشكيلات)
const getMyTeam = async (req, res) => {
    try {
        const { gw } = req.query; 
        const user = await User.findById(req.user.id);
        
        if (!user || !user.teamId) {
            return res.status(404).json({ message: 'لم تنضم لفريق بعد' });
        }

        const team = await Team.findById(user.teamId)
            .populate('managerId', 'username') 
            .populate('members', 'username fplId role') 
            .populate('pendingMembers', 'username fplId'); 

        if (!team) {
            return res.status(404).json({ message: 'تعذر العثور على بيانات الفريق' });
        }

        let savedGwData = await GameweekData.findOne({ 
            teamId: user.teamId, 
            gameweek: gw 
        }).populate('lineup.userId', 'username fplId position');

        let isInherited = false;
        if (!savedGwData && parseInt(gw) > 1) {
            savedGwData = await GameweekData.findOne({ 
                teamId: user.teamId, 
                gameweek: { $lt: parseInt(gw) } 
            }).sort({ gameweek: -1 }).populate('lineup.userId', 'username fplId position');
            
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
        console.error("GetMyTeam Error:", error.message);
        res.status(500).json({ message: "حدث خطأ أثناء جلب بيانات فريقك" });
    }
};

// =========================================================
// 3. استيراد البيانات التاريخية والعقوبات
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
                
                if (missed === 2) {
                    team.penaltyPoints = 1;
                } else if (missed === 3) {
                    team.penaltyPoints = 2;
                } else if (missed >= 4) {
                    team.penaltyPoints = 100;
                    team.isDisqualified = true;
                } else {
                    team.penaltyPoints = 0;
                }

                await team.save();
                updatedCount++;
            }
        }
        res.json({ message: `تم تحديث سجل العقوبات ونقاط الخصم لـ ${updatedCount} فريق بنجاح ✅` });
    } catch (error) {
        console.error("Penalty Import Error:", error);
        res.status(500).json({ message: "خطأ في معالجة ملف العقوبات" });
    }
};

// =========================================================
// 4. إدارة الموافقات والطلبات (إداري)
// =========================================================

const approveManager = async (req, res) => {
    try {
        const { teamId } = req.body;
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'غير مصرح لك، للأدمن فقط' });
        }

        const team = await Team.findByIdAndUpdate(
            teamId, 
            { isApproved: true }, 
            { new: true }
        );

        res.json({ message: `تم اعتماد مناجير فريق ${team.name} رسمياً ✅`, team });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getPendingTeams = async (req, res) => {
    try {
        const league = await League.findOne({ adminId: req.user.id });
        if(!league) return res.json([]);

        const pendingTeams = await Team.find({ 
            leagueId: league._id, 
            isApproved: { $ne: true } 
        }).populate('managerId', 'username fplId');
        
        res.json(pendingTeams);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// =========================================================
// 5. إدارة اللاعبين والانضمام (المُحسنة)
// =========================================================

// @desc    إرسال طلب انضمام لاعب لفريق موجود
const joinTeamRequest = async (req, res) => {
    try {
        const { teamId } = req.body;
        const userId = req.user.id;

        if (req.user.teamId) {
            return res.status(400).json({ message: 'أنت منضم لفريق بالفعل' });
        }

        const team = await Team.findById(teamId);
        if (!team) return res.status(404).json({ message: 'الفريق غير موجود' });

        if (team.pendingMembers.includes(userId)) {
            return res.status(400).json({ message: 'أرسلت طلباً مسبقاً لهذا الفريق' });
        }

        if (team.members.length >= 4) {
            return res.status(400).json({ message: 'هذا الفريق ممتلئ (الحد الأقصى 4)' });
        }

        team.pendingMembers.push(userId);
        await team.save();

        res.json({ message: `تم إرسال طلب الانضمام إلى ${team.name} بنجاح ⏳` });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    جلب طلبات اللاعبين المعلقة لفريق معين (للمناجير)
const getPendingPlayers = async (req, res) => {
    try {
        const { teamId } = req.params;
        // البحث عن الفريق والتأكد من جلب بيانات المستخدمين المعلقين
        const team = await Team.findById(teamId).populate('pendingMembers', 'username fplId');
        
        if (!team) {
            return res.status(404).json({ message: 'تعذر العثور على الفريق' });
        }
        
        res.json(team.pendingMembers || []);
    } catch (error) {
        console.error("Error fetching pending players:", error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    قبول لاعب في الفريق (الحل النهائي لمشكلة الزر)
const approvePlayer = async (req, res) => {
    try {
        const { playerId, teamId } = req.body;
        
        // التحقق من وجود الفريق
        const team = await Team.findById(teamId);
        if (!team) {
            return res.status(404).json({ message: 'الفريق غير موجود' });
        }

        // التحقق من المساحة المتوفرة
        if (team.members.length >= 4) {
            return res.status(400).json({ message: 'عذراً، الفريق مكتمل (4 لاعبين كحد أقصى)' });
        }

        // 1. تحديث وثيقة الفريق (حذف من الانتظار وإضافة للأعضاء)
        await Team.findByIdAndUpdate(teamId, {
            $pull: { pendingMembers: playerId },
            $addToSet: { members: playerId }
        });

        // 2. تحديث وثيقة المستخدم (ربطه بالفريق)
        await User.findByIdAndUpdate(playerId, { 
            teamId: teamId,
            isApproved: true // اعتماد اللاعب
        });

        res.json({ message: 'تم قبول اللاعب بنجاح ✅ سيظهر الآن في قائمة الفريق' });
    } catch (error) {
        console.error("Error in approvePlayer:", error);
        res.status(500).json({ message: "حدث خطأ أثناء قبول اللاعب" });
    }
};

// =========================================================
// 6. نظام التبديلات وتسليم القيادة
// =========================================================

const requestSubstitution = async (req, res) => {
    try {
        const { memberId, reason } = req.body;
        const team = await Team.findById(req.user.teamId);

        if (!team) return res.status(404).json({ message: 'الفريق غير موجود' });
        
        if (team.managerId.toString() !== req.user.id.toString()) {
            return res.status(401).json({ message: 'المناجير فقط يمكنه تقديم هذا الطلب' });
        }

        if (memberId === req.user.id.toString()) {
            return res.status(400).json({ message: 'لا يمكنك تقديم طلب لطرد نفسك' });
        }

        if (team.hasUsedSubstitution) {
            return res.status(400).json({ message: 'لقد استهلكت حقك في التغيير لهذا الموسم' });
        }

        const member = await User.findById(memberId);
        if (!member) return res.status(404).json({ message: 'اللاعب غير موجود' });

        team.substitutionRequest = {
            memberId: member._id,
            memberName: member.username,
            reason: reason || 'تغيير تكتيكي',
            createdAt: new Date()
        };

        await team.save();
        res.json({ message: 'تم إرسال طلب التغيير لمدير البطولة بنجاح' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const approveSubstitution = async (req, res) => {
    try {
        const { teamId } = req.body;
        const team = await Team.findById(teamId);
        
        if (!team || !team.substitutionRequest) {
            return res.status(404).json({ message: 'لا يوجد طلب تبديل معلق' });
        }

        const memberIdToRemove = team.substitutionRequest.memberId;

        await User.findByIdAndUpdate(memberIdToRemove, { $unset: { teamId: "" } });
        await Team.findByIdAndUpdate(teamId, {
            $pull: { members: memberIdToRemove },
            $set: { hasUsedSubstitution: true },
            $unset: { substitutionRequest: "" }
        });

        res.json({ message: 'تمت الموافقة وحذف اللاعب بنجاح' });
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
        if (!team) return res.status(404).json({ message: 'لست المناجير الحالي لهذا الفريق' });

        if (!team.members.includes(newManagerId)) {
            return res.status(400).json({ message: 'المناجير الجديد يجب أن يكون عضواً في الفريق' });
        }

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
        if (!imageUrl) return res.status(400).send('رابط الصورة مطلوب');

        let imageBuffer;
        let contentType = 'image/png';

        if (imageUrl.startsWith('http')) {
            const response = await axios.get(imageUrl, { 
                responseType: 'arraybuffer',
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            imageBuffer = Buffer.from(response.data, 'binary');
            contentType = response.headers['content-type'];
        } else {
            const cleanPath = imageUrl.replace(/\\/g, '/').replace('http://localhost:5000/', '');
            const relativePath = cleanPath.startsWith('uploads/') ? cleanPath : `uploads/${cleanPath}`;
            const fullPath = path.join(__dirname, '..', relativePath);

            if (fs.existsSync(fullPath)) {
                imageBuffer = fs.readFileSync(fullPath);
                const ext = path.extname(fullPath).toLowerCase();
                if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
            } else {
                return res.status(404).json({ message: 'الملف غير موجود' });
            }
        }

        const base64Image = `data:${contentType};base64,${imageBuffer.toString('base64')}`;
        res.json({ base64: base64Image });
    } catch (error) {
        res.status(500).json({ message: 'فشلت معالجة الصورة' });
    }
};

module.exports = { 
    getPLTeams, updateSeasonTeams, selectTeam, createTeam: selectTeam, getMyTeam, 
    importPenaltiesExcel, approveManager, getPendingTeams, getPendingPlayers, 
    approvePlayer, joinTeamRequest, requestSubstitution, approveSubstitution, 
    rejectSubstitution, changeTeamManager, getImageProxy 
};