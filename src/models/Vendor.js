const mongoose = require('mongoose');
const { Schema } = mongoose;

const VendorSchema = new Schema(
  {
    name: {
      type: String,
      required: false,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: false, // OAuth vendors will not have a password
    },
    verified: { type: Boolean, default: false },
    phone: {
      type: String,
      required: false, // required only for email registration (controller handles this)
    },

    vendor_type: {
      type: String,
      required: false, // required only for email registration
    },

    provider: {
      type: String,
      enum: ['email', 'google', 'apple'],
      default: 'email',
    },

    provider_id: {
      type: String,
      required: false, // required only for OAuth vendors
    },
    has_permit: { type: Boolean, default: false },
    with_permit: { type: Boolean, default: false },
    profile_image: { type: String, default: null },
    profile_image_public_id: { type: String, default: null },
    shop_address: { type: String, default: null },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    language: { type: String, default: "en" },
    fcmDeviceTokens: [{ type: String, required: false }],
  },
  {
    timestamps: true,
  }
);

// Require provider_id ONLY for OAuth vendors
VendorSchema.pre('validate', function (next) {
  if (this.provider !== 'email' && !this.provider_id) {
    return next(new Error('provider_id is required for OAuth vendors'));
  }
  next();
});

module.exports = mongoose.model('Vendor', VendorSchema);
