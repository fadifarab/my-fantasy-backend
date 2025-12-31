const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
         return res.status(401).json({ message: 'المستخدم غير موجود' });
      }

      next();
    } catch (error) {
      console.error("Auth Error:", error.message);
      res.status(401).json({ message: 'غير مصرح لك، التوكن غير صالح' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'غير مصرح لك، لا يوجد توكن' });
  }
};

// ✅ دالة جديدة: التحقق من صلاحيات المسؤول (Admin)
const admin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next(); // إذا كان آدمين، اسمح له بالمرور
    } else {
        res.status(401).json({ message: 'غير مصرح لك، هذه الخاصية للمسؤولين فقط' });
    }
};

// ✅ تأكد من تصدير الدالتين معاً
module.exports = { protect, admin };