const mongoose = require('mongoose');
const { Schema } = mongoose;

const VendorSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
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
    profile_image: { type: String, default: null },
    profile_image_public_id: { type: String, default: null },
    shop_address: { type: String, default: null },
    language: { type: String, default: "en" }
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
