const multer = require('multer');
const path = require('path');

// 1. إعداد مساحة التخزين (استخدام الذاكرة Buffer هو الأفضل لملفات الإكسل لتجنب تراكم الملفات)
const storage = multer.memoryStorage(); 

// 2. التحقق من نوع الملف (السماح بالصور وملفات الإكسل)
function checkFileType(file, cb) {
    // الامتدادات المسموحة: صور + إكسل
    const filetypes = /jpg|jpeg|png|xlsx|xls|csv/;
    
    // التحقق من الامتداد
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    // التحقق من نوع الـ MIME
    // ملاحظة: أنواع MIME للإكسل تختلف أحياناً لذا نركز على الامتداد ونوع التطبيق
    const mimetype = filetypes.test(file.mimetype) || 
                     file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                     file.mimetype === 'application/vnd.ms-excel';

    if (extname) {
        return cb(null, true);
    } else {
        // رسالة خطأ واضحة تظهر في الكونصول
        cb(new Error('Error: Images and Excel Files (.xlsx, .xls) Only!'));
    }
}

// 3. إعداد الميدل وير النهائي
const upload = multer({
    storage: storage,
    limits: { fileSize: 5000000 }, // حد أقصى 5 ميجابايت
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

module.exports = upload;