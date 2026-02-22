import { Request, Response, NextFunction } from 'express';
import Store from '../../models/Store';
import Referral from '../../models/Referral';
import BoostLedger from '../../models/BoostLedger';
import { AppError, asyncHandler, AppResponse } from '../../middleware/error';
import { validateReferral, assignBoost } from '../../services/referralService';


// ─────────────────────────────────────────────
// @desc    List stores pending verification
// @route   GET /api/v1/admin/stores/
// @access  Admin
// ─────────────────────────────────────────────
export const getAllStores = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
        const { page = 1, limit = 20, lga, category, status="all" } = req.query;

        const query: Record<string, unknown> = status !== "all" ? {
            onboardingStatus: status 
        } : {};
        if (lga) query['address.lga'] = lga;
        if (category) query.category = category;

        const total = await Store.countDocuments(query);
        const stores = await Store.find(query)
            .populate('category', 'name')
            .populate('referredBy', 'storeName referralCode')
            .sort({ createdAt: 1 }) // oldest first
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit));

        (res as AppResponse).data(
            { total, page: Number(page), limit: Number(limit), stores },
            `${status} stores`
        );
    }
);


// ─────────────────────────────────────────────
// @desc    List stores pending verification
// @route   GET /api/v1/admin/stores/pending
// @access  Admin
// ─────────────────────────────────────────────
export const getPendingStores = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
        const { page = 1, limit = 20, lga, category } = req.query;

        const query: Record<string, unknown> = {
            onboardingStatus: 'profile_complete'
        };
        if (lga) query['address.lga'] = lga;
        if (category) query.category = category;

        const total = await Store.countDocuments(query);
        const stores = await Store.find(query)
            .populate('category', 'name')
            .populate('referredBy', 'storeName referralCode')
            .sort({ createdAt: 1 }) // oldest first
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit));

        (res as AppResponse).data(
            { total, page: Number(page), limit: Number(limit), stores },
            'Pending stores'
        );
    }
);

// ─────────────────────────────────────────────
// @desc    Full store detail (admin view)
// @route   GET /api/v1/admin/stores/:id
// @access  Admin
// ─────────────────────────────────────────────
export const getStoreDetail = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const store = await Store.findById(req.params.id)
            .populate('category', 'name')
            .populate('verifiedBy', 'firstName lastName email')
            .populate('referredBy', 'storeName referralCode');

        if (!store) return next(new AppError('Store not found', 404));

        // Get referral history
        const referralsMade = await Referral.find({ referrer: store._id })
            .populate('referred', 'storeName onboardingStatus')
            .sort({ createdAt: -1 });

        const referralReceived = await Referral.findOne({ referred: store._id })
            .populate('referrer', 'storeName referralCode');

        const boostHistory = await BoostLedger.find({ store: store._id }).sort({
            createdAt: -1
        });

        (res as AppResponse).data(
            { store, referralsMade, referralReceived, boostHistory },
            'Store detail'
        );
    }
);

// ─────────────────────────────────────────────
// @desc    Verify a store → triggers referral validation
// @route   POST /api/v1/admin/stores/:id/verify
// @access  Admin
// ─────────────────────────────────────────────
export const verifyStore = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { method, notes, verifiedCoordinates } = req.body;

        const store = await Store.findById(req.params.id);
        if (!store) return next(new AppError('Store not found', 404));

        if (store.onboardingStatus === 'verified') {
            return next(new AppError('Store is already verified', 409));
        }

        store.onboardingStatus = 'verified';
        store.verifiedAt = new Date();
        store.verifiedBy = (req as any).user?.id;
        store.verificationMethod = method || 'agent_visit';
        store.verificationNotes = notes;
        store.rejectionReason = undefined;

        // Update GPS coordinates if provided by agent
        if (verifiedCoordinates && Array.isArray(verifiedCoordinates) && verifiedCoordinates.length === 2) {
            store.address.coordinates.coordinates = verifiedCoordinates as [number, number];
        }

        await store.save();

        // Trigger referral validation (async — non-blocking for response)
        validateReferral(store._id.toString()).catch((err) =>
            console.error('Referral validation error after verification:', err)
        );

        (res as AppResponse).data({ store }, 'Store verified successfully');
    }
);

// ─────────────────────────────────────────────
// @desc    Reject a store
// @route   POST /api/v1/admin/stores/:id/reject
// @access  Admin
// ─────────────────────────────────────────────
export const rejectStore = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { reason } = req.body;

        if (!reason) {
            return next(new AppError('Rejection reason is required', 400));
        }

        const store = await Store.findById(req.params.id);
        if (!store) return next(new AppError('Store not found', 404));

        store.onboardingStatus = 'rejected';
        store.rejectionReason = reason;
        await store.save();

        (res as AppResponse).data({ store }, 'Store rejected');
    }
);

// ─────────────────────────────────────────────
// @desc    Reject a store
// @route   POST /api/v1/admin/stores/:id/suspend
// @access  Admin
// ─────────────────────────────────────────────
export const suspendStore = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { reason } = req.body;

        if (!reason) {
            return next(new AppError('Suspension reason is required', 400));
        }

        const store = await Store.findById(req.params.id);
        if (!store) return next(new AppError('Store not found', 404));

        store.onboardingStatus = 'suspended';
        store.rejectionReason = reason;
        await store.save();

        (res as AppResponse).data({ store }, 'Store suspended');
    }
);

// ─────────────────────────────────────────────
// @desc    Manually grant a boost to a store
// @route   POST /api/v1/admin/stores/:id/boost-grant
// @access  Admin
// ─────────────────────────────────────────────
export const grantBoost = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { level, durationDays, note } = req.body;

        const validLevels = ['bronze', 'silver', 'gold'];
        if (!validLevels.includes(level)) {
            return next(new AppError('Invalid boost level', 400));
        }

        const store = await Store.findById(req.params.id);
        if (!store) return next(new AppError('Store not found', 404));

        const now = new Date();
        const days = Number(durationDays) || 30;
        const expiresAt = new Date(now.getTime() + days * 86_400_000);
        const previousLevel = store.boost.level;

        store.boost = {
            level,
            activatedAt: now,
            expiresAt,
            totalReferrals: store.boost.totalReferrals,
            source: 'admin_grant'
        };

        await store.save();

        await BoostLedger.create({
            store: store._id,
            event: 'admin_grant',
            fromLevel: previousLevel,
            toLevel: level,
            expiresAt,
            note: note || `Admin grant by ${(req as any).user?.email}`
        });

        (res as AppResponse).data({ store }, `Boost ${level} granted for ${days} days`);
    }
);

// ─────────────────────────────────────────────
// @desc    Get referral tree for a store
// @route   GET /api/v1/admin/stores/:id/referral-tree
// @access  Admin
// ─────────────────────────────────────────────
export const getReferralTree = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const store = await Store.findById(req.params.id).select('storeName referralCode');
        if (!store) return next(new AppError('Store not found', 404));

        // Direct referrals (depth 1)
        const direct = await Referral.find({ referrer: store._id })
            .populate('referred', 'storeName onboardingStatus referralCode boost.level');

        // Second-degree referrals (depth 2)
        const directIds = direct.map((r) => r.referred);
        const secondDegree = await Referral.find({ referrer: { $in: directIds } })
            .populate('referrer', 'storeName')
            .populate('referred', 'storeName onboardingStatus');

        (res as AppResponse).data(
            {
                root: { id: store._id, storeName: store.storeName, referralCode: store.referralCode },
                directReferrals: direct,
                secondDegreeReferrals: secondDegree,
                totalNetwork: direct.length + secondDegree.length
            },
            'Referral tree'
        );
    }
);

// ─────────────────────────────────────────────
// @desc    List all referrals (admin)
// @route   GET /api/v1/admin/referrals
// @access  Admin
// ─────────────────────────────────────────────
export const getAllReferrals = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
        const { status, flagged, page = 1, limit = 20 } = req.query;

        const query: Record<string, unknown> = {};
        if (status) query.status = status;
        if (flagged !== undefined) query.flagged = flagged === 'true';

        const total = await Referral.countDocuments(query);
        const referrals = await Referral.find(query)
            .populate('referrer', 'storeName phoneNumber')
            .populate('referred', 'storeName phoneNumber onboardingStatus')
            .sort({ createdAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit));

        (res as AppResponse).data(
            { total, page: Number(page), limit: Number(limit), referrals },
            'All referrals'
        );
    }
);

// ─────────────────────────────────────────────
// @desc    Flag a referral as fraudulent
// @route   POST /api/v1/admin/referrals/:id/flag
// @access  Admin
// ─────────────────────────────────────────────
export const flagReferral = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { reason } = req.body;
        const referral = await Referral.findById(req.params.id);
        if (!referral) return next(new AppError('Referral not found', 404));

        referral.flagged = true;
        referral.flagReason = reason || 'Manually flagged by admin';

        if (referral.status === 'validated' && referral.boostApplied) {
            // Reverse boost if referral is retroactively rejected
            referral.status = 'rejected';
            // Re-calculate referrer's boost without this referral
            await assignBoost(referral.referrer.toString());
        }

        await referral.save();

        (res as AppResponse).success('Referral flagged');
    }
);

// ─────────────────────────────────────────────
// @desc    Unflag a referral
// @route   POST /api/v1/admin/referrals/:id/unflag
// @access  Admin
// ─────────────────────────────────────────────
export const unflagReferral = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const referral = await Referral.findById(req.params.id);
        if (!referral) return next(new AppError('Referral not found', 404));

        referral.flagged = false;
        referral.flagReason = undefined;
        await referral.save();

        (res as AppResponse).success('Referral unflagged');
    }
);

// ─────────────────────────────────────────────
// @desc    Get expiring boosts (next 7 days)
// @route   GET /api/v1/admin/boosts/expiring
// @access  Admin
// ─────────────────────────────────────────────
export const getExpiringBoosts = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
        const sevenDaysFromNow = new Date(Date.now() + 7 * 86_400_000);

        const stores = await Store.find({
            'boost.level': { $ne: 'none' },
            'boost.expiresAt': { $lte: sevenDaysFromNow, $gte: new Date() }
        }).select('storeName boost address.lga phoneNumber');

        (res as AppResponse).data({ count: stores.length, stores }, 'Expiring boosts');
    }
);

// ─────────────────────────────────────────────
// @desc    Boost ledger for a store
// @route   GET /api/v1/admin/boosts/ledger/:storeId
// @access  Admin
// ─────────────────────────────────────────────
export const getBoostLedger = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const ledger = await BoostLedger.find({ store: req.params.storeId })
            .populate('triggerReferral', 'referred status')
            .sort({ createdAt: -1 });

        (res as AppResponse).data({ ledger }, 'Boost ledger');
    }
);
