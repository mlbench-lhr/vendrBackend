const Vendor = require('../models/Vendor');
const passwordService = require('../services/passwordService');
const jwtService = require('../services/jwtService');
const logger = require('../utils/logger');

// EMAIL REGISTRATION
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone, vendor_type } = req.body;

    // Email uniqueness
    const exists = await Vendor.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    // Hash password
    const passwordHash = await passwordService.hashPassword(password);

    const vendor = await Vendor.create({
      name,
      email,
      phone,
      vendor_type,
      passwordHash,
      provider: 'email'
    });

    const payload = { id: vendor._id.toString(), email: vendor.email, role: 'vendor' };

    const accessToken = jwtService.signAccess(payload);
    const refreshToken = jwtService.signRefresh(payload);

    return res.status(201).json({
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
    logger.error('Vendor register error', err);
    next(err);
  }
};

// EMAIL LOGIN
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const vendor = await Vendor.findOne({ email });
    if (!vendor || !vendor.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
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
    const { provider, provider_id, email, name, phone, vendor_type } = req.body;

    let vendor = await Vendor.findOne({ provider, provider_id });

    if (!vendor) {
      vendor = await Vendor.create({
        provider,
        provider_id,
        email,
        name,
        phone: phone || null,
        vendor_type: vendor_type || null
      });
    }

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
        provider_id: vendor.provider_id,
        createdAt: vendor.createdAt
      },
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
