import { Router } from 'express';
import {
    sendOTP,
    verifyOTP,
    resendOTP,
    refreshToken,
    logout,
    registerProfile,
    getMe,
    getProfileCompletion,
    uploadStorePhoto
} from '../controllers/stores/storeAuthController';
import {    completeProfile, uploadUserPhoto } from '../controllers/auth';
import { protectStore } from '../middleware/storeAuth';

const router = Router();

// ── Public ──────────────────────────────────
router.post('/auth/send-otp', sendOTP);
router.post('/auth/verify-otp', verifyOTP);
router.post('/auth/resend-otp', resendOTP);
router.post('/auth/refresh-token', refreshToken);

// ── Protected ───────────────────────────────
router.use(protectStore);


router.post('/auth/logout', logout);
router.post('/register', registerProfile);
router.put('/profile', registerProfile);
router.get('/me', getMe);
router.get('/profile/completion', getProfileCompletion);
router.put('/owner/complete-profile', completeProfile);

// Photo upload
router.post('/upload-photo', uploadStorePhoto);
router.post('/owner-photo', uploadUserPhoto);



export default router;
