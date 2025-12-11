// models/Notification.js
const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", default: null },

  title: { type: String, required: true },
  body: { type: String, required: true },
  image: { type: String, default: null },

  is_read: { type: Boolean, default: false },

  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Notification", NotificationSchema);
