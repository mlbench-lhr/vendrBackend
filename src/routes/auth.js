const express = require('express');
const router = express.Router();

const userController = require('../controllers/authController');
const vendorController = require('../controllers/vendorAuthController');
const passwordController = require('../controllers/passwordController');

const validateBody = require('../middleware/validate');
const schemas = require('../middleware/validators'); // correct file name

// user
router.post('/user/register', validateBody(schemas.userRegisterSchema), userController.register);
router.post('/user/login', validateBody(schemas.userLoginSchema), userController.login);
router.post('/user/oauth', validateBody(schemas.userOauthSchema), userController.oauth);
router.post('/user/refresh', userController.refresh);
router.post('/user/logout', userController.logout);

// vendor
router.post('/vendor/register', validateBody(schemas.vendorRegisterSchema), vendorController.register);
router.post('/vendor/login', validateBody(schemas.vendorLoginSchema), vendorController.login);
router.post('/vendor/oauth', validateBody(schemas.vendorOauthSchema), vendorController.oauth);
router.post('/vendor/logout', vendorController.logout);
router.post('/vendor/refresh', vendorController.refresh);

// password reset
router.post('/forgot-password', validateBody(schemas.forgotPasswordSchema), passwordController.forgotPassword);
router.post('/verify-otp', validateBody(schemas.verifyOtpSchema), passwordController.verifyOtp);
router.post('/reset-password', validateBody(schemas.resetPasswordSchema), passwordController.resetPassword);

router.get('/test', (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
