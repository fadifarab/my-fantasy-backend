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
// في teamController.js - تحديث دالة getMyTeam فقط
// في teamController.js - التحديث النهائي المنقذ لدالة getMyTeam
const getMyTeam = async (req, res) => {
    try {
        let { gw } = req.query; 
        const user = await User.findById(req.user.id);
        
        if (!user || !user.teamId) {
            return res.status(404).json({ message: 'لم تنضم لفريق بعد' });
        }

        let requestedGw = parseInt(gw);
        const league = await League.findById(user.leagueId);
        if (isNaN(requestedGw)) {
            requestedGw = league ? league.currentGw : 1;
        }

        const team = await Team.findById(user.teamId)
            .populate('managerId', 'username _id') 
            .populate('members', 'username fplId role position _id')
            .populate('pendingMembers', 'username fplId role _id email');

        const targetGwDeadline = await Gameweek.findOne({ number: requestedGw });
        const now = new Date();
        const isDeadlinePassed = targetGwDeadline && now > new Date(targetGwDeadline.deadline_time);

        // جلب البيانات المحفوظة للجولة المطلوبة
        let savedGwData = await GameweekData.findOne({ 
            teamId: user.teamId, 
            gameweek: requestedGw 
        }).populate('lineup.userId', 'username fplId position');

        let finalLineup = [];
        let isInherited = false;

        // ==========================================
        // 🚀 المنطق المصلح والشامل 🚀
        // ==========================================

        if (isDeadlinePassed) {
            // 1. بعد الديدلاين: الأولوية المطلقة للمحفوظ أو الوراثة التاريخية
            if (savedGwData) {
                finalLineup = savedGwData.lineup;
                isInherited = savedGwData.isInherited || false;
            } else {
                const lastSaved = await GameweekData.findOne({ 
                    teamId: user.teamId, 
                    gameweek: { $lt: requestedGw } 
                }).sort({ gameweek: -1 }).populate('lineup.userId', 'username fplId position');
                finalLineup = lastSaved ? lastSaved.lineup : [];
                isInherited = true;
            }
        } else {
            // 2. قبل الديدلاين (وقت التعديل):
            if (savedGwData && savedGwData.lineup && savedGwData.lineup.length > 0) {
                // ✅ أهم نقطة: إذا المناجير حفظ تشكيلة، نعرضها هي عند العودة
                finalLineup = savedGwData.lineup;
                isInherited = false;
            } else {
                // إذا لم يحفظ شيئاً بعد، نعرض أعضاء الفريق الحاليين (ليظهر اللاعب الجديد)
                finalLineup = team.members.map(m => ({
                    userId: m,
                    isStarter: false,
                    isCaptain: false
                }));
                isInherited = true; // نعتبرها وراثة من قائمة الأعضاء حتى يتم الحفظ
            }
        }

        res.json({
            ...team._doc,
            deadline_time: targetGwDeadline ? targetGwDeadline.deadline_time : null,
            isDeadlinePassed: isDeadlinePassed,
            lineup: finalLineup, 
            activeChip: (savedGwData && !isInherited) ? savedGwData.activeChip : 'none',
            isInherited: isInherited,
            pendingMembers: team.pendingMembers || []
        });

    } catch (error) {
        console.error("GetMyTeam Rescue Error:", error.message);
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
                    team.penaltyPoints = 3;
                    team.isDisqualified = false;
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
// في teamController.js - التأكد من دالة getPendingPlayers
const getPendingPlayers = async (req, res) => {
    try {
        const { teamId } = req.params;
        
        // البحث عن الفريق مع populate صحيح
        const team = await Team.findById(teamId)
            .populate('pendingMembers', 'username fplId email profileImage role _id');
        
        if (!team) {
            return res.status(404).json({ message: 'تعذر العثور على الفريق' });
        }
        
        // إرجاع البيانات بشكل واضح
        res.json({
            success: true,
            teamName: team.name,
            pendingPlayers: team.pendingMembers || [],
            count: team.pendingMembers ? team.pendingMembers.length : 0
        });
    } catch (error) {
        console.error("Error fetching pending players:", error);
        res.status(500).json({ 
            success: false,
            message: "حدث خطأ في جلب طلبات الانضمام",
            error: error.message 
        });
    }
};

// في teamController.js - إضافة هذه الدالة إذا لزم الأمر
const rejectPlayer = async (req, res) => {
    try {
        const { playerId, teamId } = req.body;
        
        const team = await Team.findById(teamId);
        if (!team) {
            return res.status(404).json({ message: 'الفريق غير موجود' });
        }
        
        // إزالة اللاعب من pendingMembers فقط
        await Team.findByIdAndUpdate(teamId, {
            $pull: { pendingMembers: playerId }
        });
        
        res.json({ 
            success: true,
            message: 'تم رفض طلب الانضمام بنجاح'
        });
    } catch (error) {
        console.error("Reject player error:", error);
        res.status(500).json({ 
            success: false,
            message: "حدث خطأ أثناء رفض اللاعب",
            error: error.message 
        });
    }
};

// @desc    قبول لاعب في الفريق (الحل النهائي لمشكلة الزر)
// في teamController.js - تحديث دالة approvePlayer لتكون دائماً متاحة
/*const approvePlayer = async (req, res) => {
    try {
        const { playerId, teamId } = req.body;
        const userId = req.user.id;
        
        console.log("🔍 Approve player request:", { playerId, teamId, userId });
        
        // 1. التحقق من وجود الفريق
        const team = await Team.findById(teamId)
            .populate('managerId', '_id username')
            .populate('pendingMembers', '_id username');
        
        if (!team) {
            return res.status(404).json({ 
                success: false, 
                message: 'الفريق غير موجود' 
            });
        }
        
        console.log("📋 Team found:", team.name);
        console.log("👥 Pending members:", team.pendingMembers.map(p => ({ id: p._id, name: p.username })));
        
        // 2. التحقق من أن المستخدم هو مناجير الفريق
        const isManager = team.managerId._id.toString() === userId.toString();
        const isAdmin = req.user.role === 'admin';
        
        if (!isManager && !isAdmin) {
            return res.status(403).json({ 
                success: false, 
                message: 'غير مصرح لك - فقط مناجير الفريق يمكنه قبول اللاعبين' 
            });
        }
        
        // 3. التحقق من أن اللاعب في قائمة الانتظار
        const isPending = team.pendingMembers.some(p => p._id.toString() === playerId.toString());
        
        if (!isPending) {
            return res.status(400).json({ 
                success: false, 
                message: 'اللاعب ليس في قائمة طلبات الانضمام أو تم قبوله مسبقاً' 
            });
        }
        
        // 4. التحقق من السعة (4 لاعبين كحد أقصى)
        if (team.members.length >= 4) {
            return res.status(400).json({ 
                success: false, 
                message: 'عذراً، الفريق مكتمل (4 لاعبين كحد أقصى)' 
            });
        }
        
        // 5. التحقق من أن اللاعب ليس في فريق آخر
        const player = await User.findById(playerId);
        if (player.teamId && player.teamId.toString() !== teamId.toString()) {
            return res.status(400).json({ 
                success: false, 
                message: 'اللاعب منضم لفريق آخر بالفعل' 
            });
        }
        
        // 6. تنفيذ العملية (بدون ترانزاكشن لتبسيط الأمور)
        // إزالة من pendingMembers وإضافة إلى members
        await Team.findByIdAndUpdate(
            teamId,
            { 
                $pull: { pendingMembers: playerId },
                $addToSet: { members: playerId }
            }
        );
        
        // تحديث بيانات اللاعب
        await User.findByIdAndUpdate(
            playerId,
            { 
                teamId: teamId,
                isApproved: true,
                role: 'player',
                joinedAt: new Date()
            }
        );
        
        console.log("✅ Player approved successfully");
        
        res.json({ 
            success: true, 
            message: `تم قبول ${player.username} في فريق ${team.name} بنجاح ✅`,
            teamId,
            playerId
        });
        
    } catch (error) {
        console.error("❌ Error in approvePlayer:", error);
        res.status(500).json({ 
            success: false, 
            message: "حدث خطأ أثناء قبول اللاعب",
            error: error.message 
        });
    }
};*/

const approvePlayer = async (req, res) => {
    try {
        const { playerId, teamId } = req.body;
        const userId = req.user.id;
        
        // 1. التحقق من وجود الفريق
        const team = await Team.findById(teamId)
            .populate('managerId', '_id username')
            .populate('pendingMembers', '_id username');
        
        if (!team) {
            return res.status(404).json({ success: false, message: 'الفريق غير موجود' });
        }
        
        // 2. التحقق من الصلاحيات (مناجير أو أدمن)
        const isManager = team.managerId._id.toString() === userId.toString();
        const isAdmin = req.user.role === 'admin';
        
        if (!isManager && !isAdmin) {
            return res.status(403).json({ success: false, message: 'غير مصرح لك' });
        }
        
        // 3. التحقق من السعة (4 لاعبين كحد أقصى)
        // ✅ هذا هو "القفل" الذي سيفتح بعد عملية الطرد التي برمجناها
        if (team.members.length >= 4) {
            return res.status(400).json({ success: false, message: 'عذراً، الفريق مكتمل (الحد الأقصى 4)' });
        }

        // 4. التحقق من أن اللاعب في قائمة الانتظار
        const isPending = team.pendingMembers.some(p => p._id.toString() === playerId.toString());
        if (!isPending) {
            return res.status(400).json({ success: false, message: 'اللاعب ليس في قائمة الانتظار' });
        }

        // 5. التحقق من أن اللاعب ليس في فريق آخر
        const player = await User.findById(playerId);
        if (player.teamId && player.teamId.toString() !== teamId.toString()) {
            return res.status(400).json({ success: false, message: 'اللاعب منضم لفريق آخر بالفعل' });
        }
        
        // 6. التنفيذ: تحديث الفريق والمستخدم
        // نحدث مصفوفة members (هذا يجعله متاحاً للجولات القادمة فقط)
        await Team.findByIdAndUpdate(teamId, { 
            $pull: { pendingMembers: playerId },
            $addToSet: { members: playerId }
        });
        
        await User.findByIdAndUpdate(playerId, { 
            teamId: teamId,
            isApproved: true,
            role: 'player',
            joinedAt: new Date()
        });

        // 📝 ملاحظة للمبرمج: 
        // نحن لم نضف playerId إلى GameweekData للجولة الحالية.
        // لذا، نقاطه لن تظهر إلا في الجولة القادمة عندما يتم إنشاء سجل جديد أو بالوراثة.
        
        res.json({ 
            success: true, 
            message: `تم قبول ${player.username} بنجاح. سيتمكن من المشاركة في الجولة القادمة ✅`,
            teamId,
            playerId
        });
        
    } catch (error) {
        res.status(500).json({ success: false, message: "حدث خطأ أثناء قبول اللاعب", error: error.message });
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

/*const approveSubstitution = async (req, res) => {
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
};*/

const approveSubstitution = async (req, res) => {
    try {
        const { teamId } = req.body;
        
        // 1. جلب بيانات الفريق والطلب
        const team = await Team.findById(teamId);
        if (!team || !team.substitutionRequest) {
            return res.status(404).json({ message: 'لا يوجد طلب تبديل معلق لهذا الفريق' });
        }

        const memberIdToRemove = team.substitutionRequest.memberId;

        // 2. تحديث بيانات المستخدم (المطرود)
        // نسحب منه الـ teamId ونعيد دوره إلى لاعب عادي (player)
        // لاحظ: لا نحذف الحساب نهائياً للحفاظ على الـ Populate في الجولات السابقة
        await User.findByIdAndUpdate(memberIdToRemove, { 
            $unset: { teamId: "" },
            $set: { role: 'player' } 
        });

        // 3. تحديث بيانات الفريق
        // سحب اللاعب من مصفوفة الأعضاء (تصبح 3/4) لفتح مجال للعضو الجديد
        await Team.findByIdAndUpdate(teamId, {
            $pull: { members: memberIdToRemove },
            $set: { hasUsedSubstitution: true },
            $unset: { substitutionRequest: "" }
        });

        // ملاحظة برمجية: لم نلمس GameweekData للجولة الحالية 
        // محرك المزامنة (الـ 5 دقائق) سيستمر في تحديث نقاط memberIdToRemove 
        // لأنه لا يزال موجوداً في مصفوفة lineup الخاصة بالجولة 20 مثلاً.

        res.json({ 
            success: true,
            message: 'تمت الموافقة على التبديل بنجاح. تم فتح خانة شاغرة، وستستمر نقاط العضو المطرود في النزول حتى نهاية الجولة الحالية ✅' 
        });

    } catch (error) {
        console.error("Substitution Approval Error:", error);
        res.status(500).json({ message: "حدث خطأ أثناء معالجة الطلب: " + error.message });
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
    approvePlayer, joinTeamRequest, rejectPlayer, requestSubstitution, approveSubstitution, 
    rejectSubstitution, changeTeamManager, getImageProxy 
};