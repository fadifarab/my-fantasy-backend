// server/controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sendEmail = require('../utils/sendEmail');
const axios = require('axios'); 

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// التحقق من FPL ID
const checkFplUser = async (req, res) => {
    const { fplId } = req.body;

    if (!fplId) {
        return res.status(400).json({ message: 'الرجاء إدخال FPL ID' });
    }

    try {
        const response = await axios.get(`https://fantasy.premierleague.com/api/entry/${fplId}/`);
        const fullName = `${response.data.player_first_name} ${response.data.player_last_name}`;
        
        res.json({ 
            valid: true, 
            player_name: fullName,
            team_name: response.data.name 
        });

    } catch (error) {
        console.error("FPL Check Error:", error.message);
        res.status(404).json({ message: 'رقم FPL ID غير صحيح أو غير موجود' });
    }
};

// تسجيل مستخدم جديد
const registerUser = async (req, res) => {
    try {
        const { username, email, password, fplId, role, adminCode } = req.body;

        if (!username || !email || !password || !fplId) {
            return res.status(400).json({ message: 'الرجاء إدخال جميع البيانات والتحقق من FPL ID' });
        }

        const userExists = await User.findOne({ $or: [{ email }, { username }] });
        if (userExists) return res.status(400).json({ message: 'المستخدم موجود بالفعل' });

        if (role === 'admin' && adminCode !== process.env.ADMIN_CODE) {
            return res.status(401).json({ message: 'كود مسؤول البطولة غير صحيح' });
        }

        const user = await User.create({
            username, 
            email,
            password,
            fplId,
            role: role || 'player'
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                token: generateToken(user._id),
            });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: error.message });
    }
};

// تسجيل الدخول
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body; 
        const user = await User.findOne({ email });

        if (user && (await user.matchPassword(password))) {
            res.json({
                _id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                leagueId: user.leagueId,
                teamId: user.teamId,
                token: generateToken(user._id),
            });
        } else {
            res.status(401).json({ message: 'البيانات غير صحيحة' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getMe = async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
};

const promoteToAdmin = async (req, res) => {
    const user = await User.findByIdAndUpdate(req.user.id, { role: 'admin' }, { new: true });
    res.json(user);
};

// ✅ 1. دالة جديدة: جلب جميع المستخدمين (للوحة تحكم الأدمن)
const getAllUsers = async (req, res) => {
    try {
        // جلب الكل ما عدا كلمات المرور
        const users = await User.find({}).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ✅ 2. دالة جديدة: طرد (حذف) لاعب
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (user) {
            // حماية: منع الأدمن من طرد نفسه
            if (user._id.toString() === req.user._id.toString()) {
                return res.status(400).json({ message: 'لا يمكنك طرد نفسك!' });
            }

            // الحذف النهائي من قاعدة البيانات
            await User.deleteOne({ _id: user._id });
            res.json({ message: 'تم طرد اللاعب بنجاح' });
        } else {
            res.status(404).json({ message: 'اللاعب غير موجود' });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const forgotPassword = async (req, res) => { /* ... */ };
const resetPassword = async (req, res) => { /* ... */ };

// ✅ تم إضافة الدوال الجديدة للتصدير
module.exports = { 
    registerUser, 
    loginUser, 
    getMe, 
    promoteToAdmin, 
    forgotPassword, 
    resetPassword, 
    checkFplUser,
    getAllUsers, // 👈
    deleteUser   // 👈
};