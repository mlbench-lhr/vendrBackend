const jwtService = require('../services/jwtService');

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.slice(7);

  try {
    const decoded = jwtService.verifyAccess(token);

    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
