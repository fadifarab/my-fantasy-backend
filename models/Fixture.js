// models/Fixture.js
const mongoose = require('mongoose');

const fixtureSchema = new mongoose.Schema({
  leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', required: true },
  gameweek: { type: Number, required: true }, // رقم الجولة
  
  // الفريقان المتواجهان
  homeTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  awayTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },

  // النتائج (تعبأ بعد انتهاء الجولة)
  homeScore: { type: Number, default: 0 }, // مجموع نقاط فريق المضيف
  awayScore: { type: Number, default: 0 }, // مجموع نقاط فريق الضيف
  
  winnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null }, // الفائز (null في حالة التعادل)
  isFinished: { type: Boolean, default: false }

}, { timestamps: true });

// فهرس لضمان عدم تكرار المباراة
fixtureSchema.index({ leagueId: 1, gameweek: 1, homeTeamId: 1, awayTeamId: 1 });

module.exports = mongoose.model('Fixture', fixtureSchema);