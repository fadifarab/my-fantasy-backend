const mongoose = require('mongoose');

const leagueSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true }, 
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  currentGw: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
  logoUrl: { type: String, default: '' },

  // 🏆 حقل بطل الجولة الأخيرة (ممتاز كما أضفته)
  lastGwWinner: {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    teamName: { type: String },
    points: { type: Number },
    gameweek: { type: Number }
  },

  // ✅ الحقول الجديدة الضرورية للمزامنة التلقائية كل 5 دقائق
  lastAutoUpdate: { 
    type: Date, 
    default: null 
  },
  autoUpdateStatus: { 
    type: String, 
    enum: ['success', 'failed', 'running', 'idle'], 
    default: 'idle' 
  }
  
}, { timestamps: true });

module.exports = mongoose.model('League', leagueSchema);