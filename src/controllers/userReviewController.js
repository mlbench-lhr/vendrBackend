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

exports.getReviews = async (req, res) => {
  try {
    const userId = req.user.id;
    const reviews = await UserReview.find({ user_id: userId })
      .populate("vendor_id", "name profile_image")
      .sort({ created_at: -1 });

    const totalReviews = await UserReview.countDocuments({ user_id: userId });

    const ratingAgg = await UserReview.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: "$user_id", avgRating: { $avg: "$rating" } } }
    ]);

    const averageRating = ratingAgg.length > 0 ? parseFloat(ratingAgg[0].avgRating.toFixed(1)) : 0;

    const vendors = reviews.map((r) => {
      const v = r.vendor_id;
      return {
        id: v && v._id ? v._id : r.vendor_id,
        full_name: v && v.name ? v.name : null,
        profile_image: v && v.profile_image ? v.profile_image : null,
        rating: r.rating
      };
    });

    return res.json({
      success: true,
      user_id: userId,
      average_rating: averageRating,
      total_reviews: totalReviews,
      vendors
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};
