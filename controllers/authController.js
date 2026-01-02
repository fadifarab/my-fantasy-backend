const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const axios = require('axios');
// ⚠️ إذا استمر الخطأ 500، جرب تعطيل السطر التالي مؤقتاً بوضع // قبله
const sendEmail = require('../utils/sendEmail'); 

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// ✅ دالة نسيت كلمة المرور الكاملة
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        console.log("📨 استلام طلب استعادة للإيميل:", email);

        const user = await User.findOne({ email });
        if (!user) {
            console.log("❌ المستخدم غير موجود");
            return res.status(404).json({ message: "هذا البريد الإلكتروني غير مسجل لدينا" });
        }

        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

        await user.save({ validateBeforeSave: false });
        console.log("💾 تم حفظ التوكن في القاعدة");

        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
        
        const htmlMessage = `
            <h1>إعادة تعيين كلمة المرور</h1>
            <p>يرجى الضغط على الرابط التالي:</p>
            <a href="${resetUrl}">${resetUrl}</a>
        `;

        try {
            // محاولة الإرسال
            await sendEmail({
                email: user.email,
                subject: 'إعادة تعيين كلمة المرور - دوري زيدين',
                message: htmlMessage,
            });
            console.log("📧 تم إرسال الإيميل بنجاح");
            return res.status(200).json({ data: 'تم إرسال رابط الاستعادة إلى بريدك الإلكتروني بنجاح' });
        } catch (err) {
            console.error("❌ خطأ في دالة sendEmail:", err.message);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save({ validateBeforeSave: false });
            return res.status(500).json({ message: 'فشل في إرسال البريد الإلكتروني. تأكد من إعدادات SMTP' });
        }
    } catch (error) {
        console.error("❌ خطأ داخلي في forgotPassword:", error.message);
        return res.status(500).json({ message: error.message });
    }
};

const resetPassword = async (req, res) => {
    try {
        const resetPasswordToken = crypto.createHash('sha256').update(req.params.resetToken).digest('hex');
        const user = await User.findOne({ resetPasswordToken, resetPasswordExpire: { $gt: Date.now() } });
        if (!user) return res.status(400).json({ message: 'الرابط غير صحيح أو منتهي' });

        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();
        res.status(200).json({ message: 'تم تغيير كلمة المرور بنجاح', token: generateToken(user._id) });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const checkFplUser = async (req, res) => {
    try {
        const { fplId } = req.body;
        const response = await axios.get(`https://fantasy.premierleague.com/api/entry/${fplId}/`);
        res.json({ valid: true, player_name: `${response.data.player_first_name} ${response.data.player_last_name}`, team_name: response.data.name });
    } catch (error) { res.status(404).json({ message: 'FPL ID غير موجود' }); }
};

const registerUser = async (req, res) => {
    try {
        const { username, email, password, fplId, role, adminCode } = req.body;
        const userExists = await User.findOne({ $or: [{ email }, { username }] });
        if (userExists) return res.status(400).json({ message: 'المستخدم موجود' });
        const user = await User.create({ username, email, password, fplId, role: role || 'player' });
        res.status(201).json({ _id: user._id, username: user.username, token: generateToken(user._id) });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (user && (await user.matchPassword(password))) {
            res.json({ _id: user._id, username: user.username, role: user.role, leagueId: user.leagueId, teamId: user.teamId, token: generateToken(user._id) });
        } else { res.status(401).json({ message: 'بيانات غير صحيحة' }); }
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const getMe = async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
};

const getAllUsers = async (req, res) => {
    const users = await User.find({}).select('-password');
    res.json(users);
};

const deleteUser = async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم الحذف' });
};

const promoteToAdmin = async (req, res) => {
    const user = await User.findByIdAndUpdate(req.user.id, { role: 'admin' }, { new: true });
    res.json(user);
};

module.exports = { 
    registerUser, loginUser, getMe, promoteToAdmin, 
    forgotPassword, resetPassword, checkFplUser, getAllUsers, deleteUser 
};