const User = require("../models/User");
const PasswordOtp = require("../models/PasswordOtp");
const passwordService = require("../services/passwordService");
const jwtService = require("../services/jwtService");
const logger = require("../utils/logger");
const { generateOtp } = require("../services/passwordService");
const { sendEmail } = require("../emails/sendEmail");
const { OAuth2Client } = require("google-auth-library");
const appleSignin = require("apple-signin-auth");
/*
|--------------------------------------------------------------------------
| USER REGISTER
|--------------------------------------------------------------------------
*/
async function userSignupRequestOtp(req, res, next) {
  try {
    const { name, email, password } = req.body;
    let role = "user";

    const existing = await User.findOne({ email });
    if (existing)
      return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await passwordService.hashPassword(password);

    const user = await User.create({
      name,
      email,
      passwordHash,
      provider: "email",
      verified: false,
    });

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
      user_id: user._id,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "User signup request failed",
      error: err.message,
    });
  }
}

async function userSignupVerify(req, res, next) {
  try {
    const { email, otp } = req.body;
    let role = "user";

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.verified)
      return res.status(400).json({ error: "Already verified" });

    const doc = await PasswordOtp.findOne({ email }).sort({ createdAt: -1 });
    if (doc.role !== role) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }
    if (!doc) return res.status(400).json({ error: "Invalid OTP" });
    if (doc.expires_at < Date.now())
      return res.status(400).json({ error: "OTP expired" });
    if (String(doc.otp).trim() !== String(otp).trim())
      return res.status(400).json({ error: "Incorrect OTP" });

    user.verified = true;
    await user.save();

    await PasswordOtp.deleteOne({ email });

    const payload = {
      id: user._id.toString(),
      email: user.email,
      role: "user",
    };
    const accessToken = jwtService.signAccess(payload);
    const refreshToken = jwtService.signRefresh(payload);

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        verified: user.verified,
        createdAt: user.createdAt,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
      error: err.message,
    });
  }
}

/*
|--------------------------------------------------------------------------
| USER LOGIN
|--------------------------------------------------------------------------
*/
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) return res.status(401).json({ error: "Account not found" });

    const match = await passwordService.comparePassword(
      password,
      user.passwordHash
    );
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    // Block login if not verified
    if (!user.verified) {
      return res.status(403).json({
        success: false,
        message:
          "Your account is not verified. Please verify your email to continue.",
      });
    }

    const payload = {
      id: user._id.toString(),
      email: user.email,
      role: "user",
    };

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
      tokens: {
        accessToken: jwtService.signAccess(payload),
        refreshToken: jwtService.signRefresh(payload),
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
      },
    });
  } catch (err) {
    logger.error("Login error", err);
    next(err);
  }
}

/*
|--------------------------------------------------------------------------
| USER OAUTH (Google / Apple)
|--------------------------------------------------------------------------
*/
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
async function oauth(req, res, next) {
  try {
    const {
      provider,
      provider_id,
      email: emailFromBody,
      name: nameFromBody,
    } = req.body;

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
      name = googlePayload.name || emailFromBody || "";
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

      email = applePayload.email || emailFromBody || null;

      const givenName = applePayload.given_name;
      const familyName = applePayload.family_name;

      if (nameFromBody) {
        name = nameFromBody;
      } else if (givenName || familyName) {
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
      return res
        .status(400)
        .json({ success: false, message: "Email not available from provider" });
    }

    let user = await User.findOne({ provider, provider_id: providerUserId });
    if (!user) {
      user = await User.create({
        provider,
        provider_id: providerUserId,
        email,
        name,
        profile_image,
      });
    }

    const payload = {
      id: user._id.toString(),
      email: user.email,
      role: "user",
    };

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        profile_image: user.profile_image,
      },
      tokens: {
        accessToken: jwtService.signAccess(payload),
        refreshToken: jwtService.signRefresh(payload),
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
      },
    });
  } catch (err) {
    logger.error("OAuth error", err);
    next(err);
  }
}

/*
|--------------------------------------------------------------------------
| REFRESH TOKEN
|--------------------------------------------------------------------------
*/
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ error: "refreshToken required" });

    let decoded;
    try {
      decoded = jwtService.verifyRefresh(refreshToken);
    } catch {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: "User not found" });

    const payload = {
      id: user._id.toString(),
      email: user.email,
      role: "user",
    };

    return res.json({
      tokens: {
        accessToken: jwtService.signAccess(payload),
        refreshToken: jwtService.signRefresh(payload),
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
      },
    });
  } catch (err) {
    logger.error("Refresh error", err);
    next(err);
  }
}

/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/
async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken)
      return res.status(400).json({ error: "refreshToken required" });

    try {
      jwtService.verifyRefresh(refreshToken);
    } catch {
      return res.status(400).json({ error: "Invalid refresh token" });
    }

    // No blacklist implemented — stateless logout
    return res.json({ message: "User Logged out" });
  } catch (err) {
    logger.error("Logout error", err);
    next(err);
  }
}

module.exports = {
  userSignupRequestOtp,
  userSignupVerify,
  login,
  oauth,
  refresh,
  logout,
};
