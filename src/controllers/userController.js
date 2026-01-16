const Vendor = require("../models/Vendor");
const VendorHours = require("../models/VendorHours");
const VendorLocation = require("../models/VendorLocation");
const Menu = require("../models/Menu");
const VendorReview = require("../models/VendorReview");
const User = require("../models/User");
const FavoriteVendor = require("../models/FavoriteVendor");
const cloudinary = require('../config/cloudinary');

exports.editProfile = async (req, res) => {
    try {
        const userId = req.user.id; // from auth middleware
        const { name, profile_image, new_vendor_alert, distance_based_alert, favorite_vendor_alert } = req.body;

        let updateData = {};
        if (name) updateData.name = name;

        // Only update profile image if provided
        if (profile_image) {
            updateData.profile_image = profile_image;
        }

        if (typeof new_vendor_alert === "boolean") {
            updateData.new_vendor_alert = new_vendor_alert;
        }

        if (typeof distance_based_alert === "boolean") {
            updateData.distance_based_alert = distance_based_alert;
        }

        if (typeof favorite_vendor_alert === "boolean") {
            updateData.favorite_vendor_alert = favorite_vendor_alert;
        }

        // Update user record
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.json({
            success: true,
            message: "Profile updated successfully",
            user: updatedUser
        });

    } catch (err) {
        console.error("Edit Profile Error:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message
        });
    }
};

exports.getVendorDetails = async (req, res, next) => {
    try {
        const vendorId = req.params.vendorId;
        const { lat, lng } = req.query; // user location from mobile app

        // 1. Vendor Basic Info
        const vendor = await Vendor.findById(vendorId).select(
            "name profile_image phone vendor_type shop_address lat lng"
        );

        if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

        // 2. Vendor Location
        const location = await VendorLocation.findOne({ vendor_id: vendorId });

        // 3. Vendor Hours
        const hours = await VendorHours.findOne({ vendor_id: vendorId });

        // Check open/closed status
        let open_status = "unknown";
        if (hours) {
            const currentDay = new Date().toLocaleString("en-US", { weekday: "long" }).toLowerCase();
            const d = hours.days[currentDay];

            if (d && d.enabled) open_status = "open";
            else open_status = "closed";
        }

        // 4. Vendor Menu
        const menus = await Menu.find({ vendor_id: vendorId });

        // 5. Vendor Reviews (with user info)
        let reviews = await VendorReview.find({ vendor_id: vendorId }).sort({ created_at: -1 }).lean();

        const total_reviews = reviews.length;
        const average_rating =
            total_reviews > 0
                ? (reviews.reduce((sum, r) => sum + r.rating, 0) / total_reviews).toFixed(1)
                : 0;

        reviews = await Promise.all(
            reviews.map(async (r) => {
                let userData = null;
                if (r.user_id) {
                    userData = await User.findById(r.user_id).select("name profile_image");
                }
                return {
                    _id: r._id,
                    rating: r.rating,
                    message: r.message,
                    created_at: r.created_at,
                    user: {
                        name: userData?.name || r.user_name || "Deleted User",
                        profile_image:
                            userData?.profile_image || r.user_profile_image || null,
                    },
                };
            })
        );

        // 6. Calculate distance from user
        let distance = null;
        if (lat && lng && location?.fixed_location) {
            const R = 6371;
            const dLat = (location.fixed_location.lat - lat) * (Math.PI / 180);
            const dLng = (location.fixed_location.lng - lng) * (Math.PI / 180);

            const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos(lat * (Math.PI / 180)) *
                Math.cos(location.fixed_location.lat * (Math.PI / 180)) *
                Math.sin(dLng / 2) ** 2;

            distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        const vendorProfile = {
            ...vendor.toObject(),
            location,
            distance_in_km: distance ? Number(distance.toFixed(1)) : null,
            open_status,
            hours,
            menus,
            reviews: {
                average_rating: Number(average_rating),
                total_reviews,
                reviews: reviews,
            },
        };

        return res.json({
            success: true,
            vendor: vendorProfile,

        });
    } catch (err) {
        next(err);
    }
};

//set language
exports.setLanguage = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { language } = req.body;

        const updated = await User.findByIdAndUpdate(
            userId,
            { language },
            { new: true }
        );

        return res.json({ success: true, language: updated.language });
    } catch (err) {
        console.error("Set User Language Error:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message
        });
    }
};

// get language
exports.getLanguage = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId).select("language");
        return res.json({ success: true, language: user.language });
    } catch (err) {
        console.error("Get User Language Error:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message
        });
    }
};

//delete account
exports.deleteAccount = async (req, res, next) => {
    try {
        const userId = req.user.id;
        await Promise.all([
            User.deleteOne({ _id: userId }),
            VendorReview.updateMany(
                { user_id: userId },
                {
                    $set: { user_id: null }
                }
            )
        ]);

        return res.json({ success: true, message: "Account deleted" });
    } catch (err) {
        console.error("Delete vendor Account Error:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message
        });
    }
};
exports.updateFcmDeviceToken = async (req, res) => {
    try {
        const { userId, token, lat, lng } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // update lat/lng only if provided (not undefined)
        if (lat !== undefined) user.lat = lat ?? null;
        if (lng !== undefined) user.lng = lng ?? null;

        if (token) {
            if (!Array.isArray(user.fcmDeviceTokens)) {
                user.fcmDeviceTokens = [];
            }

            if (!user.fcmDeviceTokens.includes(token)) {
                user.fcmDeviceTokens.push(token);
            }
        }

        await user.save();

        return res.json({
            success: true,
            user: user.toObject(),
        });
    } catch (err) {
        console.error("Error updating FCM token:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message,
        });
    }
};

exports.getUserProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId).select(
            "name email profile_image new_vendor_alert distance_based_alert favorite_vendor_alert"
        );

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Get favorite vendor IDs
        const favorites = await FavoriteVendor.find({ userId }).lean();
        const vendorIds = favorites.map(f => f.vendorId);

        // Fetch vendor details
        const favoriteVendors = await Vendor.find({ _id: { $in: vendorIds } })
            .select("name email phone vendor_type profile_image created_at");

        const userProfile = {
            ...user.toObject(),
            favoriteVendors
        };

        return res.json({ success: true, user: userProfile });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message
        });
    }
};

exports.getNearbyVendors = async (req, res, next) => {
    try {
        const { lat, lng, maxDistance = 5 } = req.query;
        if (!lat || !lng) return res.status(400).json({ success: false, message: "lat & lng required" });

        const userLat = parseFloat(lat);
        const userLng = parseFloat(lng);

        // Fetch vendors that have lat/lng saved in their model
        const vendors = await Vendor.find({
            lat: { $exists: true, $ne: null },
            lng: { $exists: true, $ne: null }
        }).select("name profile_image vendor_type shop_address lat lng");

        const vendorsWithDistance = await Promise.all(
            vendors.map(async (vendor) => {

                // Calculate Haversine distance using vendor.lat & vendor.lng
                const R = 6371; // km
                const dLat = (vendor.lat - userLat) * (Math.PI / 180);
                const dLng = (vendor.lng - userLng) * (Math.PI / 180);
                const a =
                    Math.sin(dLat / 2) ** 2 +
                    Math.cos(userLat * (Math.PI / 180)) *
                    Math.cos(vendor.lat * (Math.PI / 180)) *
                    Math.sin(dLng / 2) ** 2;
                const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

                // Total menus
                const totalMenus = await Menu.countDocuments({ vendor_id: vendor._id });

                // Today's hours count
                const hours = await VendorHours.findOne({ vendor_id: vendor._id });
                const todaysHoursCount = getTodaysHoursCount(hours);

                return {
                    ...vendor.toObject(),
                    total_menus: totalMenus,
                    todays_hours_count: todaysHoursCount,
                    distance_in_km: Number(distance.toFixed(1))
                };
            })
        );

        // Filter by distance
        const nearbyVendors = vendorsWithDistance
            .filter(v => v.distance_in_km <= maxDistance)
            .sort((a, b) => a.distance_in_km - b.distance_in_km);

        return res.json({ success: true, count: nearbyVendors.length, vendors: nearbyVendors });
    } catch (err) {
        console.error("Get Nearby Vendors Error:", err);
        return res.status(500).json({ success: false, message: "Something went wrong", error: err.message });
    }
};

const getTodaysHoursCount = (hours) => {
    if (!hours) return 0;

    const currentDay = new Date().toLocaleString("en-US", { weekday: "long" }).toLowerCase();
    const dayObj = hours.days[currentDay];

    if (!dayObj || !dayObj.enabled) return 0;

    // Parse start and end time
    const [startH, startM] = dayObj.start.split(":").map(Number);
    const [endH, endM] = dayObj.end.split(":").map(Number);

    // Convert to minutes
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Difference in hours
    const diffHours = (endMinutes - startMinutes) / 60;

    return diffHours > 0 ? diffHours : 0;
};

exports.searchVendors = async (req, res, next) => {
    try {
        const { query = "", lat, lng, distance } = req.query;
        // ✅ Mandatory validations
        if (!query.trim()) {
            return res.status(400).json({
                success: false,
                message: "Search query is required"
            });
        }

        if (!lat || !lng || !distance) {
            return res.status(400).json({
                success: false,
                message: "lat, lng and distance are required"
            });
        }

        const userLat = parseFloat(lat);
        const userLng = parseFloat(lng);
        const maxDistance = parseFloat(distance);
        const text = query.trim();

        // 1️⃣ Vendors matching by vendor name, vendor type, shop address
        const vendorsMatch = await Vendor.find({
            $or: [
                { name: { $regex: text, $options: "i" } },
                { vendor_type: { $regex: text, $options: "i" } },
                { shop_address: { $regex: text, $options: "i" } }
            ]
        }).select("_id");

        // 2️⃣ Vendors matching menus (menu name OR category)
        const menusMatch = await Menu.find({
            $or: [
                { name: { $regex: text, $options: "i" } },
                { category: { $regex: text, $options: "i" } }
            ]
        }).select("vendor_id");

        // Collect unique vendor IDs
        const vendorIds = [
            ...vendorsMatch.map(v => v._id.toString()),
            ...menusMatch.map(m => m.vendor_id.toString())
        ];

        const uniqueVendorIds = [...new Set(vendorIds)];

        if (uniqueVendorIds.length === 0) {
            return res.json({ success: true, count: 0, vendors: [] });
        }

        // Fetch vendor details
        const vendors = await Vendor.find({
            _id: { $in: uniqueVendorIds }
        }).select("name profile_image vendor_type shop_address lat lng");

        // 5️⃣ Distance filter + enrichment
        const enrichedVendors = [];

        for (const vendor of vendors) {
            const vendorDistance = calculateDistanceKm(
                userLat,
                userLng,
                vendor.lat,
                vendor.lng
            );

            // ❌ Exclude outside radius
            if (vendorDistance > maxDistance) continue;

            const totalMenus = await Menu.countDocuments({ vendor_id: vendor._id });
            const hours = await VendorHours.findOne({ vendor_id: vendor._id });
            const todaysHoursCount = getTodaysHoursCount(hours);

            enrichedVendors.push({
                ...vendor.toObject(),
                distance_in_km: Number(vendorDistance.toFixed(1)),
                total_menus: totalMenus,
                todays_hours_count: todaysHoursCount
            });
        }

        return res.json({
            success: true,
            count: enrichedVendors.length,
            vendors: enrichedVendors
        });

    } catch (err) {
        console.error("Search Vendors Error:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: err.message
        });
    }
};

const calculateDistanceKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth radius in KM
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};




