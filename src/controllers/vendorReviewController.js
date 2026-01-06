// controllers/vendorReviewController.js

const VendorReview = require('../models/VendorReview');
const User = require('../models/User');
const mongoose = require('mongoose');

exports.addReview = async (req, res) => {
    try {
        const userId = req.user.id; // from auth middleware
        const { vendor_id, rating, message } = req.body;

        // Validate required fields
        if (!vendor_id || !rating) {
            return res.status(400).json({ success: false, message: "vendor_id and rating are required" });
        }

        // Optional: Check if the user has already reviewed this vendor
        const existingReview = await VendorReview.findOne({ vendor_id, user_id: userId });
        if (existingReview) {
            return res.status(400).json({ success: false, message: "You have already reviewed this vendor" });
        }

        const review = new VendorReview({
            vendor_id,
            user_id: userId,
            rating,
            message: message || ""
        });

        await review.save();

        return res.json({ success: true, message: "Review added successfully", review });

    } catch (err) {
        console.error("Add Review Error:", err);
        return res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
};

exports.deleteReview = async (req, res) => {
    try {
        const userId = req.user._id; // Only allow owner to delete
        const reviewId = req.params.id;

        const review = await VendorReview.findById(reviewId);

        if (!review) {
            return res.status(404).json({ success: false, message: "Review not found" });
        }

        // Only the user who created the review can delete it
        if (review.user_id.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Not authorized to delete this review" });
        }

        await VendorReview.findByIdAndDelete(reviewId);

        return res.json({ success: true, message: "Review deleted successfully" });

    } catch (err) {
        console.error("Delete Review Error:", err);
        return res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
};

exports.getReviews = async (req, res) => {
    try {
        const vendorId = req.params.vendorId;
        const page = parseInt(req.query.page) || 1;      // Current page
        const limit = parseInt(req.query.limit) || 10;   // Reviews per page
        const skip = (page - 1) * limit;

        // Fetch reviews with pagination
        const reviews = await VendorReview.find({ vendor_id: vendorId })
            .populate("user_id", "name profile_image")
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit);

        // Total reviews count
        const totalReviews = await VendorReview.countDocuments({ vendor_id: vendorId });

        // Average rating calculation
        const ratingAgg = await VendorReview.aggregate([
            { $match: { vendor_id: new mongoose.Types.ObjectId(vendorId) } },
            { $group: { _id: "$vendor_id", avgRating: { $avg: "$rating" } } }
        ]);

        const averageRating = ratingAgg.length > 0 ? parseFloat(ratingAgg[0].avgRating.toFixed(1)) : 0;

        // 3️⃣ Transform response to ALWAYS return user_id object
        const formattedReviews = await Promise.all(
            reviews.map(async (r) => {

                let userObj = null;

                if (r.user_id) {
                    const user = await User.findById(r.user_id)
                        .select("_id name email profile_image")
                        .lean();  // ← THIS WAS MISSING BEFORE

                    if (user) {
                        userObj = user;
                    }
                }

                // If user deleted → return stored snapshot
                if (!userObj) {
                    userObj = {
                        name: r.user_name || "Deleted User",
                        profile_image: r.user_profile_image || null
                    };
                }

                // Return CLEAN object
                return {
                    _id: r._id,
                    vendor_id: r.vendor_id,
                    user: userObj,
                    rating: r.rating,
                    message: r.message,
                    created_at: r.created_at
                };
            })
        );

        return res.json({
            success: true,
            vendor_id: vendorId,
            average_rating: averageRating,
            total_reviews: totalReviews,
            page,
            limit,
            reviews: formattedReviews
        });

    } catch (err) {
        console.error("Get Reviews Error:", err);
        return res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
};

