const Notification = require("../models/Notification");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const mongoose = require("mongoose");

exports.seedSampleNotifications = async (req, res) => {
  try {
    // 1. Fetch random user
    const randomUser = await User.aggregate([{ $sample: { size: 1 } }]);

    // 2. Fetch random vendor
    const randomVendor = await Vendor.aggregate([{ $sample: { size: 1 } }]);

    if (!randomUser.length || !randomVendor.length) {
      return res.status(400).json({
        success: false,
        message: "Cannot seed: No users or vendors found in database."
      });
    }

    const userId = randomUser[0]._id;
    const vendorId = randomVendor[0]._id;

    const samples = [
      {
        user_id: userId,
        title: "Welcome to the App!",
        body: "Your account is ready. Start exploring vendors around you.",
        image: "https://placehold.co/100x100"
      },
      {
        vendor_id: vendorId,
        title: "New Order Alert",
        body: "You have received a new order. Review it in your dashboard.",
        image: "https://placehold.co/100x100"
      },
      {
        vendor_id: vendorId,
        title: "Reminder",
        body: "Update your menu and working hours to attract more customers.",
        image: "https://placehold.co/100x100"
      }
    ];

    await Notification.insertMany(samples);

    return res.json({
      success: true,
      message: "Sample notifications added",
      usedUserId: userId,
      usedVendorId: vendorId
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const authId = req.user.id;
    const role = req.user.role; // "vendor" or "user"

    let filter = {};

    if (role === "vendor") {
      filter.vendor_id = authId;
    } else {
      filter.user_id = authId;
    }

    const limitRaw = Number(req.query.limit || 50);
    const pageRaw = Number(req.query.page || 1);
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;
    const page = Number.isFinite(pageRaw) ? Math.max(1, pageRaw) : 1;
    const skip = (page - 1) * limit;

    const [total, notifications] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.find(filter)
        .sort({ created_at: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .select("type data title body image created_at is_read user_id vendor_id"),
    ]);

    return res.json({
      success: true,
      total,
      page,
      limit,
      notifications
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const authId = req.user.id;
    const role = req.user.role;

    const filter = role === "vendor" ? { vendor_id: authId } : { user_id: authId };
    const unread = await Notification.countDocuments({ ...filter, is_read: false });

    return res.json({ success: true, unread });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const authId = req.user.id;
    const role = req.user.role;
    const notificationId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(String(notificationId))) {
      return res.status(400).json({ success: false, message: "Invalid notification id" });
    }

    const ownerFilter = role === "vendor" ? { vendor_id: authId } : { user_id: authId };

    const updated = await Notification.findOneAndUpdate(
      { _id: notificationId, ...ownerFilter },
      { $set: { is_read: true } },
      { new: true }
    ).select("type data title body image created_at is_read user_id vendor_id");

    if (!updated) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.json({ success: true, notification: updated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const authId = req.user.id;
    const role = req.user.role;

    const ownerFilter = role === "vendor" ? { vendor_id: authId } : { user_id: authId };
    const result = await Notification.updateMany({ ...ownerFilter, is_read: false }, { $set: { is_read: true } });

    return res.json({
      success: true,
      modified: result.modifiedCount ?? result.nModified ?? 0
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const authId = req.user.id;
    const role = req.user.role;
    const notificationId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(String(notificationId))) {
      return res.status(400).json({ success: false, message: "Invalid notification id" });
    }

    const ownerFilter = role === "vendor" ? { vendor_id: authId } : { user_id: authId };
    const result = await Notification.deleteOne({ _id: notificationId, ...ownerFilter });

    if (!result.deletedCount) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
