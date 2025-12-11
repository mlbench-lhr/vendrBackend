const FavoriteVendor = require("../models/FavoriteVendor");
const Vendor = require("../models/Vendor");
const { createNotification } = require("./notificationController");

// ADD VENDOR TO FAVORITES
exports.addFavorite = async (req, res, next) => {
  try {
    const userId = req.user.id; // from auth middleware
    const { vendorId } = req.body;

    if (!vendorId) {
      return res.status(400).json({ error: "vendorId required" });
    }

    // Check vendor exists
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    // Create or ignore if duplicate
    const fav = await FavoriteVendor.findOneAndUpdate(
      { userId, vendorId },
      { userId, vendorId },
      { upsert: true, new: true }
    );

    return res.json({ success: true, favorite: fav });
  } catch (err) {
    if (err.code === 11000)
      return res.status(200).json({ success: true, message: "Already favourited" });

    next(err);
  }
};

// REMOVE FAVORITE
exports.removeFavorite = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { vendorId } = req.body;

    await FavoriteVendor.deleteOne({ userId, vendorId });

    return res.json({ success: true, message: "Removed from favorites" });
  } catch (err) {
    next(err);
  }
};

// GET ALL FAVORITES
exports.getFavorites = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const favorites = await FavoriteVendor.find({ userId }).lean();

    const vendorIds = favorites.map((fav) => fav.vendorId);

    const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select("name vendor_type profile_image");

    return res.json({ success: true, vendors });
  } catch (err) {
    next(err);
  }
};
