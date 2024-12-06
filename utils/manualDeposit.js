require("dotenv").config();
const https = require('https'); 
const User = require('../models/userModel'); // Adjust the path as necessary
const Transaction = require('../models/transactionModel'); // Adjust the path as necessary
// Constants from environment variables
const RECEIVER_LAST_EIGHT = process.env.RECEIVER_LAST_EIGHT;
const RECEIVER_LAST_FOUR = process.env.RECEIVER_LAST_FOUR;
const RECEIVER_NAME = process.env.RECEIVER_NAME;

// Replace the require statement with a dynamic import
const readPdfText = async (pdfData) => {
    const { readPdfText } = await import('pdf-text-reader');
    return readPdfText(pdfData);
};

// Main function to get transaction data
async function getTransactionData(transactionId, chatId, bot) {
    try {
        // Early validation of existing transaction
        const existingTransaction = await Transaction.findOne({ transactionId });
        if (existingTransaction) {
            throw new Error('Transaction ID has already been used');
        }

        // Validate and process transaction
        const transactionDetail = await processTransaction(transactionId);

        // Handle depositing
        await handleDepositing(chatId, transactionDetail);

        // Notify user of success
        await bot.sendMessage(chatId, "Transaction verified and deposit successful!");
    } catch (error) {
        console.error('Error processing transaction:', error);
        throw new Error(error.message || 'An unexpected error occurred during transaction processing.');
    }
}

async function processTransaction(transactionId) {
    // Trim transaction ID if necessary
    if (transactionId.startsWith('FT') && transactionId.length > 12) {
        transactionId = transactionId.slice(0, 12);
    }

    // Validate transaction ID
    validateTxnId(transactionId);

    // Construct URL and download PDF
    const id = `${transactionId}${RECEIVER_LAST_EIGHT}`;
    const url = `https://apps.cbe.com.et:100/?id=${id}`;
    const pdfData = await downloadPdf(url);

    // Convert PDF data to Uint8Array and extract text
    const pdfUint8Array = new Uint8Array(pdfData);
    const pdfText = await readPdfText({ data: pdfUint8Array });

    // Process and validate transaction details
    return processResultText(pdfText);
}

// Helper function to download PDF
async function downloadPdf(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { rejectUnauthorized: false }, (res) => {
            // Check for 404 or other error status codes
            if (res.statusCode !== 200) {
                reject(new Error('Invalid transaction ID'));
                return;
            }

            const data = [];
            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => {
                const buffer = Buffer.concat(data);
                // Check if the response is empty or too small to be a valid PDF
                if (buffer.length < 100) {
                    reject(new Error('Invalid transaction ID'));
                    return;
                }
                resolve(buffer);
            });
        }).on('error', () => reject(new Error('Invalid transaction ID')));
    });
}

// Validate transaction ID
function validateTxnId(txnId) {
    if (!txnId) throw new Error('Error: Transaction ID is required!');
    if (!txnId.startsWith('FT')) throw new Error('Error: Transaction ID must start with FT!');
    if (txnId.length !== 12) throw new Error('Error: Transaction ID must be exactly 12 characters!');
    if (!/^FT\w{10}$/.test(txnId)) throw new Error('Error: Invalid Transaction ID format!');
}

// Validate account number
function validateAccNo(accNo) {
    if (!accNo) throw new Error('Error: accNo is required!');
    if (!/^\d{8}$/.test(accNo)) throw new Error('Error: Invalid accNo!');
}

// Process text extracted from PDF
function processResultText(text) {
    const extractValue = (regex, txt) => {
        const match = regex.exec(txt);
        return match?.groups?.['value'];
    };

    // Extract transaction details using regex
    const amount = [
        extractValue(/ETB(?<value>[\d,]+\.\d+)/, text),
        extractValue(/Amount (?<value>[\d,]+\.\d+) ETB/, text),
        extractValue(/Transferred Amount (?<value>[\d,]+\.\d+) ETB/, text)
    ].find(it => it != undefined);

    const payerAccount = Number(extractValue(/Payer [A-Z\s]+\nAccount (?<value>1\*{4}\d{4})\n/, text)?.slice(-4));
    const receiver = extractValue(/Receiver (?<value>[A-Z\s]+)\n/, text)?.slice(0, 8);
    const receiverAccount = Number(extractValue(/Receiver [A-Z\s]+\nAccount (?<value>1\*{4}\d{4})\n/, text)?.slice(-4));
    const reference = extractValue(/Reference No\. (?<value>FT\w{10})\n/, text);
    const paymentDateRaw = extractValue(/Payment Date (?<value>[A-Za-z0-9\s]+)\n/, text);
    const paymentDate = new Date(paymentDateRaw).toISOString();

    // Validate transaction details
    validateTransactionDetails(receiverAccount, receiver?.trim(), paymentDate);

    return {
        payerAccount,
        receiver: receiver?.trim(),
        receiverAccount,
        amount: amount ? Number.parseFloat(amount.replace(",", "")) : undefined,
        reference: reference?.trim(),
        date: paymentDate,
    };
}

// Validate transaction details
function validateTransactionDetails(receiverAccount, receiver, paymentDate) {
    // Check if the payment date is today, yesterday, or tomorrow
    const today = new Date();
    const paymentDateTime = new Date(paymentDate);
    
    const isToday = paymentDateTime.toDateString() === today.toDateString();
    const isYesterday = paymentDateTime.toDateString() === new Date(today.setDate(today.getDate() - 1)).toDateString();
    const isTomorrow = paymentDateTime.toDateString() === new Date(today.setDate(today.getDate() + 2)).toDateString();
    
    if (!isToday && !isYesterday && !isTomorrow) {
        throw new Error('Error: Payment date has passed. try again /deposit');
    }

    // Validate receiver account and name
    if (receiverAccount !== RECEIVER_LAST_FOUR) throw new Error('Error: Receiver account does not match!');
    if (receiver !== RECEIVER_NAME) throw new Error('Error: Receiver name does not match!');
}

async function handleDepositing(chatId, transactionDetail) {
    try {
        // Remove duplicate transaction check since it's now done earlier
        const user = await User.findOne({ chatId });
        if (!user) {  
            throw new Error('User not found');
        }

        try {
            // Update user balance
            user.balance += transactionDetail.amount;
            await user.save();

            // Record successful transaction
            await new Transaction({
                transactionId: transactionDetail.reference,
                chatId,
                amount: transactionDetail.amount,
                status: 'success',
                type: 'deposit'
            }).save();

            console.log('Deposit successful and transaction recorded.');
        } catch (saveError) {
            // Record failed transaction if balance update fails
            await new Transaction({
                transactionId: transactionDetail.reference,
                chatId,
                amount: transactionDetail.amount,
                status: 'failed',
                type: 'deposit',
                errorMessage: 'Failed to update user balance'
            }).save();
            
            throw new Error('Failed to process deposit');
        }
    } catch (error) {
        console.error('Error handling deposit:', error);
        
        // Check for MongoDB duplicate key error
        if (error.code === 11000) {
            throw new Error('This transaction has already been processed. Please Try again /start.');
        }
        
        throw error;
    }
}

module.exports = { getTransactionData };