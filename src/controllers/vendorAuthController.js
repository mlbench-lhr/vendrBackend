const Vendor = require("../models/Vendor");
const User = require("../models/User");
const Menu = require("../models/Menu");
const VendorHours = require("../models/VendorHours");
const VendorLocation = require("../models/VendorLocation");
const VendorReview = require("../models/VendorReview");
const PasswordOtp = require("../models/PasswordOtp");
const passwordService = require("../services/passwordService");
const jwtService = require("../services/jwtService");
const oauthService = require("../services/oauthService");
const logger = require("../utils/logger");
const cloudinary = require("../config/cloudinary");
const { generateOtp } = require("../services/passwordService");
const { sendEmail } = require("../emails/sendEmail");
const mongoose = require("mongoose");
const { OAuth2Client } = require("google-auth-library");
const appleSignin = require("apple-signin-auth");
const ObjectId = mongoose.Types.ObjectId;
const { notifyUsersNearVendor } = require("../services/notificationService");

function getDecodedAccessUser(req) {
  const header = req.headers?.authorization;
  if (!header || typeof header !== "string" || !header.startsWith("Bearer "))
    return null;
  const token = header.slice(7);
  try {
    const decoded = jwtService.verifyAccess(token);
    return {
      id: decoded?.id || decoded?.userId,
      email: decoded?.email,
      role: decoded?.role,
    };
  } catch {
    return null;
  }
}

function toFiniteNumberOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// EMAIL REGISTRATION
exports.vendorSignupRequestOtp = async (req, res, next) => {
  try {
    const { name, email, password, phone, vendor_type, has_permit, with_permit } = req.body;
    let role = "vendor";

    // Email uniqueness
    const exists = await Vendor.findOne({ email });
    if (exists)
      return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await passwordService.hashPassword(password);

    const vendorCreateData = {
      name,
      email,
      phone,
      vendor_type,
      passwordHash,
      provider: "email",
      verified: false,
    };
    if (has_permit !== undefined) vendorCreateData.has_permit = has_permit;
    if (with_permit !== undefined) vendorCreateData.with_permit = with_permit;
    const vendor = await Vendor.create(vendorCreateData);

    const otp = generateOtp(4);
    const expires_at = Date.now() + 10 * 60 * 1000;

    await PasswordOtp.findOneAndUpdate(
      { email },
      { email, otp, role, expires_at },
      { upsert: true }
    );

    const otpEmailTemplate = require("../emails/templates/otpEmail");
    await sendEmail(
      email,
      "Signup Verification OTP",
      otpEmailTemplate({ otp, subject: "Verify Your Email" }),
      `Your OTP is ${otp}`
    );

    return res.json({
      success: true,
      message: "OTP sent to email",
      vendor_id: vendor._id,
      has_permit: vendor.has_permit,
      with_permit: vendor.with_permit,
    });
  } catch (err) {
    console.error("Vendor register error", err);
    return res.status(500).json({
      success: false,
      message: "Vendor sign up failed",
      error: err.message,
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
        message: "Invalid OTP",
      });
    }
    if (!doc) return res.status(400).json({ error: "Invalid OTP" });
    if (doc.expires_at < Date.now())
      return res.status(400).json({ error: "OTP expired" });
    if (doc.otp !== String(otp))
      return res.status(400).json({ error: "Incorrect OTP" });

    vendor.verified = true;
    await vendor.save();

    await PasswordOtp.deleteOne({ email });

    if (vendor.lat != null && vendor.lng != null) {
      try {
        await notifyUsersNearVendor(vendor);
      } catch (e) { }
    } else {
      try {
        const loc = await VendorLocation.findOne({ vendor_id: vendor._id }).lean();
        const fixed = loc?.fixed_location;
        if (fixed?.lat != null && fixed?.lng != null) {
          const v = { _id: vendor._id, name: vendor.name, lat: fixed.lat, lng: fixed.lng };
          await notifyUsersNearVendor(v);
        }
      } catch (e) { }
    }

    const payload = {
      id: vendor._id.toString(),
      email: vendor.email,
      role: "vendor",
    };
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
        verified: vendor.verified,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN,
      },
    });
  } catch (err) {
    console.error("Vendor register error", err);
    return res.status(500).json({
      success: false,
      message: "Vendor otp verification and sign up failed",
      error: err.message,
    });
  }
};

// EMAIL LOGIN
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const vendor = await Vendor.findOne({ email });
    if (!vendor) return res.status(401).json({ error: "Account not found" });

    const match = await passwordService.comparePassword(
      password,
      vendor.passwordHash
    );
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    // Block login if not verified
    if (!vendor.verified) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is not verified. Please verify your email to continue.",
      });
    }

    const ok = await passwordService.comparePassword(
      password,
      vendor.passwordHash
    );
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const payload = {
      id: vendor._id.toString(),
      email: vendor.email,
      role: "vendor",
    };

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
        createdAt: vendor.createdAt,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
      },
    });
  } catch (err) {
    logger.error("Vendor login error", err);
    next(err);
  }
};

// OAUTH
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
exports.oauth = async (req, res, next) => {
  try {
    const { provider, provider_id } = req.body;

    let email;
    let name;
    let profile_image = null;
    let providerUserId;

    if (provider === "google") {
      const ticket = await googleClient.verifyIdToken({
        idToken: provider_id,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const googlePayload = ticket.getPayload();
      if (!googlePayload) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid Google token" });
      }

      email = googlePayload.email;
      name = googlePayload.name || "";
      profile_image = googlePayload.picture || null;
      providerUserId = googlePayload.sub;
    } else if (provider === "apple") {
      const applePayload = await appleSignin.verifyIdToken(provider_id, {
        audience: process.env.APPLE_CLIENT_ID,
        ignoreExpiration: false,
      });

      if (!applePayload) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid Apple token" });
      }

      email = applePayload.email || null;

      const givenName = applePayload.given_name;
      const familyName = applePayload.family_name;

      if (givenName || familyName) {
        name = [givenName, familyName].filter(Boolean).join(" ");
      } else if (email) {
        name = email.split("@")[0];
      } else {
        name = "";
      }

      profile_image = null;
      providerUserId = applePayload.sub;
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Unsupported provider" });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email not available from provider",
      });
    }

    let user = await Vendor.findOne({ provider, provider_id: providerUserId });
    if (!user) {
      user = await Vendor.findOne({ email });
      if (user) {
        user.provider = provider;
        user.provider_id = providerUserId;
        if (!user.name && name) {
          user.name = name;
        }
        if (!user.profile_image && profile_image) {
          user.profile_image = profile_image;
        }
        await user.save();
      } else {
        user = await Vendor.create({
          provider,
          provider_id: providerUserId,
          email,
          name,
          profile_image,
          vendor_type: "Other",
        });
      }
    }

    const payload = {
      id: user._id.toString(),
      email: user.email,
      role: "vendor",
    };

    return res.json({
      success: true,
      vendor: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        profile_image: user.profile_image,
        vendor_type: user.vendor_type,
      },
      tokens: {
        accessToken: jwtService.signAccess(payload),
        refreshToken: jwtService.signRefresh(payload),
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
      },
    });
  } catch (err) {
    logger.error("Vendor OAuth error", err);
    next(err);
  }
};

// LOGOUT
exports.logout = async (req, res) => {
  return res.json({ message: "Vendor Logged out" });
};

exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "refreshToken required" });
    }

    let decoded;
    try {
      decoded = jwtService.verifyRefresh(refreshToken);
    } catch (err) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const vendor = await Vendor.findById(decoded.userId || decoded.id);
    if (!vendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const payload = {
      id: vendor._id.toString(),
      email: vendor.email,
      role: "vendor",
    };

    const accessToken = jwtService.signAccess(payload);
    const newRefreshToken = jwtService.signRefresh(payload);

    return res.json({
      success: true,
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.editProfile = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { name, vendor_type, shop_address, profile_image, lat, lng, phone, has_permit, with_permit } = req.body;

    const updateData = { name, vendor_type, shop_address };
    if (lat !== undefined) updateData.lat = lat;
    if (lng !== undefined) updateData.lng = lng;
    if (profile_image) updateData.profile_image = profile_image;
    if (phone !== undefined && (phone === null || phone === "")) updateData.phone = null;
    if (has_permit !== undefined) updateData.has_permit = has_permit;
    if (with_permit !== undefined) updateData.with_permit = with_permit;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    // Update vendor record
    const updatedVendor = await Vendor.findByIdAndUpdate(vendorId, updateData, {
      new: true,
    });

    const coordsChanged =
      (lat !== undefined || lng !== undefined) &&
      updatedVendor &&
      updatedVendor.lat != null &&
      updatedVendor.lng != null &&
      (vendor.lat !== updatedVendor.lat || vendor.lng !== updatedVendor.lng);

    if (coordsChanged) {
      try { await notifyUsersNearVendor(updatedVendor); } catch (e) { }
    }

    return res.json({
      success: true,
      message: "Profile updated successfully",
      vendor: updatedVendor,
      
    });
  } catch (err) {
    console.error("Edit Profile Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
    });
  }
};

// Step 1: Vendor requests OTP to old phone
exports.requestPhoneOtp = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { phone } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    // Old phone must match
    if (vendor.phone !== phone)
      return res.status(400).json({ error: "Old phone number incorrect" });

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
      message: "OTP sent to your phone number",
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
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    // Must match old phone
    if (vendor.phone !== phone)
      return res.status(400).json({ error: "Old phone incorrect" });

    const doc = await PasswordOtp.findOne({ email: vendor.email });
    if (!doc) return res.status(400).json({ error: "OTP invalid" });

    if (doc.expires_at < Date.now())
      return res.status(400).json({ error: "OTP expired" });

    if (doc.otp !== otp)
      return res.status(400).json({ error: "OTP incorrect" });

    return res.json({
      success: true,
      message: "OTP verified successfully",
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
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    // Ensure new phone isn't used by another vendor
    const exists = await Vendor.findOne({ phone: new_phone });
    if (exists) return res.status(409).json({ error: "Phone already in use" });

    vendor.phone = new_phone;
    await vendor.save();

    // Remove OTP record
    await PasswordOtp.deleteOne({ email: vendor.email });

    return res.json({
      success: true,
      message: "Phone updated successfully",
      phone: vendor.phone,
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
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    if (vendor.email !== email)
      return res.status(400).json({ error: "Old email incorrect" });

    const otp = generateOtp(4);
    const expires_at = Date.now() + 10 * 60 * 1000;

    await PasswordOtp.findOneAndUpdate(
      { email },
      { email, otp, role, expires_at },
      { upsert: true }
    );

    const otpEmailTemplate = require("../emails/templates/otpEmail");
    const subject = "Email Change OTP";
    await sendEmail(
      email,
      "Email Change OTP",
      otpEmailTemplate({ otp, subject }),
      `Your OTP is ${otp}`
    );

    return res.json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    console.error("Change Email Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
    });
  }
};

// Step 2: Verify OTP for old email
exports.verifyEmailOtp = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { email, otp } = req.body;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    if (vendor.email !== email)
      return res.status(400).json({ error: "Old email incorrect" });

    const doc = await PasswordOtp.findOne({ email }).sort({ createdAt: -1 });
    if (doc.role !== "vendor") {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }
    if (!doc) return res.status(400).json({ error: "OTP invalid" });
    if (doc.expires_at < Date.now())
      return res.status(400).json({ error: "OTP expired" });
    if (doc.otp !== String(otp))
      return res.status(400).json({ error: "OTP incorrect" });

    return res.json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    console.error("Change Email Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
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
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const exists = await Vendor.findOne({ email: new_email });
    if (exists) return res.status(409).json({ error: "Email already in use" });

    vendor.email = new_email;
    await vendor.save();

    await PasswordOtp.deleteOne({ email: oldEmail });
    return res.json({
      success: true,
      message: "Email updated successfully",
      email: vendor.email,
    });
  } catch (err) {
    console.error("Change Email Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
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
      return res
        .status(400)
        .json({ success: false, message: "Days object is required" });
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
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    // Merge hours into vendor object
    const vendorWithHours = {
      ...vendor.toObject(),
      hours: updated,
    };

    return res.json({
      success: true,
      vendor: vendorWithHours,
    });
  } catch (err) {
    console.error("Set vendor hours Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
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
      error: err.message,
    });
  }
};

//set location
exports.setLocation = async (req, res, next) => {
  try {
    const vendorId = req.user.id;
    const { mode, fixed_location, remote_locations } = req.body;

    const prev = await VendorLocation.findOne({ vendor_id: vendorId }).lean();

    const update = {
      vendor_id: vendorId,
      mode,
      updated_at: Date.now(),
    };

    if (mode === "fixed") {
      update.fixed_location = fixed_location;
      update.remote_locations = [];
    }

    if (mode === "remote") {
      update.fixed_location = null;
      update.remote_locations = remote_locations;
    }

    const result = await VendorLocation.findOneAndUpdate(
      { vendor_id: vendorId },
      update,
      { upsert: true, new: true }
    );

    if (mode === "fixed" && result?.fixed_location?.lat != null && result?.fixed_location?.lng != null) {
      const prevFixed = prev?.fixed_location;
      const changed =
        prev?.mode !== "fixed" ||
        prevFixed?.lat !== result.fixed_location.lat ||
        prevFixed?.lng !== result.fixed_location.lng;

      if (changed) {
        const vendor = await Vendor.findById(vendorId).select("name");
        const v = { _id: vendor._id, name: vendor.name, lat: result.fixed_location.lat, lng: result.fixed_location.lng };
        try { await notifyUsersNearVendor(v); } catch (e) { }
      }
    }

    return res.json({ success: true, location: result });
  } catch (err) {
    console.error("Set vendor Location Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
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
      error: err.message,
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
      error: err.message,
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
      error: err.message,
    });
  }
};
exports.updateFcmDeviceToken = async (req, res) => {
  try {
    const decodedUser = getDecodedAccessUser(req);
    const {
      userId,
      user_id,
      vendorId,
      vendor_id,
      id,
      token,
      fcmToken,
      fcm_token,
      lat,
      lng,
    } = req.body;

    const resolvedVendorId =
      userId || user_id || vendorId || vendor_id || id || decodedUser?.id;
    const resolvedEmail = decodedUser?.email;
    const resolvedToken = token || fcmToken || fcm_token;
    const resolvedLat = toFiniteNumberOrNull(lat);
    const resolvedLng = toFiniteNumberOrNull(lng);

    if (!resolvedVendorId && !resolvedEmail) {
      return res
        .status(400)
        .json({ success: false, message: "vendorId or email required" });
    }

    const vendor =
      (resolvedVendorId ? await Vendor.findById(resolvedVendorId) : null) ||
      (resolvedEmail ? await Vendor.findOne({ email: resolvedEmail }) : null);

    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    // update lat/lng only if provided (not undefined)
    if (resolvedLat !== undefined) vendor.lat = resolvedLat;
    if (resolvedLng !== undefined) vendor.lng = resolvedLng;

    if (resolvedToken) {
      if (!Array.isArray(vendor.fcmDeviceTokens)) {
        vendor.fcmDeviceTokens = [];
      }

      if (!vendor.fcmDeviceTokens.includes(resolvedToken)) {
        vendor.fcmDeviceTokens.push(resolvedToken);
      }
    }

    await vendor.save();

    if (
      resolvedLat !== undefined &&
      resolvedLng !== undefined &&
      vendor.lat != null &&
      vendor.lng != null
    ) {
      try {
        await notifyUsersNearVendor(vendor);
      } catch (e) {}
    }

    return res.json({
      success: true,
      user: vendor.toObject(),
    });
  } catch (err) {
    console.error("Error updating FCM token:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
    });
  }
};

//get vendor profile
exports.getVendorProfile = async (req, res, next) => {
  try {
    const vendorId = req.user.id; // vendor authenticated ID

    // 1. Vendor Basic Info
    const vendor = await Vendor.findById(vendorId).select(
      "name profile_image vendor_type shop_address email phone lat lng has_permit with_permit"
    );

    if (!vendor) {
      return res
        .status(404)
        .json({ success: false, message: "Vendor not found" });
    }

    // 2. Vendor Location
    const location = await VendorLocation.findOne({ vendor_id: vendorId });

    // 3. Vendor Hours
    const hours = await VendorHours.findOne({ vendor_id: vendorId });

    // 4. Vendor Menus
    const menus = await Menu.find({ vendor_id: vendorId });

    // 5. Vendor Reviews + User Info
    let reviews = await VendorReview.find({ vendor_id: vendorId })
      .sort({ created_at: -1 })
      .limit(2)
      .lean();

    const total_reviews = reviews.length;
    const average_rating =
      total_reviews > 0
        ? (
          reviews.reduce((sum, r) => sum + r.rating, 0) / total_reviews
        ).toFixed(1)
        : 0;

    reviews = await Promise.all(
      reviews.map(async (r) => {
        let userData = null;

        if (r && r.user_id) {
          userData = await User.findById(r.user_id).select(
            "name profile_image"
          );
        }

        return {
          _id: r._id,
          rating: r.rating,
          message: r.message,
          created_at: r.created_at,
          user: {
            name: userData?.name || r.user_name || "Deleted User",
            profile_image:
              userData?.profile_image || r.user_profile_image || null,
          },
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
        reviews: reviews,
      },
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
      VendorLocation.deleteMany({ vendor_id: vendorId }),
    ]);

    return res.json({ success: true, message: "Account deleted" });
  } catch (err) {
    console.error("Delete vendor Account Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
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
          total_reviews: { $sum: 1 },
        },
      },
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
          user = await User.findById(r.user_id)
            .select("name profile_image")
            .lean();
        }

        return {
          _id: r._id,
          rating: r.rating,
          message: r.message,
          created_at: r.created_at,
          user: {
            name: user?.name || r.user_name || "Deleted User",
            profile_image: user?.profile_image || r.user_profile_image || null,
          },
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
      reviews,
    });
  } catch (err) {
    next(err);
  }
};
