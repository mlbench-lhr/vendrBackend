const Vendor = require('../models/Vendor');
const User = require('../models/User');
const Menu = require('../models/Menu');
const VendorHours = require('../models/VendorHours');
const VendorLocation = require('../models/VendorLocation');
const VendorReview = require('../models/VendorReview');
const PasswordOtp = require('../models/PasswordOtp');
const passwordService = require('../services/passwordService');
const jwtService = require('../services/jwtService');
const oauthService = require('../services/oauthService');
const logger = require('../utils/logger');
const cloudinary = require('../config/cloudinary');
const { generateOtp } = require('../services/passwordService');
const { sendEmail } = require('../emails/sendEmail');
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

// EMAIL REGISTRATION
exports.vendorSignupRequestOtp = async (req, res, next) => {
  try {
    const { name, email, password, phone, vendor_type } = req.body;
    let role = "vendor";

    // Email uniqueness
    const exists = await Vendor.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await passwordService.hashPassword(password);

    const vendor = await Vendor.create({
      name,
      email,
      phone,
      vendor_type,
      passwordHash,
      provider: "email",
      verified: false
    });

    const otp = generateOtp(4);
    const expires_at = Date.now() + 10 * 60 * 1000;

    await PasswordOtp.findOneAndUpdate(
      { email },
      { email, otp, role, expires_at },
      { upsert: true }
    );

    const otpEmailTemplate = require('../emails/templates/otpEmail');
    await sendEmail(
      email,
      "Signup Verification OTP",
      otpEmailTemplate({ otp, subject: "Verify Your Email" }),
      `Your OTP is ${otp}`
    );

    return res.json({
      success: true,
      message: "OTP sent to email",
      vendor_id: vendor._id
    });

  } catch (err) {
    console.error('Vendor register error', err);
    return res.status(500).json({
      success: false,
      message: "Vendor sign up failed",
      error: err.message
    });
  }
};

exports.vendorSignupVerify = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    const vendor = await Vendor.findOne({ email });
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    if (vendor.verified === true)
      return res.status(400).json({ error: "Already verified" });

    const doc = await PasswordOtp.findOne({ email }).sort({ createdAt: -1 });

    if (doc.role !== "vendor") {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }
    if (!doc) return res.status(400).json({ error: 'Invalid OTP' });
    if (doc.expires_at < Date.now()) return res.status(400).json({ error: 'OTP expired' });
    if (doc.otp !== String(otp)) return res.status(400).json({ error: 'Incorrect OTP' });

    vendor.verified = true;
    await vendor.save();

    await PasswordOtp.deleteOne({ email });

    const payload = { id: vendor._id.toString(), email: vendor.email, role: 'vendor' };
    const accessToken = jwtService.signAccess(payload);
    const refreshToken = jwtService.signRefresh(payload);

    return res.json({
      success: true,
      vendor: {
        id: vendor._id,
        name: vendor.name,
        email: vendor.email,
        phone: vendor.phone,
        vendor_type: vendor.vendor_type,
        provider: vendor.provider,
        verified: vendor.verified
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN
      }
    });
  } catch (err) {
    console.error('Vendor register error', err);
    return res.status(500).json({
      success: false,
      message: "Vendor otp verification and sign up failed",
      error: err.message
    });
  }
};


// EMAIL LOGIN
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const vendor = await Vendor.findOne({ email });
    if (!vendor) return res.status(401).json({ error: 'Account not found' });

    const match = await passwordService.comparePassword(password, vendor.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    // Block login if not verified
    if (!vendor.verified) {
      return res.status(403).json({
        success: false,
        message: "Your account is not verified. Please verify your email to continue."
      });
    }

    const ok = await passwordService.comparePassword(password, vendor.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = { id: vendor._id.toString(), email: vendor.email, role: 'vendor' };

    const accessToken = jwtService.signAccess(payload);
    const refreshToken = jwtService.signRefresh(payload);

    return res.json({
      vendor: {
        id: vendor._id.toString(),
        name: vendor.name,
        email: vendor.email,
        phone: vendor.phone,
        vendor_type: vendor.vendor_type,
        provider: vendor.provider,
        createdAt: vendor.createdAt
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m'
      }
    });
  } catch (err) {
    logger.error('Vendor login error', err);
    next(err);
  }
};

// OAUTH
exports.oauth = async (req, res, next) => {
  try {
    const { provider, token } = req.body;

    let verified;

    if (provider === 'google') {
      verified = await oauthService.verifyGoogleToken(token);
    }
    const provider_id = verified.sub;
    const email = verified.email;
    const name = verified.name;

    let vendor = await Vendor.findOne({ provider, provider_id });

    if (!vendor) {
      vendor = await Vendor.create({
        provider,
        provider_id,
        email,
        name
      });
    }

    const payload = { id: vendor._id.toString(), email: vendor.email, role: 'vendor' };

    const accessToken = jwtService.signAccess(payload);
    const refreshToken = jwtService.signRefresh(payload);

    return res.json({
      vendor,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m'
      }
    });
  } catch (err) {
    logger.error('Vendor OAuth error', err);
    next(err);
  }
};

// LOGOUT
exports.logout = async (req, res) => {
  return res.json({ message: 'Vendor Logged out' });
};

exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken required' });
    }

    let decoded;
    try {
      decoded = jwtService.verifyRefresh(refreshToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const vendor = await Vendor.findById(decoded.userId || decoded.id);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    const payload = {
      id: vendor._id.toString(),
      email: vendor.email,
      role: 'vendor'
    };

    const accessToken = jwtService.signAccess(payload);
    const newRefreshToken = jwtService.signRefresh(payload);

    return res.json({
      success: true,
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m'
      }
    });

  } catch (err) {
    next(err);
  }
};

exports.editProfile = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { name, vendor_type, shop_address, profile_image, lat, lng } = req.body;

    let updateData = { name, vendor_type, shop_address, lat, lng };

    if (profile_image) {
      updateData.profile_image = profile_image;
    }

    // Fetch vendor to get old image public_id
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found"
      });
    }

    // Update vendor record
    const updatedVendor = await Vendor.findByIdAndUpdate(
      vendorId,
      updateData,
      { new: true }
    );

    return res.json({
      success: true,
      message: "Profile updated successfully",
      vendor: updatedVendor
    });

  } catch (err) {
    console.error("Edit Profile Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message
    });
  }
};

// Step 1: Vendor requests OTP to old phone
exports.requestPhoneOtp = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { phone } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    // Old phone must match
    if (vendor.phone !== phone)
      return res.status(400).json({ error: 'Old phone number incorrect' });

    // Generate OTP
    const otp = generateOtp(4);
    const expires_at = Date.now() + 10 * 60 * 1000; // 10 min

    // Store OTP (reuse PasswordOtp collection)
    await PasswordOtp.findOneAndUpdate(
      { email: vendor.email },
      { email: vendor.email, otp, expires_at },
      { upsert: true }
    );

    // Send SMS
    await sendSms(phone, `Your phone change OTP is: ${otp}`);

    return res.json({
      success: true,
      message: 'OTP sent to your phone number'
    });
  } catch (err) {
    next(err);
  }
};

// Step 2: Vendor verifies OTP
exports.verifyPhoneOtp = async (req, res, next) => {
  try {
    const vendorId = req.user.userId;
    const { phone, otp } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    // Must match old phone
    if (vendor.phone !== phone)
      return res.status(400).json({ error: 'Old phone incorrect' });

    const doc = await PasswordOtp.findOne({ email: vendor.email });
    if (!doc) return res.status(400).json({ error: 'OTP invalid' });

    if (doc.expires_at < Date.now())
      return res.status(400).json({ error: 'OTP expired' });

    if (doc.otp !== otp)
      return res.status(400).json({ error: 'OTP incorrect' });

    return res.json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (err) {
    next(err);
  }
};

// Step 3: Vendor updates phone number
exports.updatePhone = async (req, res, next) => {
  try {
    const vendorId = req.user.userId;
    const { new_phone } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    // Ensure new phone isn't used by another vendor
    const exists = await Vendor.findOne({ phone: new_phone });
    if (exists)
      return res.status(409).json({ error: 'Phone already in use' });

    vendor.phone = new_phone;
    await vendor.save();

    // Remove OTP record
    await PasswordOtp.deleteOne({ email: vendor.email });

    return res.json({
      success: true,
      message: 'Phone updated successfully',
      phone: vendor.phone
    });
  } catch (err) {
    next(err);
  }
};

// Step 1: Request OTP to old email
exports.requestEmailOtp = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { email } = req.body;
    let role = "vendor";

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    if (vendor.email !== email)
      return res.status(400).json({ error: 'Old email incorrect' });

    const otp = generateOtp(4);
    const expires_at = Date.now() + 10 * 60 * 1000;

    await PasswordOtp.findOneAndUpdate(
      { email },
      { email, otp, role, expires_at },
      { upsert: true }
    );

    const otpEmailTemplate = require('../emails/templates/otpEmail');
    const subject = "Email Change OTP"
    await sendEmail(
      email,
      "Email Change OTP",
      otpEmailTemplate({ otp, subject }),
      `Your OTP is ${otp}`
    );

    return res.json({ success: true, message: 'OTP sent to your email' });
  } catch (err) {
    console.error("Change Email Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message
    });
  }
};

// Step 2: Verify OTP for old email
exports.verifyEmailOtp = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { email, otp } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    if (vendor.email !== email)
      return res.status(400).json({ error: 'Old email incorrect' });

    const doc = await PasswordOtp.findOne({ email }).sort({ createdAt: -1 });
    if (doc.role !== "vendor") {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP"
      });
    }
    if (!doc) return res.status(400).json({ error: 'OTP invalid' });
    if (doc.expires_at < Date.now()) return res.status(400).json({ error: 'OTP expired' });
    if (doc.otp !== String(otp)) return res.status(400).json({ error: 'OTP incorrect' });

    return res.json({ success: true, message: 'OTP verified successfully' });
  } catch (err) {
    console.error("Change Email Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message
    });
  }
};

// Step 3: Update email after OTP verification
exports.updateEmail = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { new_email } = req.body;

    const vendor = await Vendor.findById(vendorId);
    const oldEmail = vendor.email;
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const exists = await Vendor.findOne({ email: new_email });
    if (exists) return res.status(409).json({ error: 'Email already in use' });

    vendor.email = new_email;
    await vendor.save();

    await PasswordOtp.deleteOne({ email: oldEmail });
    return res.json({
      success: true,
      message: 'Email updated successfully',
      email: vendor.email
    });
  } catch (err) {
    console.error("Change Email Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message
    });
  }
};

//set vendor hours
exports.setVendorHours = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { days } = req.body;

    // Validate that days object exists
    if (!days) {
      return res.status(400).json({ success: false, message: "Days object is required" });
    }

    // Use $set to update only the fields provided
    const updated = await VendorHours.findOneAndUpdate(
      { vendor_id: vendorId },
      { $set: { vendor_id: vendorId, days, updated_at: Date.now() } },
      { upsert: true, new: true }
    );

    const vendor = await Vendor.findById(vendorId).select(
      "name profile_image vendor_type shop_address email phone"
    );

    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    // Merge hours into vendor object
    const vendorWithHours = {
      ...vendor.toObject(),
      hours: updated
    };

    return res.json({
      success: true,
      vendor: vendorWithHours
    });
  } catch (err) {
    console.error("Set vendor hours Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message
    });
  }
};

//get vendor hours
exports.getVendorHours = async (req, res, next) => {
  try {
    const vendorId = req.user.id;

    const hours = await VendorHours.findOne({ vendor_id: vendorId });
    return res.json({ success: true, hours });
  } catch (err) {
    console.error("Get vendor hours Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message
    });
  }
};

//set location
exports.setLocation = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { mode, fixed_location, remote_locations } = req.body;

    const update = {
      vendor_id: vendorId,
      mode,
      updated_at: Date.now()
    };

    if (mode === 'fixed') {
      update.fixed_location = fixed_location;
      update.remote_locations = [];
    }

    if (mode === 'remote') {
      update.fixed_location = null;
      update.remote_locations = remote_locations;
    }

    const result = await VendorLocation.findOneAndUpdate(
      { vendor_id: vendorId },
      update,
      { upsert: true, new: true }
    );

    return res.json({ success: true, location: result });
  } catch (err) {
    console.error("Set vendor Location Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message
    });
  }
};

//get location
exports.getLocation = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const loc = await VendorLocation.findOne({ vendor_id: vendorId });
    return res.json({ success: true, location: loc });
  } catch (err) {
    console.error("Get vendor Location Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message
    });
  }
};

//set language
exports.setLanguage = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { language } = req.body;

    const updated = await Vendor.findByIdAndUpdate(
      vendorId,
      { language },
      { new: true }
    );

    return res.json({ success: true, language: updated.language });
  } catch (err) {
    console.error("Set vendor Language Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message
    });
  }
};

// get language
exports.getLanguage = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const vendor = await Vendor.findById(vendorId).select("language");
    return res.json({ success: true, language: vendor.language });
  } catch (err) {
    console.error("Get vendor Language Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message
    });
  }
};

//get vendor profile
exports.getVendorProfile = async (req, res, next) => {
  try {
    const vendorId = req.user.id; // vendor authenticated ID

    // 1. Vendor Basic Info
    const vendor = await Vendor.findById(vendorId).select(
      "name profile_image vendor_type shop_address email phone lat lng"
    );

    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    // 2. Vendor Location
    const location = await VendorLocation.findOne({ vendor_id: vendorId });

    // 3. Vendor Hours
    const hours = await VendorHours.findOne({ vendor_id: vendorId });

    // 4. Vendor Menus
    const menus = await Menu.find({ vendor_id: vendorId });

    // 5. Vendor Reviews + User Info
    let reviews = await VendorReview.find({ vendor_id: vendorId }).sort({ created_at: -1 }).limit(2)
      .lean();

    const total_reviews = reviews.length;
    const average_rating = total_reviews > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / total_reviews).toFixed(1)
      : 0;

    reviews = await Promise.all(
      reviews.map(async (r) => {
        let userData = null;

        if (r && r.user_id) {
          userData = await User.findById(r.user_id).select("name profile_image");
        }

        return {
          _id: r._id,
          rating: r.rating,
          message: r.message,
          created_at: r.created_at,
          user: {
            name: userData?.name || r.user_name || "Deleted User",
            profile_image: userData?.profile_image || r.user_profile_image || null
          }
        };
      })
    );

    const vendorProfile = {
      ...vendor.toObject(),
      hours,
      menus,
      location,
      reviews: {
        average_rating: Number(average_rating),
        total_reviews,
        reviews: reviews
      }
    };

    return res.json({
      success: true,
      vendor: vendorProfile,
    });

  } catch (error) {
    next(error);
  }
};

//delete account
exports.deleteAccount = async (req, res, next) => {
  try {
    const vendorId = req.user.id;

    await Promise.all([
      Vendor.deleteOne({ _id: vendorId }),
      Menu.deleteMany({ vendor_id: vendorId }),
      VendorHours.deleteMany({ vendor_id: vendorId }),
      VendorLocation.deleteMany({ vendor_id: vendorId })
    ]);

    return res.json({ success: true, message: "Account deleted" });
  } catch (err) {
    console.error("Delete vendor Account Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message
    });
  }
};

//get all reviews
exports.getVendorAllReviews = async (req, res, next) => {
  try {
    const vendorId = req.user.id; // vendor logged in

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Stats
    const stats = await VendorReview.aggregate([
      { $match: { vendor_id: new ObjectId(vendorId) } },
      {
        $group: {
          _id: null,
          average_rating: { $avg: "$rating" },
          total_reviews: { $sum: 1 }
        }
      }
    ]);

    const average_rating = stats.length ? stats[0].average_rating : 0;
    const total_reviews = stats.length ? stats[0].total_reviews : 0;

    // Paginated reviews
    const reviewsList = await VendorReview.find({ vendor_id: vendorId })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const reviews = await Promise.all(
      reviewsList.map(async (r) => {
        let user = null;

        if (r.user_id) {
          user = await User.findById(r.user_id).select("name profile_image").lean();
        }

        return {
          _id: r._id,
          rating: r.rating,
          message: r.message,
          created_at: r.created_at,
          user: {
            name: user?.name || r.user_name || "Deleted User",
            profile_image: user?.profile_image || r.user_profile_image || null
          }
        };
      })
    );

    return res.json({
      success: true,
      vendor_id: vendorId,
      average_rating: Number(average_rating.toFixed(1)),
      total_reviews,
      page,
      limit,
      reviews
    });

  } catch (err) {
    next(err);
  }
};

