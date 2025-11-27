const bcrypt = require('bcrypt');
const SALT_ROUNDS = 12;

function validateNewPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be a string with minimum length 8');
  }
}

async function hashPassword(password) {
  validateNewPassword(password);
  return await bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePassword(password, hash) {
  // OAuth user: no stored password
  if (!hash) return false;

  // incoming password must be valid to compare
  if (typeof password !== 'string' || password.length === 0) return false;

  return await bcrypt.compare(password, hash);
}

function generateOtp(length = 4) {
  return Math.floor(
    Math.pow(10, length - 1) +
    Math.random() * (Math.pow(10, length) - Math.pow(10, length - 1))
  ).toString();
}


module.exports = { hashPassword, comparePassword, generateOtp };
