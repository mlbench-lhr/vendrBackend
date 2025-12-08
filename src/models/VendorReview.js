const mongoose = require('mongoose');

const VendorReviewSchema = new mongoose.Schema({
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    rating: { type: Number, min: 1, max: 5, required: true },
    message: { type: String, default: "" },

    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("VendorReview", VendorReviewSchema);
