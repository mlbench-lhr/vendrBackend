const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  otp: { type: String, required: true },
  role: {type: String, enum: ["user", "vendor"]},
  expires_at: { type: Number, required: true }, // unix ms
}, { timestamps: true });

module.exports = mongoose.model('PasswordOtp', schema);
