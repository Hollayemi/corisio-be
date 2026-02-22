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
router.get('/referral/my-code', requireVerifiedStore, getMyReferralCode);
router.post('/referral/send-sms', requireVerifiedStore, sendReferralSMS);
router.get('/referral/my-referrals', getMyReferrals);
router.get('/referral/stats', getReferralStats);

// Boost
router.get('/boost/status', getBoostStatus);

export default router;
