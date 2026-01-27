const GameweekData = require('../models/GameweekData');
const Team = require('../models/Team');
const League = require('../models/League');
const Gameweek = require('../models/Gameweek'); 
const User = require('../models/User'); 
const Fixture = require('../models/Fixture'); 
const { getUserFPLPoints, getCurrentGameweekStatus } = require('../services/fplService');
const axios = require('axios');
const xlsx = require('xlsx');

// 1. مزامنة المواعيد من سيرفر الفانتزي الرسمي
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

// دالة مساعدة للتحقق من توفر الخاصية في المرحلة (ذهاب/إياب)
const isChipAvailableInPhase = async (teamId, chipName, targetGw) => {
    if (!chipName || chipName === 'none') return true;

    // تحديد نطاق الجولات بناءً على مرحلة الدوري
    const startPhase = targetGw <= 19 ? 1 : 20;
    const endPhase = targetGw <= 19 ? 19 : 38;

    // البحث عن أي جولة أخرى في نفس المرحلة استُخدمت فيها هذه الخاصية
    const usedBefore = await GameweekData.findOne({
        teamId: teamId,
        activeChip: chipName,
        gameweek: { $gte: startPhase, $lte: endPhase, $ne: targetGw } // $ne لضمان عدم فحص الجولة الحالية نفسها عند التحديث
    });

    return !usedBefore; // إذا وجدنا سجل، نرجع false (غير متاحة)
};

// 2. دالة حفظ التشكيلة اليدوية للمناجير
/*const setLineup = async (req, res) => {
    try {
        const { players, activeChip, gw } = req.body; 
        const team = await Team.findOne({ managerId: req.user.id });
        if (! team) return res.status(404).json({ message: 'الفريق غير موجود' });

        const league = await League.findById(team.leagueId);
        const nextGw = league.currentGw + 1;

        if (parseInt(gw) !== nextGw) {
            return res.status(403).json({ message: `⛔ غير مسموح! يمكنك فقط تعديل تشكيلة الجولة القادمة (${nextGw})` });
        }

        const localGw = await Gameweek.findOne({ number: nextGw });
        if (localGw && new Date() > new Date(localGw.deadline_time)) {
            return res.status(400).json({ message: `⛔ انتهى وقت التعديل لجولة ${nextGw}` });
        }

        const formattedPlayers = players.map(p => ({
            userId: p.userId?._id || p.userId, 
            isStarter: p.isStarter, 
            isCaptain: p.isCaptain,
            rawPoints: 0, transferCost: 0, finalScore: 0
        }));

        await GameweekData.findOneAndUpdate(
            { teamId: team._id, gameweek: nextGw },
            { 
                lineup: formattedPlayers, 
                activeChip: activeChip || 'none', 
                leagueId: team.leagueId, 
                isInherited: false,
                'stats.isProcessed': false 
            },
            { upsert: true, new: true }
        );

        await Team.findByIdAndUpdate(team._id, { $set: { missedDeadlines: 0 } });
        res.json({ message: `تم حفظ تشكيلة الجولة ${nextGw} بنجاح ✅` });
    } catch (error) { res.status(500).json({ message: 'خطأ في حفظ التشكيلة' }); }
};*/

// 2. دالة حفظ التشكيلة المحدثة
const setLineup = async (req, res) => {
    try {
        const { players, activeChip, gw } = req.body; 
        const team = await Team.findOne({ managerId: req.user.id });
        if (!team) return res.status(404).json({ message: 'الفريق غير موجود' });

        const league = await League.findById(team.leagueId);
        const nextGw = parseInt(gw); // التأكد من أنه رقم

        // التحقق من رقم الجولة
        if (nextGw !== (league.currentGw + 1)) {
            return res.status(403).json({ message: `⛔ يمكنك فقط تعديل الجولة القادمة (${league.currentGw + 1})` });
        }

        // التحقق من الوقت (Deadline)
        const localGw = await Gameweek.findOne({ number: nextGw });
        if (localGw && new Date() > new Date(localGw.deadline_time)) {
            return res.status(400).json({ message: `⛔ انتهى وقت التعديل لجولة ${nextGw}` });
        }

        // --- 🚀 إضافة التحقق من توفر الخاصية في المرحلة ---
        if (activeChip && activeChip !== 'none') {
            const available = await isChipAvailableInPhase(team._id, activeChip, nextGw);
            if (!available) {
                const phaseName = nextGw <= 19 ? "الذهاب (1-19)" : "الإياب (20-38)";
                return res.status(400).json({ 
                    message: `⛔ لقد استهلكت خاصية (${activeChip}) سابقاً في مرحلة ${phaseName}` 
                });
            }
        }
        // ----------------------------------------------

        const formattedPlayers = players.map(p => ({
            userId: p.userId?._id || p.userId, 
            isStarter: p.isStarter, 
            isCaptain: p.isCaptain,
            rawPoints: 0, transferCost: 0, finalScore: 0
        }));

        await GameweekData.findOneAndUpdate(
            { teamId: team._id, gameweek: nextGw },
            { 
                lineup: formattedPlayers, 
                activeChip: activeChip || 'none', 
                leagueId: team.leagueId, 
                isInherited: false,
                'stats.isProcessed': false 
            },
            { upsert: true, new: true }
        );

        //await Team.findByIdAndUpdate(team._id, { $set: { missedDeadlines: 0 } });
        res.json({ message: `تم حفظ تشكيلة الجولة ${nextGw} بنجاح ✅` });
    } catch (error) { 
        res.status(500).json({ message: 'خطأ في حفظ التشكيلة' }); 
    }
};

// 3. جلب بيانات التشكيلة لعرضها (إظهار الخواص للجميع)
const getTeamGwData = async (req, res) => {
    try {
        const { teamId, gw } = req.params;
        const requestedGw = parseInt(gw);
        const localGw = await Gameweek.findOne({ number: requestedGw });
        const now = new Date();

        const myTeam = await Team.findOne({ managerId: req.user.id });
        const isOwner = myTeam && myTeam._id.toString() === teamId;
        const deadlinePassed = localGw && now > new Date(localGw.deadline_time);

        if (!isOwner && !deadlinePassed) {
            return res.status(403).json({ restricted: true, message: '🔒 التشكيلة سرية للجميع حتى مرور وقت الديدلاين' });
        }

        let gwData = await GameweekData.findOne({ teamId, gameweek: requestedGw }).populate('lineup.userId', 'username position fplId photo');
        
        if (gwData) return res.json({ ...gwData.toObject(), isInherited: gwData.isInherited || false });

        if (requestedGw > 1) {
            const lastSaved = await GameweekData.findOne({ teamId, gameweek: { $lt: requestedGw } }).sort({ gameweek: -1 }).populate('lineup.userId', 'username position fplId photo');
            if (lastSaved) return res.json({ ...lastSaved.toObject(), gameweek: requestedGw, activeChip: 'none', isInherited: true });
        }
        const teamData = await Team.findById(teamId).populate('members', 'username fplId position');
        res.json({ members: teamData ? teamData.members : [], noData: true });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

// 4. جلب حالة الجولة الحالية والقادمة
const getGwStatus = async (req, res) => {
    try {
        const now = new Date();
        
        // 1. الجولة القادمة (التي لم يحن موعدها بعد)
        const nextGw = await Gameweek.findOne({ deadline_time: { $gt: now } }).sort({ number: 1 });
        
        // 2. الجولة الجارية (التي بدأ وقتها فعلياً)
        const currentGw = await Gameweek.findOne({ deadline_time: { $lte: now } }).sort({ number: -1 });

        // 🚨 المنطق الصحيح لـ isDeadlinePassed:
        // نتحقق من الجولة "التالية" في جدول الدوري؛ هل انقضى وقتها؟
        // لكن للتبسيط، سنعتمد على وجود nextGw
        const isDeadlinePassed = !nextGw; 

        res.json({
            // id هو رقم الجولة التي نلعبها الآن (الجاري حساب نقاطها)
            id: currentGw ? currentGw.number : 1,
            
            // nextGwId هو الرقم الذي سيستخدمه الإشعار (الجولة المطلوب تأكيدها)
            nextGwId: nextGw ? nextGw.number : (currentGw ? currentGw.number + 1 : 1),
            
            deadline_time: nextGw ? nextGw.deadline_time : (currentGw ? currentGw.deadline_time : now),
            
            // هذا الحقل سيخبر الفرونت إند: "قفل التعديل" أو "افتح التعديل"
            isDeadlinePassed: isDeadlinePassed 
        });
    } catch (error) { 
        res.status(500).json({ message: error.message }); 
    }
};

// 🛠 5. المحرك المطور لتحديث الترتيب وحساب البونيس التاريخي آلياً من ملف الإكسل
const updateLeagueStandingsInternal = async (leagueId) => {
    try {
        // 1. جلب الفرق والمباريات
        const teams = await Team.find({ leagueId, isApproved: true });
        const finishedFixtures = await Fixture.find({ leagueId, isFinished: true });

        const bulkOps = [];

        for (const team of teams) {
            // جلب المباريات المنتهية لهذا الفريق
            const teamMatches = finishedFixtures.filter(f => 
                f.homeTeamId.toString() === team._id.toString() || 
                f.awayTeamId.toString() === team._id.toString()
            );

            let fixturePoints = 0;
            let totalFpl = 0;
            teamMatches.forEach(m => {
                const isHome = m.homeTeamId.toString() === team._id.toString();
                const myScore = isHome ? (m.homeScore || 0) : (m.awayScore || 0);
                const oppScore = isHome ? (m.awayScore || 0) : (m.homeScore || 0);
                totalFpl += myScore;
                if (myScore > oppScore) fixturePoints += 3;
                else if (myScore === oppScore) fixturePoints += 1;
            });

            // حساب البونيس (إعادة الحساب من واقع المباريات لضمان الدقة)
            let bonusPoints = 0;
            const uniqueGws = [...new Set(finishedFixtures.map(f => f.gameweek))];
            uniqueGws.forEach(gw => {
                const gwMatches = finishedFixtures.filter(f => f.gameweek === gw);
                const roundScores = gwMatches.flatMap(f => [
                    { id: f.homeTeamId.toString(), s: f.homeScore || 0 },
                    { id: f.awayTeamId.toString(), s: f.awayScore || 0 }
                ]);
                const maxScore = Math.max(...roundScores.map(rs => rs.s));
                if (maxScore > 0 && roundScores.some(rs => rs.id === team._id.toString() && rs.s === maxScore)) {
                    bonusPoints += 1;
                }
            });

            // 🚨 النقطة الجوهرية: قراءة العقوبة مباشرة من قاعدة البيانات 🚨
            // نستخدم findById لضمان جلب القيمة المحدثة (1 أو 2 أو 3) لكل فريق
            const freshTeam = await Team.findById(team._id).select('penaltyPoints');
            const totalPenalties = freshTeam.penaltyPoints || 0;

            const finalPoints = (fixturePoints + bonusPoints) - totalPenalties;

            bulkOps.push({
                updateOne: {
                    filter: { _id: team._id },
                    update: { 
                        $set: { 
                            "stats.points": Math.max(0, finalPoints),
                            "stats.totalFplPoints": totalFpl,
                            "stats.bonusPoints": bonusPoints,
                            "penaltyPoints": totalPenalties // للتأكيد
                        } 
                    }
                }
            });
        }

        // تنفيذ التحديث الجماعي
        if (bulkOps.length > 0) await Team.bulkWrite(bulkOps);

        // إعادة ترتيب المراكز بناءً على النقاط الجديدة
        const sorted = await Team.find({ leagueId, isApproved: true }).sort({ "stats.points": -1, "stats.totalFplPoints": -1 });
        const positionOps = sorted.map((t, i) => ({
            updateOne: { filter: { _id: t._id }, update: { $set: { "stats.position": i + 1 } } }
        }));
        
        if (positionOps.length > 0) await Team.bulkWrite(positionOps);

        console.log("✅ تم تحديث الترتيب لجميع الفرق وخصم النقاط بنجاح.");
    } catch (error) {
        console.error("❌ خطأ التحديث:", error.message);
    }
};

/*const updateLeagueStandingsInternal = async (leagueId) => {
    try {
        const league = await League.findById(leagueId);
        const teams = await Team.find({ leagueId, isApproved: true });

        // --- 1. تصحيح منطق البونيس (إعادة الحساب من الصفر في كل دورة) ---
        // أولاً: تصفير نقاط البونيس الحالية للفرق لإعادة حسابها بناءً على النتائج الأحدث
        await Team.updateMany({ leagueId }, { $set: { "stats.bonusPoints": 0 } });

        const finishedFixtures = await Fixture.find({ leagueId, isFinished: true });
        const allGws = [...new Set(finishedFixtures.map(f => f.gameweek))].sort((a, b) => a - b);

        for (const gwNumber of allGws) {
            const gwFixtures = finishedFixtures.filter(f => f.gameweek === gwNumber);
            let scoresInRound = [];
            
            gwFixtures.forEach(f => {
                scoresInRound.push({ teamId: f.homeTeamId, score: f.homeScore });
                scoresInRound.push({ teamId: f.awayTeamId, score: f.awayScore });
            });

            if (scoresInRound.length > 0) {
                const maxScore = Math.max(...scoresInRound.map(s => s.score));
                // 🛑 تعديل هام: إذا كان أعلى سكور هو 0، لا نمنح بونيس (تجنب بونيس البداية 0-0)
                if (maxScore > 0) {
                    const winners = scoresInRound.filter(s => s.score === maxScore);
                    for (let winner of winners) {
                        await Team.findByIdAndUpdate(winner.teamId, { $inc: { 'stats.bonusPoints': 1 } });
                    }
                }
            }
        }

        // --- 2. تحديث الترتيب العام مع الخصم الصارم للعقوبات ---
        const bulkOps = [];
        // نجلب الفرق مرة أخرى لقراءة البونيس الجديد
        const updatedTeams = await Team.find({ leagueId, isApproved: true });

        for (const team of updatedTeams) {
            const matches = await Fixture.find({
                leagueId, isFinished: true,
                $or: [{ homeTeamId: team._id }, { awayTeamId: team._id }]
            });

            let fixturePoints = 0, totalFpl = 0;
            matches.forEach(m => {
                const isHome = m.homeTeamId.toString() === team._id.toString();
                const myScore = isHome ? m.homeScore : m.awayScore;
                const oppScore = isHome ? m.awayScore : m.homeScore;
                totalFpl += (myScore || 0);
                if (myScore > oppScore) fixturePoints += 3;
                else if (myScore === oppScore) fixturePoints += 1;
            });

            // حساب الخصم بناءً على missedDeadlines (الذي قيمته 2 في قاعدتك)
            const bonus = team.stats?.bonusPoints || 0;
            const missed = team.missedDeadlines || 0;
            
            let currentPenalty = 0;
            if (missed === 2) currentPenalty = 1;
            else if (missed === 3) currentPenalty = 2;
            else if (missed >= 4) currentPenalty = 3;

            const finalLeaguePoints = (fixturePoints + bonus) - currentPenalty;

            bulkOps.push({
                updateOne: {
                    filter: { _id: team._id },
                    update: { 
                        $set: { 
                            "stats.points": Math.max(0, finalLeaguePoints), 
                            "stats.totalFplPoints": totalFpl,
                            "penaltyPoints": currentPenalty 
                        } 
                    }
                }
            });
        }

        if (bulkOps.length > 0) await Team.bulkWrite(bulkOps);

        // --- 3. الفرز النهائي للمراكز ---
        const sorted = await Team.find({ leagueId, isApproved: true }).sort({ "stats.points": -1, "stats.totalFplPoints": -1 });
        const positionOps = sorted.map((team, index) => ({
            updateOne: {
                filter: { _id: team._id },
                update: { $set: { "stats.position": index + 1 } }
            }
        }));

        if (positionOps.length > 0) await Team.bulkWrite(positionOps);
        
        console.log("✅ تمت إعادة الحساب: تم تصحيح البونيس وتطبيق خصم النقطة.");
    } catch (error) {
        console.error("❌ خطأ في التحديث الشامل:", error.message);
    }
};*/

/*const updateLeagueStandingsInternal = async (leagueId) => {
    const league = await League.findById(leagueId);
    const teams = await Team.find({ leagueId, isApproved: true });

    // --- الجزء الأول: حساب البونيس للجولات السابقة (المستوردة) دفعة واحدة ---
    const finishedFixtures = await Fixture.find({ leagueId, isFinished: true });
    const allFinishedGws = [...new Set(finishedFixtures.map(f => f.gameweek))].sort((a, b) => a - b);

    for (const gwNumber of allFinishedGws) {
        // التحقق مما إذا كانت هذه الجولة قد حصلت على البونيس مسبقاً
        if (!league.bonusProcessedGws || !league.bonusProcessedGws.includes(gwNumber)) {
            const gwFixtures = finishedFixtures.filter(f => f.gameweek === gwNumber);
            let scoresInRound = [];
            
            gwFixtures.forEach(f => {
                scoresInRound.push({ teamId: f.homeTeamId, score: f.homeScore });
                scoresInRound.push({ teamId: f.awayTeamId, score: f.awayScore });
            });

            if (scoresInRound.length > 0) {
                const maxScore = Math.max(...scoresInRound.map(s => s.score));
                const winners = scoresInRound.filter(s => s.score === maxScore);

                // منح النقطة الذهبية للفرق الفائزة بالجولة تاريخياً
                for (let winner of winners) {
                    await Team.findByIdAndUpdate(winner.teamId, { $inc: { 'stats.bonusPoints': 1 } });
                }

                // تسجيل الجولة كـ "معالجة" لمنع التكرار
                await League.findByIdAndUpdate(leagueId, { $addToSet: { bonusProcessedGws: gwNumber } });
                console.log(`✅ تم منح بونيس الجولة المستوردة ${gwNumber} آلياً بناءً على الأهداف.`);
            }
        }
    }

    // --- الجزء الثاني: حساب النقاط التراكمية وتحديث جدول الترتيب ---
    const updatedTeams = await Team.find({ leagueId, isApproved: true });
    for (const team of updatedTeams) {
        const matches = await Fixture.find({
            leagueId, isFinished: true,
            $or: [{ homeTeamId: team._id }, { awayTeamId: team._id }]
        });

        let fixturePoints = 0, won = 0, drawn = 0, lost = 0, played = 0, totalFpl = 0;

        matches.forEach(m => {
            played++;
            const isHome = m.homeTeamId.toString() === team._id.toString();
            const myScore = isHome ? m.homeScore : m.awayScore;
            const oppScore = isHome ? m.awayScore : m.homeScore;
            totalFpl += myScore;
            if (myScore > oppScore) { fixturePoints += 3; won++; }
            else if (myScore === oppScore) { fixturePoints += 1; drawn++; }
            else { lost++; }
        });

        const bonus = team.stats.bonusPoints || 0;
        const penalties = team.penaltyPoints || 0;
        const finalLeaguePoints = fixturePoints + bonus - penalties;

        await Team.findByIdAndUpdate(team._id, {
            $set: {
                'stats.points': Math.max(0, finalLeaguePoints),
                'stats.totalFplPoints': totalFpl,
                'stats.won': won, 'stats.drawn': drawn, 'stats.lost': lost, 'stats.played': played
            }
        });
    }
	

	const sortedTeams = await Team.find({ leagueId, isApproved: true });
	sortedTeams.sort((a, b) => (b.stats.points - a.stats.points) || (b.stats.totalFplPoints - a.stats.totalFplPoints));

	await Promise.all(sortedTeams.map((team, index) => 
		Team.findByIdAndUpdate(team._id, { 
			$set: { 'stats.position': index + 1 } // تحديث المركز اللحظي فقط
		})
	));

    /*const sortedTeams = await Team.find({ leagueId, isApproved: true });
    sortedTeams.sort((a, b) => (b.stats.points - a.stats.points) || (b.stats.totalFplPoints - a.stats.totalFplPoints));
    await Promise.all(sortedTeams.map((team, index) => 
        Team.findByIdAndUpdate(team._id, { $set: { 'stats.position': index + 1 } })
    ));
};*/

// 6. الحساب الكامل للجولة الجارية

const calculateScoresInternal = async (leagueId, manualGw = null) => {
    const now = new Date();
    const league = await League.findById(leagueId);
    if (!league) throw new Error("League not found");
    
    // --- [1] تحديد الجولة المستهدفة بناءً على الديدلاين ---
    let targetGw;
    if (manualGw) {
        targetGw = manualGw;
    } else {
        // البحث عن أحدث جولة انقضى ديدلاينها (هي الجولة الجارية حالياً)
        const currentGwRecord = await Gameweek.findOne({ deadline_time: { $lte: now } }).sort({ number: -1 });
        targetGw = currentGwRecord ? currentGwRecord.number : league.currentGw;
    }

    // تحديث رقم الجولة في الدوري ليطابق الواقع (يضمن تحديث الجداول والواجهات)
    if (targetGw !== league.currentGw) {
        await League.findByIdAndUpdate(leagueId, { currentGw: targetGw });
    }

    // تحديث حالة النظام إلى "قيد التشغيل"
    await League.findByIdAndUpdate(leagueId, { autoUpdateStatus: 'running' });

    const allTeams = await Team.find({ leagueId, isApproved: true });

    // 1. تجميع كل المعرفات الفريدة للمستخدمين المشاركين في هذه الجولة
    const allUserIds = new Set();
    // جلب كل البيانات المخزنة للجولة المستهدفة
    const allGwDataForTarget = await GameweekData.find({ leagueId, gameweek: targetGw });
    allGwDataForTarget.forEach(gd => {
        gd.lineup.forEach(s => {
            if (s.userId) allUserIds.add(s.userId.toString());
        });
    });

    // 2. جلب بيانات FPL لجميع المستخدمين دفعة واحدة (Map لسرعة الوصول)
    const users = await User.find({ _id: { $in: Array.from(allUserIds) } });
    const fplResults = await Promise.all(users.map(u =>
        getUserFPLPoints(u.fplId, targetGw)
            .then(d => ({ userId: u._id.toString(), data: d }))
            .catch(() => ({ userId: u._id.toString(), data: { gwPoints: 0, eventTransfersCost: 0 } }))
    ));
    const fplDataMap = new Map(fplResults.map(r => [r.userId, r.data]));

    // 3. معالجة كل فريق على حدة
    for (const team of allTeams) {
        if (team.isDisqualified) continue;

        let gwData = await GameweekData.findOne({ teamId: team._id, gameweek: targetGw });
        
        // --- [A] منطق النسيان والعقوبات (في حال لم يحفظ المناجير التشكيلة) ---
        if (!gwData) {
            const newMissed = (team.missedDeadlines || 0) + 1;
            let penaltyVal = 0;
            if (newMissed === 2) penaltyVal = 1;
            else if (newMissed === 3) penaltyVal = 2;
            else if (newMissed >= 4) penaltyVal = 3;

            await Team.findByIdAndUpdate(team._id, { 
                $set: { 
                    missedDeadlines: newMissed, 
                    penaltyPoints: penaltyVal, 
                    isDisqualified: newMissed >= 4 
                } 
            });

            const last = await GameweekData.findOne({ teamId: team._id, gameweek: { $lt: targetGw } }).sort({ gameweek: -1 });
            const currentMembersIds = team.members.map(id => id.toString());
            let inheritedLineup = [];

            /*if (last) {
                inheritedLineup = last.lineup
                    .filter(p => currentMembersIds.includes(p.userId.toString()))
                    .map(p => ({ ...p.toObject(), rawPoints: 0, finalScore: 0 }));

                if (inheritedLineup.length < currentMembersIds.length) {
                    const missingId = currentMembersIds.find(id => !inheritedLineup.find(p => p.userId.toString() === id));
                    if (missingId) inheritedLineup.push({ userId: missingId, isStarter: false, isCaptain: false });
                }
            } else {
                inheritedLineup = team.members.map(m => ({ userId: m, isStarter: false, isCaptain: false }));
            }

            gwData = await GameweekData.create({
                teamId: team._id,
                leagueId,
                gameweek: targetGw,
                isInherited: true,
                lineup: inheritedLineup,
                activeChip: 'none',
                stats: { totalPoints: 0, isProcessed: false }
            });
        }*/
		
		if (last) {
        // فلترة التشكيلة القديمة: نبقي فقط من لا يزال عضواً في الفريق
        finalLineup = last.lineup
            .filter(p => currentMembersIds.includes(p.userId.toString()))
            .map(p => ({ ...p.toObject(), rawPoints: 0, finalScore: 0 }));

        // إذا كان هناك لاعب جديد انضم ولم يوضع في التشكيلة بعد، نضيفه كبديل تلقائياً
        if (finalLineup.length < currentMembersIds.length) {
            const missingPlayerId = currentMembersIds.find(id => !finalLineup.find(p => p.userId.toString() === id));
            if (missingPlayerId) {
                finalLineup.push({ 
                    userId: missingPlayerId, 
                    isStarter: false, 
                    isCaptain: false, 
                    rawPoints: 0, 
                    finalScore: 0 
                });
            }
        }
    } else {
        // إذا لم توجد تشكيلة سابقة، نعتمد على الأعضاء الحاليين بالكامل
        finalLineup = team.members.map(m => ({ 
            userId: m, 
            isStarter: false, 
            isCaptain: false, 
            rawPoints: 0, 
            finalScore: 0 
        }));
    }

    gwData = await GameweekData.create({
        teamId: team._id,
        leagueId,
        gameweek: targetGw,
        isInherited: true,
        lineup: finalLineup,
        activeChip: 'none',
        stats: { totalPoints: 0, isProcessed: false }
    });
}

        // --- [B] حساب النقاط الصافية لكل لاعب ---
        let playersDetailed = gwData.lineup.map(slot => {
            if (!slot.userId) return null;
            const fpl = fplDataMap.get(slot.userId.toString()) || { gwPoints: 0, eventTransfersCost: 0 };
            return { 
                userId: slot.userId.toString(), 
                raw: fpl.gwPoints, 
                hits: fpl.eventTransfersCost, 
                net: fpl.gwPoints - fpl.eventTransfersCost 
            };
        }).filter(p => p !== null);

        // --- [C] تطبيق العقوبات التكتيكية (حل مشكلة تساوي الصافي) ---
if (gwData.isInherited && playersDetailed.length > 0) {
    const sortedByNet = [...playersDetailed].sort((a, b) => {
        // 1. المقارنة بالصافي أولاً (Net Points)
        if (b.net !== a.net) {
            return b.net - a.net;
        }
        // 2. ⭐ الحل: في حال تساوي الصافي (مثل 37 و 37) ⭐
        // اللاعب الذي لديه نقاط خام (raw) أعلى يُعتبر "أضعف" تكتيكياً لأنه تسبب في خصم (Hits)
        return a.raw - b.raw; 
    });

    const strongestId = sortedByNet[0].userId; // أول لاعب (الأقوى)
    const weakestId = sortedByNet[sortedByNet.length - 1].userId; // آخر لاعب (الأضعف)

    gwData.lineup.forEach(slot => {
        const sId = slot.userId.toString();
        slot.isCaptain = (sId === weakestId); 
        slot.isStarter = (sId !== strongestId); 
    });
} else {
            // خاصية theBest
            if (gwData.activeChip === 'theBest') {
                const starters = playersDetailed.filter(p => 
                    gwData.lineup.find(s => s.userId.toString() === p.userId && s.isStarter)
                );
                if (starters.length > 0) {
                    const best = starters.sort((a, b) => b.net - a.net)[0];
                    gwData.lineup.forEach(s => s.isCaptain = (s.userId.toString() === best.userId));
                }
            }
            // خاصية Free Hit (التبديل الآلي)
            if (gwData.activeChip === 'freeHit' && playersDetailed.length > 0) {
                const captainSlot = gwData.lineup.find(s => s.isCaptain);
                const captainId = captainSlot ? captainSlot.userId.toString() : null;
                const sortedPlayers = [...playersDetailed].sort((a, b) => b.net - a.net);
                const nonCaptainPlayers = sortedPlayers.filter(p => p.userId !== captainId);
                const candidateForBench = nonCaptainPlayers[nonCaptainPlayers.length - 1];

                gwData.lineup.forEach(slot => {
                    slot.isStarter = (slot.userId.toString() !== candidateForBench.userId);
                });
            }
        }

        // --- [D] الحساب النهائي وتسجيل النقاط ---
        let roundTotal = 0;
        const chip = gwData.activeChip;

        gwData.lineup.forEach((slot) => {
            const p = playersDetailed.find(pd => pd.userId === slot.userId.toString());
            if (p) {
                let multiplier = slot.isCaptain ? (chip === 'tripleCaptain' ? 3 : 2) : 1;
                const final = p.net * multiplier;
                slot.rawPoints = p.raw;
                slot.transferCost = p.hits;
                slot.finalScore = final;
                if (slot.isStarter || chip === 'benchBoost') roundTotal += final;
            }
        });

        gwData.stats.totalPoints = Math.max(0, roundTotal);
        gwData.stats.isProcessed = true;
        gwData.markModified('lineup');
        await gwData.save();
    }

    // 4. تحديث المواجهات والترتيب
    const fixtures = await Fixture.find({ leagueId, gameweek: targetGw });
    for (const fixture of fixtures) {
        const homeData = await GameweekData.findOne({ teamId: fixture.homeTeamId, gameweek: targetGw });
        const awayData = await GameweekData.findOne({ teamId: fixture.awayTeamId, gameweek: targetGw });
        if (homeData && awayData) {
            fixture.homeScore = homeData.stats.totalPoints;
            fixture.awayScore = awayData.stats.totalPoints;
            fixture.isFinished = true; // يتم التحديث باستمرار خلال الجولة
            await fixture.save();
        }
    }

    await updateLeagueStandingsInternal(leagueId);
    await League.findByIdAndUpdate(leagueId, { 
        $set: { autoUpdateStatus: 'success', lastAutoUpdate: new Date() } 
    });

    return { success: true, message: `✅ تم التحديث التلقائي للجولة ${targetGw}` };
};
/*const calculateScoresInternal = async (leagueId, manualGw = null) => {
    const league = await League.findById(leagueId);
    if (!league) throw new Error("League not found");
    await League.findByIdAndUpdate(leagueId, { autoUpdateStatus: 'running' });

    const targetGw = manualGw || league.currentGw; 
    const allTeams = await Team.find({ leagueId, isApproved: true });
    
    const allUserIds = new Set();
    const allGwDataForTarget = await GameweekData.find({ leagueId, gameweek: targetGw });
    allGwDataForTarget.forEach(gd => gd.lineup.forEach(s => s.userId && allUserIds.add(s.userId.toString())));

    const users = await User.find({ _id: { $in: Array.from(allUserIds) } });
    const fplResults = await Promise.all(users.map(u => 
        getUserFPLPoints(u.fplId, targetGw).then(d => ({ userId: u._id.toString(), data: d }))
        .catch(() => ({ userId: u._id.toString(), data: { gwPoints: 0, eventTransfersCost: 0 } }))
    ));
    const fplDataMap = new Map(fplResults.map(r => [r.userId, r.data]));

    for (const team of allTeams) {
        if (team.isDisqualified) continue;
        let gwData = await GameweekData.findOne({ teamId: team._id, gameweek: targetGw });
        let pointsDeduction = 0;

        if (!gwData) {
            const newMissed = (team.missedDeadlines || 0) + 1;
            if (newMissed === 2) pointsDeduction = 1;
            else if (newMissed === 3) pointsDeduction = 2;
            await Team.findByIdAndUpdate(team._id, { $set: { missedDeadlines: newMissed, isDisqualified: newMissed >= 4 } });

            const last = await GameweekData.findOne({ teamId: team._id, gameweek: { $lt: targetGw } }).sort({ gameweek: -1 });
            gwData = await GameweekData.create({
                teamId: team._id, 
				leagueId, 
				gameweek: targetGw, 
				isInherited: true,
                lineup: last ? last.lineup.map(p => ({...p.toObject(), rawPoints:0, finalScore:0})) : [], 
                activeChip: 'none', 
				stats: { totalPoints: 0, isProcessed: false }
            });
        }

        let roundTotal = 0;
        let playersDetailed = gwData.lineup.map(slot => {
            if (!slot.userId) return null;
            const fpl = fplDataMap.get(slot.userId.toString()) || { gwPoints: 0, eventTransfersCost: 0 };
            return { userId: slot.userId.toString(), raw: fpl.gwPoints, hits: fpl.eventTransfersCost, net: fpl.gwPoints - fpl.eventTransfersCost, slot };
        }).filter(p => p !== null);

        const chip = gwData.activeChip;
        if (!gwData.isInherited && chip === 'theBest') {
            const starters = playersDetailed.filter(p => p.slot.isStarter);
            if (starters.length > 0) {
                const best = starters.sort((a, b) => b.net - a.net)[0];
                gwData.lineup.forEach(s => s.isCaptain = (s.userId.toString() === best.userId));
            }
        }

        gwData.lineup.forEach((slot) => {
            const p = playersDetailed.find(pd => pd.userId === slot.userId.toString());
            if (p) {
                let mult = slot.isCaptain ? (chip === 'tripleCaptain' ? 3 : 2) : 1;
                const final = p.net * mult;
                slot.rawPoints = p.raw; slot.transferCost = p.hits; slot.finalScore = final;
                if (slot.isStarter || chip === 'benchBoost') roundTotal += final;
            }
        });

        gwData.stats.totalPoints = Math.max(0, roundTotal - pointsDeduction);
        gwData.stats.isProcessed = true;
        gwData.markModified('lineup');
        await gwData.save();
    }

    const fixtures = await Fixture.find({ leagueId, gameweek: targetGw });
    for (const fixture of fixtures) {
        const homeData = await GameweekData.findOne({ teamId: fixture.homeTeamId, gameweek: targetGw });
        const awayData = await GameweekData.findOne({ teamId: fixture.awayTeamId, gameweek: targetGw });
        if (homeData && awayData) {
            fixture.homeScore = homeData.stats.totalPoints;
            fixture.awayScore = awayData.stats.totalPoints;
            fixture.isFinished = true;
            await fixture.save();
        }
    }

    // تشغيل المحرك لتحديث البونيس التاريخي والترتيب آلياً
    await updateLeagueStandingsInternal(leagueId);

    await League.findByIdAndUpdate(leagueId, { $set: { autoUpdateStatus: 'success', lastAutoUpdate: new Date() } });
    return { success: true, message: `✅ اكتمل حساب الجولة ${targetGw}` };
};*/

// 7. الاستدعاء من الأدمن
const calculateScores = async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        const result = await calculateScoresInternal(req.body.leagueId, req.body.gw);
        res.json(result);
    } catch (error) { res.status(500).json({ message: error.message }); }
};

// 8. استيراد الإكسل
const importLineupsFromExcel = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "يرجى رفع ملف الإكسل" });
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        let successCount = 0; let errors = [];

        for (const row of data) {
            const gw = parseInt(row['Gameweek']);
            const teamName = row['Team']?.toString().trim();
            const chip = row['Chip']?.toString().trim() || 'none';
            if (!teamName || isNaN(gw)) continue;

            const team = await Team.findOne({ name: teamName }).populate('members');
            if (!team) { errors.push(`فريق ${teamName} غير موجود`); continue; }

            const excelPlayers = [
                { name: row['Captain']?.toString().trim(), isCaptain: true, isStarter: true },
                { name: row['P2']?.toString().trim(), isCaptain: false, isStarter: true },
                { name: row['P3']?.toString().trim(), isCaptain: false, isStarter: true },
                { name: row['Sub']?.toString().trim(), isCaptain: false, isStarter: false }
            ];

            const formattedLineup = [];
            excelPlayers.forEach(p => {
                if (p.name) {
                    const member = team.members.find(m => m.username.trim().toLowerCase() === p.name.toLowerCase());
                    if (member) {
                        formattedLineup.push({ userId: member._id, isStarter: p.isStarter, isCaptain: p.isCaptain, rawPoints: 0, finalScore: 0 });
                    }
                }
            });

            if (formattedLineup.length > 0) {
                await GameweekData.findOneAndUpdate(
                    { teamId: team._id, gameweek: gw },
                    { 
                        lineup: formattedLineup, 
                        activeChip: chip, 
                        leagueId: team.leagueId, 
                        isInherited: false, 
                        'stats.isProcessed': false 
                    },
                    { upsert: true }
                );
                successCount++;
            }
        }
        res.json({ message: `✅ تم استيراد ${successCount} تشكيلة`, errors: errors.length > 0 ? errors : null });
    } catch (err) { res.status(500).json({ message: err.message }); }
};

// تصفير الدوري
const resetLeagueStandings = async (req, res) => {
    /*try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        const { leagueId } = req.body;
        await Team.updateMany({ leagueId }, { 
            $set: { 
                'stats.points': 0, 'stats.totalFplPoints': 0, 'stats.won': 0, 'stats.bonusPoints': 0,
                'stats.played': 0, 'stats.position': 0, 'penaltyPoints': 0, 'missedDeadlines': 0 
            } 
        });*/
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ message: 'للأدمن فقط' });
        const { leagueId } = req.body;
        await Team.updateMany({ leagueId }, { 
            $set: { 
                'stats.points': 0, 'stats.totalFplPoints': 0, 'stats.won': 0, 'stats.bonusPoints': 0,
                'stats.played': 0, 'stats.position': 0, 
                'stats.lastGwPosition': 0, // ✅ تصفير حقل المقارنة
                'penaltyPoints': 0, 'missedDeadlines': 0 
            } 
        });
        await Fixture.updateMany({ leagueId }, { $set: { isFinished: false, homeScore: 0, awayScore: 0, winnerId: null } });
        await GameweekData.updateMany({ leagueId }, { $set: { 'stats.totalPoints': 0, 'stats.isProcessed': false } });
        // تصفير سجل البونيس أيضاً
        await League.findByIdAndUpdate(leagueId, { $set: { bonusProcessedGws: [] } });
        res.json({ message: "🔄 تم تصفير الدوري وسجل البونيس بنجاح" });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

/*const startNewGameweek = async (req, res) => {
    try {
        const { leagueId } = req.body;
        const league = await League.findById(leagueId);
        league.currentGw += 1;
        await league.save();
        res.json({ message: `✅ بدأت الجولة ${league.currentGw}` });
    } catch (error) { res.status(500).json({ message: error.message }); }
};*/

const startNewGameweek = async (req, res) => {
    try {
        const { leagueId } = req.body;
        const league = await League.findById(leagueId);
        
        // 1. جلب جميع الفرق في هذا الدوري
        const teams = await Team.find({ leagueId });

        // 2. تثبيت المركز الحالي كـ "مركز الجولة الماضية" قبل الانتقال للجولة الجديدة
        const updatePositions = teams.map(team => {
            return Team.findByIdAndUpdate(team._id, {
                $set: { 'stats.lastGwPosition': team.stats.position }
            });
        });
        
        await Promise.all(updatePositions);

        // 3. زيادة رقم الجولة
        league.currentGw += 1;
        await league.save();

        res.json({ 
            message: `✅ تم تثبيت مراكز الجولة ${league.currentGw - 1} وبدأت الجولة ${league.currentGw}` 
        });
    } catch (error) { 
        res.status(500).json({ message: error.message }); 
    }
};

module.exports = { 
    setLineup, calculateScores, calculateScoresInternal, getGwStatus, 
    getTeamGwData, syncGameweeks, startNewGameweek, resetLeagueStandings,
    updateLeagueStandingsInternal, importLineupsFromExcel 
};