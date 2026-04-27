import { Router } from 'express';
import {
    getMyReferralCode,
    sendReferralSMS,
    getMyReferrals,
    getReferralStats,
    getBoostStatus
} from '../controllers/stores/referralController';
import { protectStore, requireVerifiedStore } from '../middleware/storeAuth';

const router = Router();

router.use(protectStore);

// Referral
router.get('/referral/my-code', getMyReferralCode);
router.post('/referral/send-sms', sendReferralSMS);
router.get('/referral/my-referrals', getMyReferrals);
router.get('/referral/stats', getReferralStats);

// Boost
router.get('/boost/status', getBoostStatus);

export default router;
