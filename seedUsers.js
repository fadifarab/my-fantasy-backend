const mongoose = require('mongoose');
const dotenv = require('dotenv');
const xlsx = require('xlsx');
const User = require('./models/User'); // سنعتمد على المودل للتشفير

dotenv.config();

// 👇 تأكد أن هذا الآيدي هو الصحيح لبطولتك
const LEAGUE_ID = "694eea5f19accfb451f9af8a"; 

const importData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ تم الاتصال بقاعدة البيانات...');

    // قراءة الملف
    const workbook = xlsx.readFile('players.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    console.log(`📂 جاري إضافة ${data.length} لاعب...`);
    let count = 0;

    for (const player of data) {
      // 1. تنظيف البيانات (إزالة المسافات الزائدة)
      const cleanEmail = String(player.Email).trim().toLowerCase();
      const cleanPassword = String(player.Password).trim();
      const cleanName = String(player.Name).trim();

      // 2. التحقق من التكرار
      if (await User.findOne({ email: cleanEmail })) {
        console.log(`⚠️ موجود مسبقاً: ${cleanEmail}`);
        continue;
      }

      // 3. الإنشاء (نرسل كلمة المرور كما هي ليقوم المودل بتشفيرها)
      await User.create({
        username: cleanName,
        email: cleanEmail,
        password: cleanPassword, // 👈 السر هنا: بدون تشفير يدوي
        fplId: player.FplID,
        role: 'player',
        leagueId: LEAGUE_ID,
        teamId: null
      });

      console.log(`✅ تم إضافة: ${cleanName}`);
      count++;
    }

    console.log(`🎉 تمت العملية! أضيف ${count} لاعب بنجاح.`);
    process.exit();

  } catch (error) {
    console.error(`❌ خطأ: ${error.message}`);
    process.exit(1);
  }
};

importData();