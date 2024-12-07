const User = require("../models/userModel"); 
const { getTransactionData } = require("./manualDeposit");
const Transaction = require("../models/transactionModel"); 
const path = require('path');

const getValidInput = async (bot, chatId, prompt, validator) => {
    while (true) {
        try {
            await bot.sendMessage(chatId, prompt);
            const response = await new Promise((resolve, reject) => {
                const messageHandler = (msg) => {
                    if (msg.chat.id === chatId) {
                        bot.removeListener('message', messageHandler);
                        resolve(msg);
                    }
                };
                bot.on('message', messageHandler);
                setTimeout(() => {
                    bot.removeListener('message', messageHandler);
                    reject(new Error('Response timeout'));
                }, 60000);
            });

            if (validator(response.text)) {
                return response.text;
            } else {
                await bot.sendMessage(chatId, "Invalid input. Please try again.");
            }
        } catch (error) {
            console.error('Error getting input:', error);
            await bot.sendMessage(chatId, "Something went wrong. Please try again.");
        }
    }
}; 
 
const transactionHandlers = {
    deposit: async (chatId, bot) => {
        try {
            const imagePath = path.join(__dirname, 'cbe.jpg');
            await bot.sendPhoto(chatId, imagePath, {
                caption: "Send Any amount to the following number to deposit \n**1000426981517** YEABSERA MELAKU \n\n⚠️⚠️⚠️ please CBE to CBE only. dont send from other bank or your money may be lost"
            });
            await bot.sendMessage(chatId, "Enter your transaction ID after depositing: "); 
            bot.once('message', async (msg) => {
                const transactionId = msg.text;
                try {
                    await bot.sendMessage(chatId, "Please wait while we verify your transaction...");
                    
                    await getTransactionData(transactionId, chatId, bot);
                    // Success message is handled in getTransactionData
                } catch (error) {
                    console.error("Error handling verification:", error);
                    await bot.sendMessage(chatId, `${error.message}\n\nUse /start to try again.`);
                }
            });
        } catch (error) {
            console.error("Error initiating deposit:", error);
            await bot.sendMessage(chatId, "An unexpected error occurred. Please try again later.");
        }
    },

    withdraw: async (chatId, bot) => {
        try {
            const user = await User.findOne({ chatId });
            if (!user) {
                await bot.sendMessage(chatId, "Please register first to withdraw funds.");
                return;
            }

            const amount = await getValidInput(
                bot,
                chatId,
                "Enter amount to withdraw (25 ETB - 1000 ETB):",
                (text) => {
                    const num = parseFloat(text);
                    return !isNaN(num) && num >= 25 && num <= 1000;
                }
            );

            // Check if user has sufficient balance
            if (user.balance < parseFloat(amount)) {
                await bot.sendMessage(chatId, "Insufficient balance for this withdrawal.");
                return;
            }

            // Ask for bank type using buttons
            const bankType = await new Promise((resolve, reject) => {
                bot.sendMessage(chatId, "Select bank type:", {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'CBE', callback_data: 'cbe' }],
                            [{ text: 'CBE Birr Wallet', callback_data: 'cbe_birr_wallet' }]
                        ]
                    }
                });

                const callbackQueryHandler = (callbackQuery) => {
                    if (callbackQuery.message.chat.id === chatId) {
                        bot.removeListener('callback_query', callbackQueryHandler);
                        resolve(callbackQuery.data);
                    }
                };

                bot.on('callback_query', callbackQueryHandler);
            });

            const bankNumber = await getValidInput(
                bot,
                chatId,
                "Enter your bank/wallet number:",
                (text) => /^\d+$/.test(text) // Simple validation for numeric input
            );

            // Generate a unique transaction ID for the withdrawal
            const transactionId = `WD${Date.now()}${Math.random().toString(36).substr(2, 4)}`;

            // Create withdrawal transaction record
            await new Transaction({
                transactionId,
                chatId,
                amount: parseFloat(amount),
                status: 'pending_withdrawal',
                type: 'withdrawal',
                bankType: bankType.toLowerCase(),
                bankNumber
            }).save();

            // Deduct the amount from user's balance
            user.balance -= parseFloat(amount);
            await user.save();

            await bot.sendMessage(
                chatId,
                `Withdrawal request processed:\n\nAmount: ${amount} ETB\nBank Type: ${bankType}\nBank Number: ${bankNumber}\nTransaction ID: ${transactionId}\n\nYour withdrawal is being processed and will be sent to your bank account soon.`
            );

        } catch (error) {
            console.error("Error handling withdrawal:", error);
            await bot.sendMessage(chatId, "Error processing withdrawal. Please try again.");
        }
    },

    transfer: async (chatId, bot) => {
        try {
            const sender = await User.findOne({ chatId });
            if (!sender) {
                await bot.sendMessage(chatId, "Please register first to transfer funds.");
                return;
            }

            const amount = await getValidInput(
                bot,
                chatId,
                "Enter amount to transfer (10 ETB - 10000 ETB):",
                (text) => {
                    const num = parseFloat(text);
                    return !isNaN(num) && num >= 10 && num <= 10000;
                }
            );

            // Check if sender has sufficient balance
            if (sender.balance < parseFloat(amount)) {
                await bot.sendMessage(chatId, "Insufficient balance for this transfer.");
                return;
            }

            const recipientPhone = await getValidInput(
                bot,
                chatId,
                "Enter recipient's phone number (format: 09xxxxxxxx):",
                (text) => /^09\d{8}$/.test(text)
            );

            // Find recipient by phone number
            const recipient = await User.findOne({ phoneNumber: recipientPhone });
            if (!recipient) {
                await bot.sendMessage(chatId, "Recipient not found. Please check the phone number and try again.");
                return;
            }

            // Prevent self-transfer
            if (recipient.chatId === chatId) {
                await bot.sendMessage(chatId, "You cannot transfer to yourself.");
                return;
            }

            // Generate transaction ID
            const transactionId = `TR${Date.now()}${Math.random().toString(36).substr(2, 4)}`;

            // Create transfer transaction record
            await new Transaction({
                transactionId,
                chatId,
                recipientChatId: recipient.chatId,
                amount: parseFloat(amount),
                status: 'completed',
                type: 'transfer'
            }).save();

            // Update balances
            sender.balance -= parseFloat(amount);
            recipient.balance += parseFloat(amount);
            await sender.save();
            await recipient.save();

            // Notify both parties
            await bot.sendMessage(
                chatId,
                `Transfer successful!\nAmount: ${amount} ETB\nTo: ${recipientPhone}\nTransaction ID: ${transactionId}`
            );
            await bot.sendMessage(
                recipient.chatId,
                `You received ${amount} ETB from ${sender.phoneNumber}\nTransaction ID: ${transactionId}`
            );

        } catch (error) {
            console.error("Error handling transfer:", error);
            await bot.sendMessage(chatId, "Error processing transfer. Please try again. /transfer");
        }
    },

};

module.exports = transactionHandlers; 