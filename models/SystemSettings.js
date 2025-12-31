// server/models/SystemSettings.js
const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
    seasonName: { type: String, default: '2024-2025' },
    activeTeams: [{
        id: Number,
        code: Number, // ✅ تأكد من وجود هذا الحقل لاستقبال كود الفريق
        name: String,
        short_name: String,
        // ...
    }]
});

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);