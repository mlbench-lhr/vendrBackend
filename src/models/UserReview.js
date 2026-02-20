const mongoose = require('mongoose');

const UserReviewSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  message: { type: String, default: "" },
  created_at: { type: Date, default: Date.now }
});

UserReviewSchema.index({ vendor_id: 1, user_id: 1 });

module.exports = mongoose.model("UserReview", UserReviewSchema);
