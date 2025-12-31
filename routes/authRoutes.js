const express = require('express');
const router = express.Router();

// ✅ 1. استيراد admin مع protect
const { protect, admin } = require('../middleware/authMiddleware');

const { 
    registerUser, 
    loginUser, 
    getMe, 
    promoteToAdmin,
    forgotPassword,
    resetPassword,
    checkFplUser,
    getAllUsers, // ✅ استيراد دالة جلب اللاعبين
    deleteUser   // ✅ استيراد دالة الحذف
} = require('../controllers/authController');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);
router.put('/promote', protect, promoteToAdmin);

// رابط التحقق من FPL ID
router.post('/check-fpl', checkFplUser);

// ✅ 2. روابط إدارة المسؤولين (Admin Zone)
// جلب قائمة اللاعبين (يتطلب تسجيل دخول + رتبة مسؤول)
router.get('/', protect, admin, getAllUsers);

// طرد لاعب معين (يتطلب تسجيل دخول + رتبة مسؤول)
router.delete('/:id', protect, admin, deleteUser);

// روابط استعادة كلمة المرور
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:resetToken', resetPassword);

module.exports = router;