const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const userController = require('../controllers/authController');
const vendorController = require('../controllers/vendorAuthController');
const menuController = require('../controllers/menuController');
const passwordController = require('../controllers/passwordController');

const validateBody = require('../middleware/validate');
const schemas = require('../middleware/validators'); // correct file name

// user auth
router.post('/user/signup-otp', validateBody(schemas.userRegisterSchema), userController.userSignupRequestOtp);
router.post('/user/signup', validateBody(schemas.verifyOtpSchema), userController.userSignupVerify);
router.post('/user/login', validateBody(schemas.userLoginSchema), userController.login);
router.post('/user/oauth', validateBody(schemas.userOauthSchema), userController.oauth);
router.post('/user/refresh', userController.refresh);
router.post('/user/logout', userController.logout);

// vendor auth
router.post('/vendor/signup-otp', validateBody(schemas.vendorRegisterSchema), vendorController.vendorSignupRequestOtp);
router.post('/vendor/signup', validateBody(schemas.verifyOtpSchema), vendorController.vendorSignupVerify);
router.post('/vendor/login', validateBody(schemas.vendorLoginSchema), vendorController.login);
router.post('/vendor/oauth', validateBody(schemas.vendorOauthSchema), vendorController.oauth);
router.post('/vendor/logout', vendorController.logout);
router.post('/vendor/refresh', vendorController.refresh);

//vendor edit profile
router.put('/vendor/edit-profile', auth, upload.single('profile_image'), validateBody(schemas.vendorEditProfileSchema), vendorController.editProfile);

//vendor change phone number request
router.post('/vendor/change-phone/request', auth, validateBody(schemas.vendorRequestPhoneOtpSchema), vendorController.requestPhoneOtp);
router.post('/vendor/change-phone/verify', auth, validateBody(schemas.vendorVerifyPhoneOtpSchema), vendorController.verifyPhoneOtp);
router.put('/vendor/change-phone/update', auth, validateBody(schemas.vendorUpdatePhoneSchema), vendorController.updatePhone);

//vendor change password request
router.post('/change-password', auth, validateBody(schemas.changePasswordSchema), passwordController.changePassword);
router.post('/resend-otp', validateBody(schemas.resendOtpSchema), passwordController.resendOtp);

//vendor change email request
router.post('/vendor/change-email/request', auth, validateBody(schemas.vendorRequestEmailOtpSchema), vendorController.requestEmailOtp);
router.post('/vendor/change-email/verify', auth, validateBody(schemas.vendorVerifyEmailOtpSchema), vendorController.verifyEmailOtp);
router.put('/vendor/change-email/update', auth, validateBody(schemas.vendorUpdateEmailSchema), vendorController.updateEmail);

//vendor menu 
router.post('/vendor/menu/upload', auth, upload.array('images'), validateBody(schemas.menuUploadSchema), menuController.uploadMenu);
router.put('/vendor/menu/edit/:id', auth, upload.array('images'), validateBody(schemas.menuEditSchema), menuController.editMenu);
router.get('/vendor/menu/list', auth, menuController.listMenus);

//vendor hours
router.put('/vendor/hours', auth, validateBody(schemas.vendorHoursSchema), vendorController.setVendorHours);
router.get('/vendor/hours', auth, vendorController.getVendorHours);

//vendor location
router.put('/vendor/location', auth, validateBody(schemas.vendorLocationSchema), vendorController.setLocation);
router.get('/vendor/location', auth, vendorController.getLocation);

// vendor language
router.put('/vendor/language', auth, validateBody(schemas.vendorLanguageSchema), vendorController.setLanguage);
router.get('/vendor/language', auth, vendorController.getLanguage);

//delete vendor account
router.delete('/vendor/delete-account', auth, vendorController.deleteAccount);

// password reset
router.post('/forgot-password', validateBody(schemas.forgotPasswordSchema), passwordController.forgotPassword);
router.post('/verify-otp', validateBody(schemas.verifyOtpSchema), passwordController.verifyOtp);
router.post('/reset-password', validateBody(schemas.resetPasswordSchema), passwordController.resetPassword);



module.exports = router;
