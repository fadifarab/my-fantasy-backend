const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true }, // ✅ ضروري جداً
  password: { type: String, required: true },
  
  role: { 
    type: String, 
    enum: ['player', 'manager', 'admin'], 
    default: 'player' 
  },
  
  fplId: { type: Number, required: true },
  
  // علاقات الدوري والفريق
  leagueId: { type: mongoose.Schema.Types.ObjectId, ref: 'League', default: null },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  
  // ✅ حقول استعادة كلمة المرور
  resetPasswordToken: String,
  resetPasswordExpire: Date

}, { timestamps: true });

// التشفير قبل الحفظ
/*userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }*/
userSchema.pre('save', async function () {
  // إذا لم تتغير كلمة المرور، تخطى التشفير
  if (!this.isModified('password')) {
    return;
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// التحقق من كلمة المرور
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);