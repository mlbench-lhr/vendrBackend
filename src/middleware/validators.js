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

exports.vendorEditProfileSchema = () => Joi.object({
  name: Joi.string().required(),
  vendor_type: Joi.string().required(),
  shop_address: Joi.string().required()
});

exports.changePasswordSchema = () => Joi.object({
  old_password: Joi.string().allow(null, ""),
  new_password: Joi.string().min(8).required(),
  confirm_password: Joi.string().valid(Joi.ref("new_password")).required()
});

exports.vendorRequestPhoneOtpSchema = () => Joi.object({
  phone: Joi.string().required(),
});

exports.vendorVerifyPhoneOtpSchema = () => Joi.object({
  phone: Joi.string().required(),
  otp: Joi.string().required(),
});

exports.vendorUpdatePhoneSchema = () => Joi.object({
  new_phone: Joi.string().required(),
});

exports.vendorRequestEmailOtpSchema = () => Joi.object({
  email: Joi.string().email().required()
});

exports.vendorVerifyEmailOtpSchema = () => Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().required()
});

exports.vendorUpdateEmailSchema = () => Joi.object({
  new_email: Joi.string().email().required()
});

exports.menuUploadSchema = () => Joi.object({
  name: Joi.string().required(),
  category: Joi.string().required(),
  description: Joi.string().required(),
  serving: Joi.string().required(),
  price: Joi.number().required()
});

exports.menuEditSchema = () => Joi.object({
  name: Joi.string().required(),
  description: Joi.string().required(),
  serving: Joi.string().required(),
  price: Joi.number().required()
});

exports.vendorHoursSchema = () => Joi.object({
  days: Joi.object({
    monday: Joi.object({
      enabled: Joi.boolean().required(),
      start: Joi.string().allow(null, ""),
      end: Joi.string().allow(null, "")
    }).required(),

    tuesday: Joi.object({
      enabled: Joi.boolean().required(),
      start: Joi.string().allow(null, ""),
      end: Joi.string().allow(null, "")
    }).required(),

    wednesday: Joi.object({
      enabled: Joi.boolean().required(),
      start: Joi.string().allow(null, ""),
      end: Joi.string().allow(null, "")
    }).required(),

    thursday: Joi.object({
      enabled: Joi.boolean().required(),
      start: Joi.string().allow(null, ""),
      end: Joi.string().allow(null, "")
    }).required(),

    friday: Joi.object({
      enabled: Joi.boolean().required(),
      start: Joi.string().allow(null, ""),
      end: Joi.string().allow(null, "")
    }).required(),

    saturday: Joi.object({
      enabled: Joi.boolean().required(),
      start: Joi.string().allow(null, ""),
      end: Joi.string().allow(null, "")
    }).required(),

    sunday: Joi.object({
      enabled: Joi.boolean().required(),
      start: Joi.string().allow(null, ""),
      end: Joi.string().allow(null, "")
    }).required()
  }).required()
});

exports.vendorLocationSchema = () => Joi.object({
  mode: Joi.string().valid('fixed', 'remote').required(),

  fixed_location: Joi.object({
    address: Joi.string().allow(null, ""),
    lat: Joi.number().allow(null),
    lng: Joi.number().allow(null)
  }),

  remote_locations: Joi.array().items(
    Joi.object({
      address: Joi.string().required(),
      lat: Joi.number().required(),
      lng: Joi.number().required()
    })
  ).when('mode', {
    is: 'remote',
    then: Joi.required(),
    otherwise: Joi.optional()
  })
});

exports.vendorLanguageSchema = () => Joi.object({
  language: Joi.string().valid(
    "english",
    "spanish",
    "french",
    "german",
    "chinese",
    "japanese",
    "russian",
    "portuguese",
    "italian",
    "arabic",
    "dutch"
  ).required()
});



