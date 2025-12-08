const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    name: { type: String, required: false }, // OAuth may not send name initially

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: false, // OAuth users do NOT have a password
    },
    verified: { type: Boolean, default: false },
    provider: {
      type: String,
      enum: ['email', 'google', 'apple'],
      default: 'email',
    },

    provider_id: {
      type: String,
      required: false, // only required for OAuth
    },
    profile_image: { type: String, default: null },
    profile_image_public_id: { type: String, default: null },
    language: { type: String, default: "en" }
  },
  {
    timestamps: true, // createdAt, updatedAt automatically
  }
);

// Ensure provider_id is set only when provider != email
UserSchema.pre('validate', function (next) {
  if (this.provider !== 'email' && !this.provider_id) {
    return next(new Error('provider_id is required for OAuth users'));
  }
  next();
});

module.exports = mongoose.model('User', UserSchema);
