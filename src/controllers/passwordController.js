const PasswordOtp = require("../models/PasswordOtp");
const User = require("../models/User");
const Vendor = require("../models/Vendor");
const passwordService = require("../services/passwordService");
const { generateOtp } = require("../services/passwordService");
const { sendEmail } = require("../emails/sendEmail");
const bcrypt = require("bcrypt");

const OTP_TTL = parseInt(process.env.OTP_TTL_MINUTES || "10", 10) * 60 * 1000;

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email, is_user } = req.body;
    // Check if email exists in User OR Vendor

    let account = null;
    let role = null;
    if (is_user === true) {
      account = await User.findOne({ email });
      role = "user";
    } else {
      account = await Vendor.findOne({ email });
      role = "vendor";
    }

    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    const otp = generateOtp(4);
    const expires_at = Date.now() + OTP_TTL;
    await PasswordOtp.findOneAndUpdate(
      { email },
      { email, otp, role, expires_at },
      { upsert: true, new: true }
    );
    const otpEmailTemplate = require("../emails/templates/otpEmail");
    const subject = "Password Reset OTP";

    await sendEmail(
      email,
      "Password Reset OTP",
      otpEmailTemplate({ otp, subject }),
      `Your OTP is ${otp}`
    );
    return res.json({ success: true, message: "OTP sent to email" });
  } catch (err) {
    next(err);
  }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const { email, otp, is_user } = req.body;

    const expectedRole = is_user ? "user" : "vendor";

    const doc = await PasswordOtp.findOne({ email }).sort({ createdAt: -1 });

    if (!doc) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    if (doc.role !== expectedRole) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
    if (doc.expires_at < Date.now())
      return res.status(400).json({ success: false, message: "OTP expired" });

    if (doc.otp !== String(otp))
      return res.status(400).json({ success: false, message: "Invalid OTP" });

    return res.json({ success: true, message: "OTP verified" });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { email, otp, new_password, is_user } = req.body;

    const expectedRole = is_user ? "user" : "vendor";

    const doc = await PasswordOtp.findOne({ email }).sort({ createdAt: -1 });

    if (!doc) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
    if (doc.role !== expectedRole) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (!doc || doc.otp !== String(otp) || doc.expires_at < Date.now()) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }
    const hash = await passwordService.hashPassword(new_password);
    let updatedUser;
    if (expectedRole === "user") {
      const user = await User.findOne({ email });
      if (!user) {
        await PasswordOtp.deleteOne({ email });
        return res.status(404).json({
          success: false,
          message: "Account not found",
        });
      }
      updatedUser = await User.updateOne({ email }, { passwordHash: hash });
    } else {
      const vendor = await Vendor.findOne({ email });
      if (!vendor) {
        await PasswordOtp.deleteOne({ email });
        return res.status(404).json({
          success: false,
          message: "Account not found",
        });
      }
      updatedVendor = await Vendor.updateOne({ email }, { passwordHash: hash });
    }

    await PasswordOtp.deleteOne({ email });

    return res.json({
      success: true,
      message: "Password updated",
      user: updatedUser || updatedVendor,
    });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;
    const userId = req.user.id;
    const role = req.user.role;

    // Try user first
    let account;
    if (role === "user") {
      account = await User.findById(userId);
    } else if (role === "vendor") {
      account = await Vendor.findById(userId);
    }

    if (!account) {
      return res
        .status(404)
        .json({ success: false, message: "Account not found" });
    }

    // CASE 1: OAuth user (no password exists)
    if (!account.passwordHash) {
      const newHash = await passwordService.hashPassword(new_password);

      if (role === "user") {
        await User.findByIdAndUpdate(userId, { passwordHash: newHash });
      } else {
        await Vendor.findByIdAndUpdate(userId, { passwordHash: newHash });
      }

      return res.json({
        success: true,
        message: "Password set successfully",
      });
    }

    // CASE 2: Normal user (must validate old password)
    const isCorrect = await passwordService.comparePassword(
      old_password,
      account.passwordHash
    );
    if (!isCorrect) {
      return res.status(400).json({
        success: false,
        message: "Old password is empty or incorrect",
      });
    }

    // Hash and update
    const newHash = await passwordService.hashPassword(new_password);

    if (role === "user") {
      await User.findByIdAndUpdate(userId, { passwordHash: newHash });
    } else {
      await Vendor.findByIdAndUpdate(userId, { passwordHash: newHash });
    }

    return res.json({
      success: true,
      message: "Password successfully updated",
    });
  } catch (err) {
    next(err);
  }
};

exports.resendOtp = async (req, res, next) => {
  try {
    const { email, is_user } = req.body;

    let account = null;
    let role = null;

    if (is_user === true) {
      account = await User.findOne({ email });
      role = "user";
    } else {
      account = await Vendor.findOne({ email });
      role = "vendor";
    }
    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    const otp = generateOtp(4);
    const expires_at = Date.now() + OTP_TTL;

    await PasswordOtp.findOneAndUpdate(
      { email },
      { email, otp, role, expires_at },
      { upsert: true, new: true }
    );

    const otpEmailTemplate = require("../emails/templates/otpEmail");
    const subject = "Your OTP Code";

    await sendEmail(
      email,
      subject,
      otpEmailTemplate({ otp, subject }),
      `Your OTP is ${otp}`
    );

    return res.json({ success: true, message: "OTP resent to email" });
  } catch (err) {
    next(err);
  }
};
