const mongoose = require('mongoose');

const gameweekSchema = new mongoose.Schema({
    number: { type: Number, required: true, unique: true },
    deadline_time: { type: Date, required: true },
    status: { 
        type: String, 
        enum: ['past', 'current', 'next', 'future'], 
        default: 'future' 
    }
});

module.exports = mongoose.model('Gameweek', gameweekSchema);