const multer = require('multer');

// store file in memory to send to Cloudinary
const storage = multer.memoryStorage();

module.exports = multer({ storage });
