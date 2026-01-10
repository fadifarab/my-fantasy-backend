// server/models/GameweekData.js
const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isStarter: {
    type: Boolean,
    default: true
  },
  isCaptain: {
    type: Boolean,
    default: false
  },
  // 🛑 هذه هي الحقول التي كانت ناقصة وتسبب المشكلة
  rawPoints: { type: Number, default: 0 },    // النقاط الخام من FPL
  transferCost: { type: Number, default: 0 }, // تكلفة الانتقالات (Hits)
  finalScore: { type: Number, default: 0 }    // النقاط النهائية بعد الخصم والحساب
}, { _id: false }); // _id: false لأننا لا نحتاج ID لكل لاعب داخل المصفوفة

const gameweekDataSchema = new mongoose.Schema({
  leagueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'League',
    required: true
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true
  },
  gameweek: {
    type: Number,
    required: true
  },
  lineup: [playerSchema], // استخدام السكيما الفرعية
  
  isInherited: { 
    type: Boolean, 
    default: false 
  },
  activeChip: {
    type: String,
    enum: ['none', 'tripleCaptain', 'benchBoost', 'freeHit', 'theBest'], // أضفنا theBest
    default: 'none'
  },
  stats: {
    totalPoints: { type: Number, default: 0 },
    isProcessed: { type: Boolean, default: false } // هل تم احتساب النقاط؟
  }
}, {
  timestamps: true
});

// منع تكرار البيانات لنفس الفريق في نفس الجولة
gameweekDataSchema.index({ teamId: 1, gameweek: 1 }, { unique: true });

module.exports = mongoose.model('GameweekData', gameweekDataSchema);