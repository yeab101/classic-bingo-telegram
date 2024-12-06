// const fs = require('fs');
// const Jimp = require('jimp');
// const QrCode = require('qrcode-reader');

// // Create function to read QR code
// async function readQRCode(imagePath) {
//     try {
//         // Read the image using Jimp
//         const image = await Jimp.read(imagePath);
        
//         // Create new QR code reader instance
//         const qrReader = new QrCode();
        
//         // Convert image to buffer that can be read by qrcode-reader
//         const value = await new Promise((resolve, reject) => {
//             qrReader.callback = (err, value) => {
//                 if (err) reject(err);
//                 resolve(value);
//             };
//             qrReader.decode(image.bitmap);
//         });

//         // Return the decoded text
//         return value.result;
//     } catch (error) {
//         console.error('Error reading QR code:', error);
//         throw error;
//     }
// }

// // Example usage
// readQRCode('./image.png')
//     .then(result => {
//         console.log('Decoded QR code:', result);
//     })
//     .catch(error => {
//         console.error('Failed to read QR code:', error);
//     });
