const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const vendorController = require('../controllers/vendorAuthController');
const menuController = require('../controllers/menuController');
const passwordController = require('../controllers/passwordController');
const reviewController = require('../controllers/vendorReviewController');
const uploadController = require('../controllers/uploadController');
const favoriteController = require('../controllers/favoriteController');
const notificationController = require('../controllers/notificationController');

const validateBody = require('../middleware/validate');
const validateParams = require('../middleware/validateParams');
const schemas = require('../middleware/validators'); // correct file name

// POST /api/upload/image
router.post('/image', upload.single('image'), uploadController.uploadImage);

// user auth
router.post('/user/signup-otp', validateBody(schemas.userRegisterSchema), authController.userSignupRequestOtp);
router.post('/user/signup', validateBody(schemas.verifyOtpSchema), authController.userSignupVerify);
router.post('/user/login', validateBody(schemas.userLoginSchema), authController.login);
router.post('/user/oauth', validateBody(schemas.userOauthSchema), authController.oauth);
router.post('/user/refresh', authController.refresh);
router.post('/user/logout', authController.logout);

router.get('/user/profile', auth, userController.getUserProfile);
router.get('/user/nearby-vendors', auth, userController.getNearbyVendors);
router.get('/user/nearby-vendors-realtime', auth, userController.getNearbyVendorsRealtime);
router.get('/vendors/search', auth, userController.searchVendors);
router.get("/vendor/:vendorId/details", auth, userController.getVendorDetails);
router.get('/menus/vendor/:vendor_id', auth, menuController.getMenusByVendor);
router.put('/user/edit-profile', auth, validateBody(schemas.userEditProfileSchema), userController.editProfile);

// user language
router.put('/user/language', auth, validateBody(schemas.userLanguageSchema), userController.setLanguage);
router.get('/user/language', auth, userController.getLanguage);

router.post('/reviews', auth, validateBody(schemas.addVendorReviewSchema), reviewController.addReview);
router.delete('/reviews/:id', auth, validateParams(schemas.deleteVendorReviewSchema), reviewController.deleteReview);
router.get('/reviews/:vendorId', validateParams(schemas.getVendorReviewsSchema), reviewController.getReviews);
router.post('/user/save-token', userController.updateFcmDeviceToken);

//delete user account
router.delete('/user/delete-account', auth, userController.deleteAccount);

// vendor auth
router.post('/vendor/signup-otp', validateBody(schemas.vendorRegisterSchema), vendorController.vendorSignupRequestOtp);
router.post('/vendor/signup', validateBody(schemas.verifyOtpSchema), vendorController.vendorSignupVerify);
router.post('/vendor/login', validateBody(schemas.vendorLoginSchema), vendorController.login);
router.post('/vendor/oauth', validateBody(schemas.vendorOauthSchema), vendorController.oauth);
router.post('/vendor/logout', vendorController.logout);
router.post('/vendor/refresh', vendorController.refresh);

//get vendor profile
router.get('/vendor/profile', auth, vendorController.getVendorProfile);
router.post('/vendor/save-token', vendorController.updateFcmDeviceToken);
router.get('/vendor/reviews', auth, vendorController.getVendorAllReviews);

//vendor edit profile
router.put('/vendor/edit-profile', auth, validateBody(schemas.vendorEditProfileSchema), vendorController.editProfile);

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
router.post('/vendor/menu/upload', auth, validateBody(schemas.menuUploadSchema), menuController.uploadMenu);
router.put('/vendor/menu/edit/:id', auth, validateBody(schemas.menuEditSchema), menuController.editMenu);
router.delete('/vendor/menu/:id', auth, menuController.deleteMenu);
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

// seed sample notifications
router.post("/notifications/seed", notificationController.seedSampleNotifications);

// get notifications for logged-in vendor or user
router.get("/notifications", auth, notificationController.getNotifications);
router.get("/notifications/unread-count", auth, notificationController.getUnreadCount);
router.patch("/notifications/read-all", auth, notificationController.markAllRead);
router.patch("/notifications/:id/read", auth, notificationController.markNotificationRead);
router.delete("/notifications/:id", auth, notificationController.deleteNotification);

router.post("/add-favorite", auth, favoriteController.addFavorite);
router.post("/remove-favorite", auth, favoriteController.removeFavorite);
router.get("/favorites", auth, favoriteController.getFavorites);

module.exports = router;
