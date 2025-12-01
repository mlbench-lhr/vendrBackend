const PasswordOtp = require('../models/PasswordOtp');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const passwordService = require('../services/passwordService');
const { generateOtp } = require('../services/passwordService');
const { sendEmail } = require('../emails/sendEmail');
const bcrypt = require('bcrypt');

const OTP_TTL = (parseInt(process.env.OTP_TTL_MINUTES || '10', 10) * 60 * 1000);

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    // Check if email exists in User OR Vendor
    const user = await User.findOne({ email });
    const vendor = await Vendor.findOne({ email });

    if (!user && !vendor) {
      return res.status(404).json({
        success: false,
        message: "Email not found"
      });
    }
    const otp = generateOtp(4);
    const expires_at = Date.now() + OTP_TTL;
    await PasswordOtp.findOneAndUpdate(
      { email },
      { email, otp, expires_at },
      { upsert: true, new: true }
    );
    const otpEmailTemplate = require('../emails/templates/otpEmail');
    const subject = "Password Reset OTP";

    await sendEmail(
      email,
      "Password Reset OTP",
      otpEmailTemplate({ otp, subject }),
      `Your OTP is ${otp}`
    );
    return res.json({ success: true, message: 'OTP sent to email' });
  } catch (err) { next(err); }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const doc = await PasswordOtp.findOne({ email });
    if (!doc) return res.status(400).json({ success: false, message: 'Invalid OTP' });
    if (doc.expires_at < Date.now()) return res.status(400).json({ success: false, message: 'OTP expired' });
    if (doc.otp !== String(otp)) return res.status(400).json({ success: false, message: 'Invalid OTP' });
    return res.json({ success: true, message: 'OTP verified' });
  } catch (err) { next(err); }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otp, new_password } = req.body;
    const doc = await PasswordOtp.findOne({ email });
    if (!doc || doc.otp !== String(otp) || doc.expires_at < Date.now()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }
    const hash = await passwordService.hashPassword(new_password);
    const user = await User.findOneAndUpdate({ email }, { passwordHash: hash }, { new: true });
    const vendor = await Vendor.findOneAndUpdate({ email }, { passwordHash: hash }, { new: true });
    await PasswordOtp.deleteOne({ email });
    return res.json({ success: true, message: 'Password updated', user: user || vendor });
  } catch (err) { next(err); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;
    const userId = req.user.id;

    // Try user first
    let account = await User.findById(userId);
    let accountType = "user";
    if (!account) {
      account = await Vendor.findById(userId);
      accountType = "vendor";
    }

    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    // CASE 1: OAuth user (no password exists)
    if (!account.passwordHash) {
      const newHash = await passwordService.hashPassword(new_password);

      if (accountType === "user") {
        await User.findByIdAndUpdate(userId, { passwordHash: newHash });
      } else {
        await Vendor.findByIdAndUpdate(userId, { passwordHash: newHash });
      }

      return res.json({
        success: true,
        message: "Password set successfully"
      });
    }

    // CASE 2: Normal user (must validate old password)
    const isCorrect = await passwordService.comparePassword(old_password, account.passwordHash);
    if (!isCorrect) {
      return res.status(400).json({ success: false, message: "Old password is empty or incorrect" });
    }

    // Hash and update
    const newHash = await passwordService.hashPassword(new_password);

    if (accountType === "user") {
      await User.findByIdAndUpdate(userId, { passwordHash: newHash });
    } else {
      await Vendor.findByIdAndUpdate(userId, { passwordHash: newHash });
    }

    return res.json({
      success: true,
      message: "Password successfully updated"
    });

  } catch (err) {
    next(err);
  }
};

