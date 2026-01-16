const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');

// Routes
const authRoutes = require('./routes/authRoutes');
const leagueRoutes = require('./routes/leagueRoutes');
const teamRoutes = require('./routes/teamRoutes');
const gameweekRoutes = require('./routes/gameweekRoutes');
const fixtureRoutes = require('./routes/fixtureRoutes');
const startAutomatedUpdates = require('./utils/scheduler');

dotenv.config();
connectDB();

const app = express();

// ✅ تحديث إعدادات CORS لتكون أكثر دقة وقبولاً لـ Vercel
app.use(cors({
  origin: '*', // يسمح لجميع المصادر بالوصول (حل مثالي للمبتدئين لضمان العمل)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// ✅ إعدادات الصور (ممتازة كما فعلتها مع إضافة بسيطة)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: function (res, path, stat) {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
  }
}));

// Mounting Routes
app.use('/api/auth', authRoutes);
app.use('/api/leagues', leagueRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/gameweek', gameweekRoutes);
app.use('/api/fixtures', fixtureRoutes);

app.get('/', (req, res) => {
  res.send('API is running correctly...');
});

// مسار بسيط للتأكد من أن السيرفر يعمل (Ping)
app.get('/healthcheck', (req, res) => {
    res.status(200).send('Server is alive!');
});

const PORT = process.env.PORT || 10000; // Render يفضل 10000
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
 // ✅ تشغيل التحديث التلقائي كل 5 دقائق بمجرد تشغيل السيرفر
  startAutomatedUpdates();
});