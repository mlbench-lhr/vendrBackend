const Notification = require("../models/Notification");
const User = require("../models/User");
const Vendor = require("../models/Vendor");

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

    const notifications = await Notification.find(filter)
      .sort({ created_at: -1 })
      .select("title body image created_at is_read");

    return res.json({
      success: true,
      total: notifications.length,
      notifications
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
