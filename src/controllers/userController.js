const Vendor = require("../models/Vendor");
const VendorHours = require("../models/VendorHours");
const VendorLocation = require("../models/VendorLocation");
const Menu = require("../models/Menu");
const VendorReview = require("../models/VendorReview");
const UserReview = require("../models/UserReview");
const User = require("../models/User");
const FavoriteVendor = require("../models/FavoriteVendor");
const cloudinary = require('../config/cloudinary');
const mongoose = require("mongoose");
const { getUserLocationFromRtdb, getVendorLocationsFromRtdb } = require("../services/firebaseRtdbService");
const { notifyUserNearbyVendorsNow, notifyUserFavoriteVendorsNow } = require("../services/proximityAlertService");
const jwtService = require("../services/jwtService");

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getDecodedAccessUser(req) {
    const header = req.headers?.authorization;
    if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) return null;
    const token = header.slice(7);
    try {
        const decoded = jwtService.verifyAccess(token);
        return {
            id: decoded?.id || decoded?.userId,
            email: decoded?.email,
            role: decoded?.role,
        };
    } catch {
        return null;
    }
}

function toFiniteNumberOrNull(value) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

exports.editProfile = async (req, res) => {
    try {
        const userId = req.user.id; // from auth middleware
        const { name, profile_image, new_vendor_alert, distance_based_alert, favorite_vendor_alert } = req.body;

        const existingUser = await User.findById(userId).select("distance_based_alert favorite_vendor_alert new_vendor_alert").lean();

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

        const distanceAlertTurnedOn =
            typeof distance_based_alert === "boolean" &&
            distance_based_alert === true &&
            !existingUser?.distance_based_alert;

        const favoriteAlertTurnedOn =
            typeof favorite_vendor_alert === "boolean" &&
            favorite_vendor_alert === true &&
            !existingUser?.favorite_vendor_alert;

        const newVendorAlertTurnedOn =
            typeof new_vendor_alert === "boolean" &&
            new_vendor_alert === true &&
            !existingUser?.new_vendor_alert;

        if (distanceAlertTurnedOn || favoriteAlertTurnedOn || newVendorAlertTurnedOn) {
            const loc = await getUserLocationFromRtdb(userId);
            if (loc?.lat != null && loc?.lng != null) {
                updateData.lat = loc.lat;
                updateData.lng = loc.lng;
            }
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

        if (distanceAlertTurnedOn) {
            const radiusKm = Number(process.env.PROXIMITY_ALERT_RADIUS_KM || 5);
            notifyUserNearbyVendorsNow(userId, radiusKm).catch((err) => {
                console.error("Distance-based notify on toggle failed:", err);
            });
        }

        if (favoriteAlertTurnedOn) {
            const radiusKm = Number(process.env.PROXIMITY_ALERT_RADIUS_KM || 5);
            notifyUserFavoriteVendorsNow(userId, radiusKm).catch((err) => {
                console.error("Favourite-vendor notify on toggle failed:", err);
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
            "name profile_image phone vendor_type shop_address lat lng has_permit with_permit"
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
        const decodedUser = getDecodedAccessUser(req);
        const {
            userId,
          
            token,
           
            userLat,
            userLng
        } = req.body;

        const resolvedUserId = userId 
        const resolvedEmail = decodedUser?.email;
        const resolvedToken = token || null;
        const resolvedLat = toFiniteNumberOrNull(userLat);
        const resolvedLng = toFiniteNumberOrNull(userLng);

        if (!resolvedUserId && !resolvedEmail) {
            return res.status(400).json({ success: false, message: "userId or email required" });
        }

        const user =
            (resolvedUserId ? await User.findById(resolvedUserId) : null) ||
            (resolvedEmail ? await User.findOne({ email: resolvedEmail }) : null);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // update lat/lng only if provided (not undefined)
        if (resolvedLat !== undefined) user.lat = resolvedLat;
        if (resolvedLng !== undefined) user.lng = resolvedLng;

        if (resolvedToken) {
            if (!Array.isArray(user.fcmDeviceTokens)) {
                user.fcmDeviceTokens = [];
            }

            if (!user.fcmDeviceTokens.includes(resolvedToken)) {
                user.fcmDeviceTokens.push(resolvedToken);
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
        const userId = req.user?.id;
        const email = req.user?.email;
        const role = req.user?.role;

        if (role === "vendor") {
            const vendor = (userId ? await Vendor.findById(userId) : null) || (email ? await Vendor.findOne({ email }) : null);
            if (!vendor) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            return res.json({
                success: true,
                user: {
                    name: vendor.name,
                    email: vendor.email,
                    profile_image: vendor.profile_image,
                    new_vendor_alert: false,
                    distance_based_alert: false,
                    favorite_vendor_alert: false,
                    favoriteVendors: []
                }
            });
        }

        let user =
            (userId ? await User.findById(userId) : null) ||
            (email ? await User.findOne({ email }) : null);

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        if (!user.requests_last_reset_at || user.requests_last_reset_at < today) {
            user.requests_remaining = 10;
            user.requests_last_reset_at = today;
            await user.save();
        }

        const resolvedUserId = user._id.toString();

        // Get favorite vendor IDs
        const favorites = await FavoriteVendor.find({ userId: resolvedUserId }).lean();
        const vendorIds = favorites.map(f => f.vendorId);

        // Fetch vendor details
        const favoriteVendors = await Vendor.find({ _id: { $in: vendorIds } })
            .select("name email phone vendor_type profile_image created_at");

        const ratingAgg = await UserReview.aggregate([
            { $match: { user_id: new mongoose.Types.ObjectId(resolvedUserId) } },
            { $group: { _id: "$user_id", avgRating: { $avg: "$rating" }, total: { $sum: 1 } } }
        ]);
        const averageRating = ratingAgg.length > 0 ? parseFloat(ratingAgg[0].avgRating.toFixed(1)) : 0;
        const totalUserReviews = ratingAgg.length > 0 ? ratingAgg[0].total : 0;

        const userProfile = {
            ...user.toObject(),
            favoriteVendors,
            average_rating: averageRating,
            total_reviews: totalUserReviews
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

exports.consumeDailyRequest = async (req, res) => {
    try {
        const role = req.user?.role;
        if (role !== "user") {
            return res.status(403).json({ success: false, message: "Forbidden" });
        }
        const userId = req.user?.id;
        const email = req.user?.email;
        let user =
            (userId ? await User.findById(userId) : null) ||
            (email ? await User.findOne({ email }) : null);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        if (!user.requests_last_reset_at || user.requests_last_reset_at < today) {
            user.requests_remaining = 10;
            user.requests_last_reset_at = today;
        }
        if (user.requests_remaining <= 0) {
            return res.status(429).json({
                success: false,
                message: "No requests remaining for today",
                requests_remaining: 0
            });
        }
        user.requests_remaining = (user.requests_remaining || 0) - 1;
        await user.save();
        return res.json({
            success: true,
            requests_remaining: user.requests_remaining
        });
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
        }).select("name profile_image vendor_type shop_address lat lng has_permit");

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

exports.getNearbyVendorsRealtime = async (req, res) => {
    try {
        const userId = req.user.id;
        const { maxDistance = 5, lat, lng } = req.query;

        const maxDistanceKm = parseFloat(maxDistance);

        const user = await User.findById(userId).select("lat lng").lean();
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        
        let userLat = null;
        let userLng = null;
        
        // Get user location from query params or RTDB or DB
        if (lat != null && lng != null) {
            userLat = parseFloat(lat);
            userLng = parseFloat(lng);
            if (Number.isFinite(userLat) && Number.isFinite(userLng)) {
                try {
                    await User.updateOne({ _id: userId }, { $set: { lat: userLat, lng: userLng } });
                } catch (e) { }
            }
        } else {
            const rtdbLoc = await getUserLocationFromRtdb(userId);
            if (rtdbLoc?.lat != null && rtdbLoc?.lng != null) {
                userLat = parseFloat(rtdbLoc.lat);
                userLng = parseFloat(rtdbLoc.lng);
            } else {
                userLat = parseFloat(user.lat);
                userLng = parseFloat(user.lng);
            }
        }

        const isValidLatLng = (a, b) =>
            Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180;

        if (!isValidLatLng(userLat, userLng)) {
            return res.status(400).json({ success: false, message: "User location not available" });
        }

        // Get live vendor locations from RTDB
        const vendorLocations = await getVendorLocationsFromRtdb();
        if (!vendorLocations.length) {
            return res.json({
                success: true,
                user_location: { lat: userLat, lng: userLng },
                count: 0,
                vendors: []
            });
        }

        // Map vendor IDs to their live locations
        const liveLocationByVendorId = new Map();
        const vendorIds = [];
        
        for (const v of vendorLocations) {
            const id = String(v.vendorId);
            if (!mongoose.Types.ObjectId.isValid(id)) continue;
            
            const vLat = parseFloat(v.lat);
            const vLng = parseFloat(v.lng);
            
            if (!isValidLatLng(vLat, vLng)) continue;
            
            if (!liveLocationByVendorId.has(id)) {
                liveLocationByVendorId.set(id, { lat: vLat, lng: vLng });
                vendorIds.push(id);
            }
        }

        if (!vendorIds.length) {
            return res.json({
                success: true,
                user_location: { lat: userLat, lng: userLng },
                count: 0,
                vendors: []
            });
        }

        // Fetch vendor details from DB
        const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select(
            "name profile_image vendor_type shop_address lat lng"
        );

        // Calculate distances and prepare response
        const vendorsWithDistance = await Promise.all(
            vendors.map(async (vendor) => {
                const vendorIdStr = vendor._id.toString();
                const live = liveLocationByVendorId.get(vendorIdStr);
                
                if (!live) return null;

                // Use the live location coordinates for distance calculation
                const vendorLat = live.lat;
                const vendorLng = live.lng;
                
                // Calculate distance using live coordinates
                const distanceKm = calculateDistanceKm(userLat, userLng, vendorLat, vendorLng);
                
                // Get menu count and hours
                const totalMenus = await Menu.countDocuments({ vendor_id: vendor._id });
                const hours = await VendorHours.findOne({ vendor_id: vendor._id });
                const todaysHoursCount = getTodaysHoursCount(hours);

                return {
                    _id: vendor._id,
                    name: vendor.name,
                    vendor_type: vendor.vendor_type,
                    profile_image: vendor.profile_image,
                    shop_address: vendor.shop_address,
                    lat: vendorLat,  // Return live coordinates
                    lng: vendorLng,  // Return live coordinates
                    total_menus: totalMenus,
                    todays_hours_count: todaysHoursCount,
                    distance_in_km: Number(distanceKm.toFixed(1)),
                    distance_in_km_exact: Number(distanceKm.toFixed(3))
                };
            })
        );

        // Filter out null values and apply distance filter
        const nearbyVendors = vendorsWithDistance
            .filter(Boolean)
            .filter(v => v.distance_in_km_exact <= maxDistanceKm)
            .sort((a, b) => a.distance_in_km_exact - b.distance_in_km_exact);

        return res.json({
            success: true,
            user_location: { lat: userLat, lng: userLng },
            count: nearbyVendors.length,
            vendors: nearbyVendors
        });
    } catch (err) {
        console.error("Get Nearby Vendors Realtime Error:", err);
        return res.status(500).json({ 
            success: false, 
            message: "Something went wrong", 
            error: err.message 
        });
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
        const { query = "", vendor_type, vendorType, lat, lng, distance } = req.query;
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
        const vendorTypeText = String(vendor_type ?? vendorType ?? "").trim();
        const searchRegex = new RegExp(escapeRegex(text), "i");
        const tokens = text
            .toLowerCase()
            .split(/[^a-z0-9]+/g)
            .map(t => t.trim())
            .filter(Boolean);

        const vendorTypeFilterRegexFromQuery = tokens.length > 0
            ? new RegExp(tokens.map(escapeRegex).join("|"), "i")
            : null;

        const shouldUseQueryAsVendorType =
            !vendorTypeText &&
            vendorTypeFilterRegexFromQuery &&
            (await Vendor.exists({ vendor_type: vendorTypeFilterRegexFromQuery }));

        const vendorTypeFilterRegex = vendorTypeText
            ? new RegExp(`^${escapeRegex(vendorTypeText)}$`, "i")
            : (shouldUseQueryAsVendorType ? vendorTypeFilterRegexFromQuery : null);
        const vendorTypeFilter = vendorTypeFilterRegex ? { vendor_type: vendorTypeFilterRegex } : {};

        // 1️⃣ Vendors matching by vendor name, vendor type, shop address
        const vendorsMatch = await Vendor.find({
            ...vendorTypeFilter,
            $or: [
                { name: { $regex: searchRegex } },
                { vendor_type: { $regex: searchRegex } },
                { shop_address: { $regex: searchRegex } }
            ]
        }).select("_id");

        // 2️⃣ Vendors matching menus (menu name OR category)
        const menusMatch = await Menu.find({
            $or: [
                { name: { $regex: searchRegex } },
                { category: { $regex: searchRegex } }
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
            ...vendorTypeFilter,
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
