const User = require('../models/User');
const passwordService = require('../services/passwordService');
const jwtService = require('../services/jwtService');
const logger = require('../utils/logger');

/*
|--------------------------------------------------------------------------
| USER REGISTER
|--------------------------------------------------------------------------
*/
async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await passwordService.hashPassword(password);

    const user = await User.create({
      name,
      email,
      passwordHash,
      provider: 'email'
    });

    const payload = { id: user._id.toString(), email: user.email, role: 'user' };

    return res.status(201).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
      },
      tokens: {
        accessToken: jwtService.signAccess(payload),
        refreshToken: jwtService.signRefresh(payload),
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m'
      }
    });
  } catch (err) {
    logger.error('Register error', err);
    next(err);
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
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await passwordService.comparePassword(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = { id: user._id.toString(), email: user.email, role: 'user' };

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
      },
      tokens: {
        accessToken: jwtService.signAccess(payload),
        refreshToken: jwtService.signRefresh(payload),
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m'
      }
    });
  } catch (err) {
    logger.error('Login error', err);
    next(err);
  }
}

/*
|--------------------------------------------------------------------------
| USER OAUTH (Google / Apple)
|--------------------------------------------------------------------------
*/
async function oauth(req, res, next) {
  try {
    const { provider, provider_id, email, name } = req.body;

    let user = await User.findOne({ provider, provider_id });

    if (!user) {
      user = await User.create({
        provider,
        provider_id,
        email,
        name
      });
    }

    const payload = { id: user._id.toString(), email: user.email, role: 'user' };

    return res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt
      },
      tokens: {
        accessToken: jwtService.signAccess(payload),
        refreshToken: jwtService.signRefresh(payload),
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m'
      }
    });

  } catch (err) {
    logger.error('OAuth error', err);
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
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

    let decoded;
    try {
      decoded = jwtService.verifyRefresh(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const payload = { id: user._id.toString(), email: user.email, role: 'user' };

    return res.json({
      tokens: {
        accessToken: jwtService.signAccess(payload),
        refreshToken: jwtService.signRefresh(payload),
        expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m'
      }
    });

  } catch (err) {
    logger.error('Refresh error', err);
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

    if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

    try {
      jwtService.verifyRefresh(refreshToken);
    } catch {
      return res.status(400).json({ error: 'Invalid refresh token' });
    }

    // No blacklist implemented — stateless logout
    return res.json({ message: 'User Logged out' });

  } catch (err) {
    logger.error('Logout error', err);
    next(err);
  }
}

module.exports = { register, login, oauth, refresh, logout };
