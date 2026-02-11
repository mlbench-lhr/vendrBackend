const jwt = require('jsonwebtoken');

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not defined`);
  return v;
}

// secrets
const ACCESS_SECRET = () => getEnv('JWT_ACCESS_SECRET');
const REFRESH_SECRET = () => getEnv('JWT_REFRESH_SECRET');

// expiry
const ACCESS_EXPIRES = () => process.env.ACCESS_TOKEN_EXPIRES_IN || '30d';
const REFRESH_EXPIRES = () => process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

// payload must contain: id, email, role
function validatePayload(payload) {
  if (!payload) throw new Error('Missing payload');
  if (!payload.id) throw new Error('Payload missing id');
  if (!payload.email) throw new Error('Payload missing email');
  if (!payload.role) throw new Error('Payload missing role');
}

function signAccess(payload) {
  validatePayload(payload);
  return jwt.sign(payload, ACCESS_SECRET(), { expiresIn: ACCESS_EXPIRES() });
}

function signRefresh(payload) {
  validatePayload(payload);
  return jwt.sign(payload, REFRESH_SECRET(), { expiresIn: REFRESH_EXPIRES() });
}

function verifyAccess(token) {
  if (!token) throw new Error('Token required');
  return jwt.verify(token, ACCESS_SECRET());
}

function verifyRefresh(token) {
  if (!token) throw new Error('Token required');
  return jwt.verify(token, REFRESH_SECRET());
}

module.exports = {
  signAccess,
  signRefresh,
  verifyAccess,
  verifyRefresh,
};
