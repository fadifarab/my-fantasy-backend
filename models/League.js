// server/models/League.js
const mongoose = require('mongoose');

const leagueSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true }, // كود انضمام البطولة
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  currentGw: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  
  // شعار البطولة
  logoUrl: { type: String, default: '' },

  // 🏆 الحقل الجديد لتتبع بطل الجولة الأخيرة ومكافأته
  lastGwWinner: {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    teamName: { type: String },
    points: { type: Number },
    gameweek: { type: Number }
  }
  
}, { timestamps: true });

module.exports = mongoose.model('League', leagueSchema);