// controllers/uploadController.js
const cloudinary = require('../config/cloudinary');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const Menu = require('../models/Menu');

exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    // Determine folder
    let folder = "vendors";

    const uploadedImage = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    return res.json({
      success: true,
      message: "Image uploaded successfully",
      url: uploadedImage.secure_url,
      public_id: uploadedImage.public_id
    });

  } catch (err) {
    console.error("Upload Error:", err);
    return res.status(500).json({ success: false, message: "Upload failed", error: err.message });
  }
};
