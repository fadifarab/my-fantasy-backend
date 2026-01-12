const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  logoUrl: { type: String },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League' },
  isApproved: { type: Boolean, default: false }, 
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  pendingMembers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  hasUsedSubstitution: { type: Boolean, default: false },
  substitutionRequest: {
      memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      memberName: String,
      reason: String,
      createdAt: { type: Date }
  },

  // نظام العقوبات المتدرج
  missedDeadlines: { type: Number, default: 0 }, // عداد المرات
  penaltyPoints: { type: Number, default: 0 },  // إجمالي الخصم
  isDisqualified: { type: Boolean, default: false }, // حالة الإقصاء
  penaltyHistory: [{
      gameweek: Number,
      penaltyType: { type: String, enum: ['warning', 'minus_1', 'minus_2', 'disqualified'] },
      appliedAt: { type: Date, default: Date.now }
  }],

  chips: {
    theBest: { p1: { type: Boolean, default: false }, p2: { type: Boolean, default: false } },
    tripleCaptain: { p1: { type: Boolean, default: false }, p2: { type: Boolean, default: false } },
    benchBoost: { p1: { type: Boolean, default: false }, p2: { type: Boolean, default: false } },
    freeHit: { p1: { type: Boolean, default: false }, p2: { type: Boolean, default: false } }
  },

  stats: {
    points: { type: Number, default: 0 }, 
    played: { type: Number, default: 0 },
    won: { type: Number, default: 0 },
    drawn: { type: Number, default: 0 },
    lost: { type: Number, default: 0 },
    totalFplPoints: { type: Number, default: 0 }, 
    bonusPoints: { type: Number, default: 0 },
	position: { type: Number, default: 0 },      // المركز الحالي (اللحظي)
    lastGwPosition: { type: Number, default: 0 } // ✅ المركز النهائي في الجولة السابقة
  }
}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);