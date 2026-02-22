import { Request, Response, NextFunction } from 'express';
import Store from '../../models/Store';
import Referral from '../../models/Referral';
import { AppError, asyncHandler, AppResponse } from '../../middleware/error';
import { getBoostProgress } from '../../services/referralService';

// ─────────────────────────────────────────────
// @desc    Get my referral code + shareable link
// @route   GET /api/v1/stores/referral/my-code
// @access  Store (verified only)
// ─────────────────────────────────────────────
export const getMyReferralCode = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const storeId = (req as any).store?.id;
        const store = await Store.findById(storeId).select('referralCode storeName onboardingStatus');

        if (!store) return next(new AppError('Store not found', 404));

        const baseUrl = process.env.CLIENT_URL || 'https://corisio.ng';
        const shareableLink = `${baseUrl}/join?ref=${store.referralCode}`;

        (res as AppResponse).data(
            {
                referralCode: store.referralCode,
                shareableLink,
                qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareableLink)}`
            },
            'Referral code retrieved'
        );
    }
);

// ─────────────────────────────────────────────
// @desc    Send referral SMS to a phone number
// @route   POST /api/v1/stores/referral/send-sms
// @access  Store (verified only)
// ─────────────────────────────────────────────
export const sendReferralSMS = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const storeId = (req as any).store?.id;
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return next(new AppError('Phone number is required', 400));
        }

        // Rate limit: max 5 SMS referrals in 24h per store
        const recentCount = await Referral.countDocuments({
            referrer: storeId,
            channel: 'sms',
            createdAt: { $gte: new Date(Date.now() - 86_400_000) }
        });

        if (recentCount >= 5) {
            return next(
                new AppError('You can send a maximum of 5 referral SMS per day', 429)
            );
        }

        // Check if this phone already exists as a verified store
        const existingStore = await Store.findOne({ phoneNumber });
        if (existingStore && existingStore.onboardingStatus === 'verified') {
            return next(new AppError('This store is already registered on Corisio', 409));
        }

        const store = await Store.findById(storeId).select('referralCode storeName');
        if (!store) return next(new AppError('Store not found', 404));

        const baseUrl = process.env.CLIENT_URL || 'https://corisio.ng';
        const link = `${baseUrl}/join?ref=${store.referralCode}`;
        const smsBody = `Hi! ${store.storeName} invites you to list your store on Corisio — Abuja's local store directory. Join here: ${link}`;

        // TODO: send via Twilio
        console.log(`[REFERRAL SMS] To: ${phoneNumber} | Message: ${smsBody}`);

        (res as AppResponse).success('Referral SMS sent successfully');
    }
);

// ─────────────────────────────────────────────
// @desc    Get list of stores I've referred
// @route   GET /api/v1/stores/referral/my-referrals
// @access  Store
// ─────────────────────────────────────────────
export const getMyReferrals = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const storeId = (req as any).store?.id;

        const referrals = await Referral.find({ referrer: storeId })
            .populate('referred', 'storeName onboardingStatus address.lga category')
            .sort({ createdAt: -1 });

        const summary = {
            total: referrals.length,
            pending: referrals.filter((r) => r.status === 'pending').length,
            profileComplete: referrals.filter((r) => r.status === 'profile_complete').length,
            validated: referrals.filter((r) => r.status === 'validated').length,
            rejected: referrals.filter((r) => r.status === 'rejected').length
        };

        (res as AppResponse).data({ summary, referrals }, 'My referrals');
    }
);

// ─────────────────────────────────────────────
// @desc    Get referral stats + boost progress
// @route   GET /api/v1/stores/referral/stats
// @access  Store
// ─────────────────────────────────────────────
export const getReferralStats = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const storeId = (req as any).store?.id;

        const store = await Store.findById(storeId).select('boost referralCode storeName');
        if (!store) return next(new AppError('Store not found', 404));

        const validatedCount = await Referral.countDocuments({
            referrer: storeId,
            status: 'validated'
        });

        const progress = getBoostProgress(validatedCount);

        (res as AppResponse).data(
            {
                boost: store.boost,
                validatedReferrals: validatedCount,
                progress,
                milestones: {
                    bronze: { required: 1, duration: '30 days', reached: validatedCount >= 1 },
                    silver: { required: 4, duration: '60 days', reached: validatedCount >= 4 },
                    gold: { required: 10, duration: '90 days', reached: validatedCount >= 10 }
                }
            },
            'Referral stats'
        );
    }
);

// ─────────────────────────────────────────────
// @desc    Get my boost status
// @route   GET /api/v1/stores/boost/status
// @access  Store
// ─────────────────────────────────────────────
export const getBoostStatus = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const storeId = (req as any).store?.id;

        const store = await Store.findById(storeId).select('boost');
        if (!store) return next(new AppError('Store not found', 404));

        const now = new Date();
        const isActive =
            store.boost.level !== 'none' &&
            store.boost.expiresAt &&
            store.boost.expiresAt > now;

        const daysRemaining = isActive && store.boost.expiresAt
            ? Math.ceil(
                  (store.boost.expiresAt.getTime() - now.getTime()) / 86_400_000
              )
            : 0;

        (res as AppResponse).data(
            {
                boost: store.boost,
                isActive,
                daysRemaining
            },
            'Boost status'
        );
    }
);
