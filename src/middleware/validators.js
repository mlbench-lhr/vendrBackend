const Joi = require('joi');

// USER
exports.userRegisterSchema = () => Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
});

exports.userLoginSchema = () => Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

exports.userOauthSchema = () => Joi.object({
  provider: Joi.string().required(),
  provider_id: Joi.string().required(),
  email: Joi.string().email().required(),
  name: Joi.string().required(),
});

// VENDOR
exports.vendorRegisterSchema = () => Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  phone: Joi.string().required(),
  vendor_type: Joi.string().required(),
  password: Joi.string().min(8).required(),
});

exports.vendorLoginSchema = () => Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

exports.vendorOauthSchema = () => Joi.object({
  provider: Joi.string().required(),
  provider_id: Joi.string().required(),
  email: Joi.string().email().required(),
  name: Joi.string().required(),
  phone: Joi.string().required(),
  vendor_type: Joi.string().required(),
});

// PASSWORD RESET
exports.forgotPasswordSchema = () => Joi.object({
  email: Joi.string().email().required(),
});

exports.verifyOtpSchema = () => Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().required(),
});

exports.resetPasswordSchema = () => Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().required(),
  new_password: Joi.string().min(8).required(),
});
