import { Router } from 'express';
import {
    sendOTP,
    verifyOTP,
    resendOTP,
    completeProfile,
    updateNotificationSettings,
    updateBiometricSettings,
    getMe,
    logout,
    refreshToken,
    login,
    verifyLoginOTP,
    getSearchHistory
} from '../controllers/auth';
import { protect } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/auth/send-otp', sendOTP);
router.post('/auth/login', login);
router.post('/auth/verify-login-otp', verifyLoginOTP);
router.post('/auth/verify-otp', verifyOTP);
router.post('/auth/resend-otp', resendOTP);
router.post('/auth/refresh-token', refreshToken);

// Protected routes
router.use(protect);


router.post('/auth/logout', logout);
router.put('/complete-profile', completeProfile);
router.put('/notifications', updateNotificationSettings);
router.put('/biometrics', updateBiometricSettings);


// information about the currently logged in user
router.get('/me', getMe);
router.get('/search-history', getSearchHistory);

export default router;