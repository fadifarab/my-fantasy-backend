const mongoose = require('mongoose');
const dotenv = require('dotenv');
const SystemSettings = require('./models/SystemSettings');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const teams2026 = [
  { name: 'Arsenal', logo: 'https://resources.premierleague.com/premierleague/badges/t3.svg' },
  { name: 'Aston Villa', logo: 'https://resources.premierleague.com/premierleague/badges/t7.svg' },
  { name: 'Bournemouth', logo: 'https://resources.premierleague.com/premierleague/badges/t91.svg' },
  { name: 'Brentford', logo: 'https://resources.premierleague.com/premierleague/badges/t94.svg' },
  { name: 'Brighton', logo: 'https://resources.premierleague.com/premierleague/badges/t36.svg' },
  { name: 'Burnley', logo: 'https://resources.premierleague.com/premierleague/badges/t90.svg' }, // صاعد
  { name: 'Chelsea', logo: 'https://resources.premierleague.com/premierleague/badges/t8.svg' },
  { name: 'Crystal Palace', logo: 'https://resources.premierleague.com/premierleague/badges/t31.svg' },
  { name: 'Everton', logo: 'https://resources.premierleague.com/premierleague/badges/t11.svg' },
  { name: 'Fulham', logo: 'https://resources.premierleague.com/premierleague/badges/t54.svg' },
  { name: 'Leeds United', logo: 'https://resources.premierleague.com/premierleague/badges/t2.svg' }, // صاعد
  { name: 'Liverpool', logo: 'https://resources.premierleague.com/premierleague/badges/t14.svg' },
  { name: 'Man City', logo: 'https://resources.premierleague.com/premierleague/badges/t43.svg' },
  { name: 'Man Utd', logo: 'https://resources.premierleague.com/premierleague/badges/t1.svg' },
  { name: 'Newcastle', logo: 'https://resources.premierleague.com/premierleague/badges/t4.svg' },
  { name: 'Nott\'m Forest', logo: 'https://resources.premierleague.com/premierleague/badges/t17.svg' },
  { name: 'Sunderland', logo: 'https://resources.premierleague.com/premierleague/badges/t56.svg' }, // صاعد
  { name: 'Tottenham', logo: 'https://resources.premierleague.com/premierleague/badges/t6.svg' },
  { name: 'West Ham', logo: 'https://resources.premierleague.com/premierleague/badges/t21.svg' },
  { name: 'Wolves', logo: 'https://resources.premierleague.com/premierleague/badges/t39.svg' }
];

const importData = async () => {
  try {
    // مسح الإعدادات القديمة إن وجدت
    await SystemSettings.deleteMany();

    // إضافة القائمة الجديدة
    await SystemSettings.create({
      seasonName: '2025-2026',
      activeTeams: teams2026
    });

    console.log('✅ Teams Imported Successfully for Season 2025-2026!');
    process.exit();
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
};

importData();