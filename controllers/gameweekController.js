const GameweekData = require('../models/GameweekData');
const Team = require('../models/Team');
const League = require('../models/League');
const Gameweek = require('../models/Gameweek'); 
const User = require('../models/User'); 
const { getUserFPLPoints, getCurrentGameweekStatus } = require('../services/fplService');
const axios = require('axios');

// 1. مزامنة المواعيد
const syncGameweeks = async (req, res) => {
    try {
        const fplResponse = await axios.get('https://fantasy.premierleague.com/api/bootstrap-static/');
        const events = fplResponse.data.events;
        const updatePromises = events.map(event => 
            Gameweek.findOneAndUpdate(
                { number: event.id },
                { 
                    deadline_time: new Date(event.deadline_time),
                    status: event.is_current ? 'current' : (event.is_next ? 'next' : 'future')
                },
                { upsert: true, new: true }
            )
        );
        await Promise.all(updatePromises);
        res.json({ message: `🚀 تمت مزامنة الجولات بنجاح!` });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

// 2. دالة حفظ التشكيلة
const setLineup = async (req, res) => {
    try {
        const { players, activeChip, gw } = req.body; 
        const team = await Team.findOne({ managerId: req.user.id });
        if (!team) return res.status(404).json({ message: 'الفريق غير موجود' });

        const league = await League.findById(team.leagueId);

        // 🔒 القفل الحديدي: تحديد الجولة القادمة فقط كهدف وحيد مسموح به
        const nextGw = league.currentGw + 1;
        
        // التحقق مما إذا كان المستخدم يحاول تعديل جولة غير القادمة
        if (parseInt(gw) !== nextGw) {
            return res.status(403).json({ 
                message: `⛔ غير مسموح! يمكنك فقط تعديل تشكيلة الجولة القادمة (${nextGw})` 
            });
        }
		
		if (activeChip && activeChip !== 'none') {
            const isFirstHalf = nextGw <= 19;
            const startRange = isFirstHalf ? 1 : 20;
            const endRange = isFirstHalf ? 19 : 38;

            // البحث عن أي استخدام سابق لهذه الخاصية في نفس المرحلة
            const usedInPhase = await GameweekData.findOne({
                teamId: team._id,
                activeChip: activeChip,
                gameweek: { $gte: startRange, $lte: endRange }
            });

            if (usedInPhase) {
                const phaseName = isFirstHalf ? "ذهاب" : "إياب";
                return res.status(400).json({ 
                    message: `⛔ لقد استخدمت خاصية ${activeChip} بالفعل في مرحلة ال${phaseName}!` 
                });
            }
        }

        const startersCount = players.filter(p => p.isStarter === true).length;
        if (startersCount !== 3) return res.status(400).json({ message: `⛔ اختيار 3 أساسيين فقط` });

        // التحقق من الديدلاين للجولة القادمة
        const localGw = await Gameweek.findOne({ number: nextGw });
        if (localGw && new Date() > new Date(localGw.deadline_time)) {
            return res.status(400).json({ message: `⛔ انتهى وقت التعديل لجولة ${nextGw}` });
        }

        const formattedPlayers = players.map(p => ({
            userId: p.userId?._id || p.userId, 
            isStarter: p.isStarter, 
            isCaptain: p.isCaptain,
            rawPoints: 0, 
            transferCost: 0, 
            finalScore: 0
        }));

        // استخدام nextGw بدلاً من targetGw لضمان الكتابة في المكان الصحيح
        await GameweekData.findOneAndUpdate(
            { teamId: team._id, gameweek: nextGw },
            { 
                lineup: formattedPlayers, 
                activeChip: activeChip || 'none', 
                leagueId: team.leagueId, 
                'stats.isProcessed': false 
            },
            { upsert: true, new: true }
        );

        team.missedDeadlines = 0;
        await team.save();
        res.json({ message: `تم حفظ تشكيلة الجولة ${nextGw} بنجاح ✅` });
    } catch (error) { 
        res.status(500).json({ message: 'خطأ في حفظ التشكيلة' }); 
    }
};

// 3. جلب التشكيلة (منطق النزاهة: حتى المدير لا يرى التشكيلات قبل الديدلاين 🔒)
const getTeamGwData = async (req, res) => {
    try {
        const { teamId, gw } = req.params;
        const requestedGw = parseInt(gw);
        const localGw = await Gameweek.findOne({ number: requestedGw });
        const now = new Date();

        // جلب فريق المستخدم الحالي للتأكد من الملكية
        const myTeam = await Team.findOne({ managerId: req.user.id });
        const isOwner = myTeam && myTeam._id.toString() === teamId;
        
        // التحقق من مرور الديدلاين
        const deadlinePassed = localGw && now > new Date(localGw.deadline_time);

        // القفل: إذا لم يكن صاحب الفريق ولم يمر الديدلاين -> ممنوع (حتى للآدمن)
        if (!isOwner && !deadlinePassed) {
            return res.status(403).json({ 
                restricted: true, 
                message: '🔒 التشكيلة سرية للجميع (بمن فيهم الإدارة) حتى مرور وقت الديدلاين' 
            });
        }

        let gwData = await GameweekData.findOne({ teamId, gameweek: requestedGw }).populate('lineup.userId', 'username position fplId photo');
        if (gwData) return res.json({ ...gwData.toObject(), isInherited: false });

        if (requestedGw > 1) {
            const lastSaved = await GameweekData.findOne({ teamId, gameweek: { $lt: requestedGw } }).sort({ gameweek: -1 }).populate('lineup.userId', 'username position fplId photo');
            if (lastSaved) return res.json({ ...lastSaved.toObject(), gameweek: requestedGw, activeChip: 'none', isInherited: true });
        }
        const teamData = await Team.findById(teamId).populate('members', 'username fplId position');
        res.json({ members: teamData ? teamData.members : [], noData: true });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

// 4. جلب حالة الجولة
const getGwStatus = async (req, res) => {
    try {
        const now = new Date();
        const nextGw = await Gameweek.findOne({ deadline_time: { $gt: now } }).sort({ number: 1 });
        const currentGw = await Gameweek.findOne({ deadline_time: { $lte: now } }).sort({ number: -1 });

        res.json({
            id: currentGw ? currentGw.number : 1,
            nextGwId: nextGw ? nextGw.number : (currentGw ? currentGw.number + 1 : 1),
            deadline_time: nextGw ? nextGw.deadline_time : (currentGw ? currentGw.deadline_time : now),
            isDeadlinePassed: true 
        });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

// 5. الحساب الكامل (بكل الخواص)
const calculateScores = async (req, res) => {
    try {
        // ✅ السماح بالدخول إذا كان استدعاء داخلي من السيرفر أو إذا كان المستخدم أدمن
        const isInternalRequest = !req.headers; 
        if (!isInternalRequest && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'للأدمن فقط' });
        }

        const { leagueId } = req.body;
        const league = await League.findById(leagueId);
        if (!league) {
            if (res) return res.status(404).json({ message: "League not found" });
            return;
        }

        // ✅ تحديث حالة الدوري إلى "جاري العمل" للمراقبة
        league.autoUpdateStatus = 'running';
        await league.save();

        const currentGw = league.currentGw; 
        const allTeams = await Team.find({ leagueId, isApproved: true });
        
        const roundResults = [];
        const allUserIds = new Set();
        
        for (const team of allTeams) {
            const gwData = await GameweekData.findOne({ teamId: team._id, gameweek: currentGw });
            if (gwData?.lineup) gwData.lineup.forEach(s => s.userId && allUserIds.add(s.userId.toString()));
        }

        const users = await User.find({ _id: { $in: Array.from(allUserIds) } });
        const fplResults = await Promise.all(users.map(u => 
            getUserFPLPoints(u.fplId, currentGw).then(d => ({ userId: u._id.toString(), data: d }))
            .catch(() => ({ userId: u._id.toString(), data: { gwPoints: 0, eventTransfersCost: 0 } }))
        ));
        const fplDataMap = new Map(fplResults.map(r => [r.userId, r.data]));

        for (const team of allTeams) {
            if (team.isDisqualified) continue;
            let gwData = await GameweekData.findOne({ teamId: team._id, gameweek: currentGw });
            let isInherited = false;
            let pointsDeduction = 0;

            if (!gwData) {
                isInherited = true;
                team.missedDeadlines = (team.missedDeadlines || 0) + 1;
                if (team.missedDeadlines === 2) pointsDeduction = 1;
                else if (team.missedDeadlines === 3) pointsDeduction = 2;
                else if (team.missedDeadlines >= 4) team.isDisqualified = true;
                
                // خصم نقاط من الإجمالي
                team.stats.totalPoints -= pointsDeduction;

                const last = await GameweekData.findOne({ teamId: team._id, gameweek: { $lt: currentGw } }).sort({ gameweek: -1 });
                gwData = await GameweekData.create({
                    teamId: team._id, leagueId, gameweek: currentGw, 
                    lineup: last ? last.lineup.map(p => ({...p.toObject(), rawPoints:0, finalScore:0})) : [], 
                    activeChip: 'none',
                    stats: { totalPoints: 0, isProcessed: false }
                });
            }

            let roundTotal = 0;
            let playersDetailed = gwData.lineup.map(slot => {
                const fpl = fplDataMap.get(slot.userId.toString()) || { gwPoints: 0, eventTransfersCost: 0 };
                return { userId: slot.userId.toString(), raw: fpl.gwPoints, hits: fpl.eventTransfersCost, net: fpl.gwPoints - fpl.eventTransfersCost, slot };
            });

            // منطق التوريث (Inheritance) - اختيار أسوأ لاعب ككابتن وأفضل لاعب كدكة
            if (isInherited && playersDetailed.length > 0) {
                const sorted = [...playersDetailed].sort((a, b) => a.net - b.net);
                gwData.lineup.forEach(s => {
                    s.isCaptain = (s.userId.toString() === sorted[0].userId);
                    s.isStarter = (s.userId.toString() !== sorted[sorted.length - 1].userId);
                });
            }

            const chip = gwData.activeChip;

            // تطبيق خاصية The Best
            if (!isInherited && chip === 'theBest') {
                const starters = playersDetailed.filter(p => p.slot.isStarter);
                if (starters.length > 0) {
                    const best = starters.sort((a, b) => b.net - a.net)[0];
                    gwData.lineup.forEach(s => s.isCaptain = (s.userId.toString() === best.userId));
                }
            }

            // تطبيق خاصية Free Hit (تبديل أوتوماتيكي لأفضل دكة بأسوأ أساسي)
            if (!isInherited && chip === 'freeHit') {
                const startersNonCap = playersDetailed.filter(p => p.slot.isStarter && !p.slot.isCaptain);
                const bench = playersDetailed.find(p => !p.slot.isStarter);
                if (startersNonCap.length > 0 && bench) {
                    const worst = startersNonCap.sort((a, b) => a.net - b.net)[0];
                    if (bench.net > worst.net) {
                        gwData.lineup.forEach(s => {
                            if (s.userId.toString() === worst.userId) s.isStarter = false;
                            if (s.userId.toString() === bench.userId) s.isStarter = true;
                        });
                    }
                }
            }

            // الحساب النهائي للنقاط
            gwData.lineup.forEach((slot) => {
                const p = playersDetailed.find(pd => pd.userId === slot.userId.toString());
                if (p) {
                    let mult = slot.isCaptain ? (chip === 'tripleCaptain' ? 3 : 2) : 1;
                    const final = p.net * mult;
                    slot.rawPoints = p.raw;
                    slot.transferCost = p.hits;
                    slot.finalScore = final;
                    if (slot.isStarter || chip === 'benchBoost') roundTotal += final;
                }
            });

            gwData.stats.totalPoints = Math.max(0, roundTotal - pointsDeduction);
            gwData.stats.isProcessed = true;
            gwData.markModified('lineup');
            await gwData.save();

            // تحديث إجمالي نقاط الفريق في الدوري
            // ملاحظة: يجب تصفير totalPoints في بداية الجولة أو التعامل مع التحديث التراكمي بحذر
            // هنا سنفترض أننا نحدث الجولة الحالية فقط، لذا يفضل إعادة حساب الإجمالي من كل الجولات لضمان الدقة
            const allGws = await GameweekData.find({ teamId: team._id });
            team.stats.totalPoints = allGws.reduce((acc, curr) => acc + (curr.stats.totalPoints || 0), 0);
            team.stats.gamesPlayed = allGws.length;
            await team.save();

            roundResults.push({ teamId: team._id, points: gwData.stats.totalPoints });
        }

        // توزيع نقاط الـ Bonus (نقطة واحدة لمتصدر الجولة)
        if (roundResults.length > 0) {
            const max = Math.max(...roundResults.map(r => r.points));
            const winners = roundResults.filter(r => r.points === max);
            
            // تسجيل بطل الجولة في موديل الدوري
            if (winners.length > 0) {
                 const firstWinner = await Team.findById(winners[0].teamId);
                 league.lastGwWinner = {
                    teamId: firstWinner._id,
                    teamName: firstWinner.name,
                    points: max,
                    gameweek: currentGw
                 };
            }

            if (winners.length === 1) {
                const t = await Team.findById(winners[0].teamId);
                // منع تكرار إضافة البونص لنفس الجولة
                // (تحتاج لإضافة منطق لمنع تكرار البونص إذا اشتغلت الدالة كل 5 دقائق)
                // مثال: التحقق مما إذا كان قد حصل على بونص لهذه الجولة مسبقاً
            }
        }

        await updateLeagueStandings(leagueId);

        // ✅ تحديث حالة المراقبة إلى نجاح
        league.autoUpdateStatus = 'success';
        league.lastAutoUpdate = new Date();
        await league.save();

        if (res) res.json({ message: "✅ تم الحساب بنجاح" });

    } catch (error) { 
        console.error("CRON ERROR:", error.message);
        // تسجيل الفشل في المراقبة
        try {
            const { leagueId } = req.body;
            await League.findByIdAndUpdate(leagueId, { autoUpdateStatus: 'failed' });
        } catch (e) {}
        
        if (res) res.status(500).json({ message: error.message }); 
    }
};
const updateLeagueStandings = async (leagueId) => {
    try {
        // جلب جميع الفرق المنضمة والمعتمدة في الدوري
        const teams = await Team.find({ leagueId, isApproved: true });

        // ترتيب الفرق بناءً على:
        // 1. النقاط (points) - وهي النقاط التي تُمنح للفائز بالجولة أو عبر البونص
        // 2. إجمالي نقاط الجولات (totalPoints) - في حال التعادل في النقاط
        teams.sort((a, b) => {
            if (b.stats.points !== a.stats.points) {
                return b.stats.points - a.stats.points;
            }
            return b.stats.totalPoints - a.stats.totalPoints;
        });

        // تحديث مركز كل فريق في قاعدة البيانات
        const updatePromises = teams.map((team, index) => {
            team.stats.position = index + 1;
            // تسجيل إذا كان هناك صعود أو هبوط في المراكز (اختياري)
            return team.save();
        });

        await Promise.all(updatePromises);
        console.log(`🏆 تم تحديث جدول الترتيب للدوري: ${leagueId}`);
    } catch (error) {
        console.error('❌ خطأ في تحديث الترتيب:', error.message);
    }
};

const startNewGameweek = async (req, res) => {
    try {
        const { leagueId } = req.body;
        const league = await League.findById(leagueId);
        league.currentGw += 1;
        await league.save();
        res.json({ message: `✅ بدأت الجولة ${league.currentGw}` });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

module.exports = { setLineup, calculateScores, getGwStatus, getTeamGwData, syncGameweeks, startNewGameweek };