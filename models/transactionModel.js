const mongoose = require('mongoose');

// Define the Transaction schema with timestamps
const transactionSchema = new mongoose.Schema({
    transactionId: { type: String, unique: true, required: true },
    chatId: { type: String, required: true },
    recipientChatId: { type: String  },
    amount: { type: Number, required: true },
    status: { 
        type: String, 
        enum: ['success', 'failed', 'pending_withdrawal', 'completed'],
        required: true 
    },
    type: {
        type: String,
        enum: ['deposit', 'withdrawal', 'transfer'],
        required: true
    },
    bankType: {
        type: String,
        enum: ['cbe', 'cbe_birr_wallet'],
        required: function() { return this.type === 'withdrawal'; }
    },
    bankNumber: { type: String }, // For withdrawals
    errorMessage: { 
        type: String,
        required: function() { return this.status === 'failed'; }
    }
}, { timestamps: true });  

// Create the Transaction model
const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;