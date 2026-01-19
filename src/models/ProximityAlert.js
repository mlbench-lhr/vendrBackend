const mongoose = require("mongoose");

const ProximityAlertSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    inside_radius: { type: Boolean, default: false },
    last_notified_at: { type: Date, default: null },
  },
  { timestamps: true }
);

ProximityAlertSchema.index({ user_id: 1, vendor_id: 1 }, { unique: true });

module.exports = mongoose.model("ProximityAlert", ProximityAlertSchema);

