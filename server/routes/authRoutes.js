const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { loginLimit, forgotPasswordLimit, resetPasswordLimit } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/login', loginLimit, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, authController.me);

router.post('/forgot-password', forgotPasswordLimit, authController.forgotPassword);
router.post('/reset-password', resetPasswordLimit, authController.resetPassword);

module.exports = router;
