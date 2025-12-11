const mongoose = require("mongoose");
const { Schema } = mongoose;

const favoriteSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    vendorId: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

// Prevent duplicates
favoriteSchema.index({ userId: 1, vendorId: 1 }, { unique: true });

module.exports = mongoose.model("FavoriteVendor", favoriteSchema);
