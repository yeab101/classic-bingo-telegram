require("dotenv").config();
const request = require('request');
const crypto = require('crypto');

function initializeTransaction(amount, first_name, phone_number, chatId, bot) {
    // Generate a random 10-digit hexadecimal transaction reference
    const tx_ref = crypto.randomBytes(5).toString('hex');

    var options = {
        'method': 'POST',
        'url': 'https://api.chapa.co/v1/transaction/initialize',
        'headers': {
            'Authorization': `Bearer ${process.env.CHAPASECRET}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            "amount": amount,
            "currency": "ETB",
            "email": "abebech_bekele@gmail.com",
            "first_name": first_name,
            "last_name": "Classic Bingo",
            "phone_number": phone_number,
            "tx_ref": tx_ref,
            "callback_url": "https://webhook.site/077164d6-29cb-40df-ba29-8a00e59a7e60",
            "return_url": "https://www.google.com/",
            "customization[title]": "Payment for my favourite merchant",
            "customization[description]": "I love online payments",
            "meta[hide_receipt]": "true"
        })
    };

    request(options, function (error, response) {
        if (error) {
            console.error("Error initializing transaction:", error);
            bot.sendMessage(chatId, "There was an error processing your transaction. Please try again.");
            return;
        }

        try {
            const responseBody = JSON.parse(response.body);
            if (responseBody.status === "success" && responseBody.data && responseBody.data.checkout_url) {
                const checkoutUrl = responseBody.data.checkout_url;
                bot.sendMessage(chatId, "Complete your payment by clicking the button below.", {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "Pay Now", url: checkoutUrl }]
                        ]
                    }
                });
            } else {
                bot.sendMessage(chatId, "There was an error with the transaction. Please try again.");
            }
        } catch (parseError) {
            console.error("Error parsing response:", parseError);
            bot.sendMessage(chatId, "There was an error processing your transaction. Please try again.");
        }
    });
}

module.exports = initializeTransaction;
