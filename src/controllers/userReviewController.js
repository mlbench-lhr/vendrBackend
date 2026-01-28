const UserReview = require('../models/UserReview');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const mongoose = require('mongoose');

exports.addReview = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const role = req.user.role;
    const { userId, rating, message } = req.body;

    if (role !== "vendor") {
      return res.status(403).json({ success: false, message: "Only vendors can rate users" });
    }

    if (!userId || !rating) {
      return res.status(400).json({ success: false, message: "userId and rating are required" });
    }

    const user = await User.findById(userId).select("_id").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const vendor = await Vendor.findById(vendorId).select("_id").lean();
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    const review = await UserReview.findOneAndUpdate(
      { vendor_id: vendorId, user_id: userId },
      { vendor_id: vendorId, user_id: userId, rating, message: message || "" },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true, message: "Rating saved", review });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};
