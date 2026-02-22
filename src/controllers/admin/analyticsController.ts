import { Request, Response, NextFunction } from 'express';
import Store from '../../models/Store';
import Referral from '../../models/Referral';
import { AppError, asyncHandler, AppResponse } from '../../middleware/error';

// ─────────────────────────────────────────────
// @desc    Referral network analytics
// @route   GET /api/v1/admin/analytics/referrals
// @access  Admin
// ─────────────────────────────────────────────
export const getReferralAnalytics = asyncHandler(
    async (_req: Request, res: Response, _next: NextFunction) => {
        const [total, validated, pending, rejected] = await Promise.all([
            Referral.countDocuments(),
            Referral.countDocuments({ status: 'validated' }),
            Referral.countDocuments({ status: 'pending' }),
            Referral.countDocuments({ status: 'rejected' })
        ]);

        const conversionRate = total > 0 ? ((validated / total) * 100).toFixed(1) : '0';

        // Top referrers
        const topReferrers = await Referral.aggregate([
            { $match: { status: 'validated' } },
            { $group: { _id: '$referrer', validatedCount: { $sum: 1 } } },
            { $sort: { validatedCount: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'stores',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'store'
                }
            },
            { $unwind: '$store' },
            {
                $project: {
                    _id: 0,
                    storeId: '$_id',
                    storeName: '$store.storeName',
                    boostLevel: '$store.boost.level',
                    lga: '$store.address.lga',
                    validatedCount: 1
                }
            }
        ]);

        // Boost distribution
        const boostDistribution = await Store.aggregate([
            { $match: { isActive: true } },
            { $group: { _id: '$boost.level', count: { $sum: 1 } } }
        ]);

        const boostMap = { none: 0, bronze: 0, silver: 0, gold: 0 };
        boostDistribution.forEach((b) => {
            if (b._id in boostMap) (boostMap as any)[b._id] = b.count;
        });

        // Channel breakdown
        const channelBreakdown = await Referral.aggregate([
            { $group: { _id: '$channel', count: { $sum: 1 } } }
        ]);

        // Flagged
        const flaggedCount = await Referral.countDocuments({ flagged: true });
        const autoRejected = await Referral.countDocuments({
            flagged: true,
            status: 'rejected'
        });

        (res as AppResponse).data(
            {
                volume: { total, validated, pending, rejected },
                conversionRate: `${conversionRate}%`,
                topReferrers,
                boostDistribution: boostMap,
                channelBreakdown,
                abuse: {
                    flagged: flaggedCount,
                    autoRejected,
                    pendingAdminReview: flaggedCount - autoRejected
                }
            },
            'Referral analytics'
        );
    }
);

// ─────────────────────────────────────────────
// @desc    Onboarding funnel analytics
// @route   GET /api/v1/admin/analytics/onboarding
// @access  Admin
// ─────────────────────────────────────────────
export const getOnboardingFunnel = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
        const { period = '30' } = req.query;
        const daysAgo = new Date(Date.now() - Number(period) * 86_400_000);

        const base = { createdAt: { $gte: daysAgo } };

        const [
            registered,
            phoneVerified,
            profileComplete,
            verified,
            rejected
        ] = await Promise.all([
            Store.countDocuments({ ...base }),
            Store.countDocuments({ ...base, isPhoneVerified: true }),
            Store.countDocuments({
                ...base,
                onboardingStatus: { $in: ['profile_complete', 'verified'] }
            }),
            Store.countDocuments({ ...base, onboardingStatus: 'verified' }),
            Store.countDocuments({ ...base, onboardingStatus: 'rejected' })
        ]);

        // Average time: registration → profile_complete (using profileCompletionScore)
        const avgTimeResult = await Store.aggregate([
            {
                $match: {
                    ...base,
                    onboardingStatus: { $in: ['profile_complete', 'verified'] }
                }
            },
            {
                $project: {
                    minutesToComplete: {
                        $divide: [
                            { $subtract: ['$updatedAt', '$createdAt'] },
                            60000
                        ]
                    }
                }
            },
            { $group: { _id: null, avg: { $avg: '$minutesToComplete' } } }
        ]);

        const avgMinutes = avgTimeResult[0]?.avg ?? 0;

        (res as AppResponse).data(
            {
                period: `last_${period}_days`,
                funnel: {
                    registered,
                    phoneVerified,
                    profileComplete,
                    verified,
                    rejected
                },
                dropOffRates: {
                    registrationToPhone:
                        registered > 0
                            ? `${(((registered - phoneVerified) / registered) * 100).toFixed(1)}%`
                            : '0%',
                    phoneToProfile:
                        phoneVerified > 0
                            ? `${(((phoneVerified - profileComplete) / phoneVerified) * 100).toFixed(1)}%`
                            : '0%',
                    profileToVerified:
                        profileComplete > 0
                            ? `${(((profileComplete - verified) / profileComplete) * 100).toFixed(1)}%`
                            : '0%'
                },
                avgOnboardingMinutes: Math.round(avgMinutes)
            },
            'Onboarding funnel'
        );
    }
);

// ─────────────────────────────────────────────
// @desc    Store cluster density by LGA (geo heatmap data)
// @route   GET /api/v1/admin/analytics/cluster-density
// @access  Admin
// ─────────────────────────────────────────────
export const getClusterDensity = asyncHandler(
    async (_req: Request, res: Response, _next: NextFunction) => {
        const clusters = await Store.aggregate([
            { $match: { onboardingStatus: 'verified', isActive: true } },
            {
                $group: {
                    _id: { lga: '$address.lga', category: '$category' },
                    count: { $sum: 1 },
                    centroid: { $first: '$address.coordinates.coordinates' }
                }
            },
            { $sort: { count: -1 } },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id.category',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            },
            {
                $project: {
                    _id: 0,
                    lga: '$_id.lga',
                    category: { $arrayElemAt: ['$categoryInfo.name', 0] },
                    count: 1,
                    centroid: 1
                }
            }
        ]);

        // LGA summary
        const lgaSummary = await Store.aggregate([
            { $match: { onboardingStatus: 'verified', isActive: true } },
            { $group: { _id: '$address.lga', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const totalVerified = await Store.countDocuments({
            onboardingStatus: 'verified',
            isActive: true
        });

        (res as AppResponse).data(
            {
                totalVerifiedStores: totalVerified,
                densestLGA: lgaSummary[0]?._id ?? null,
                coverageZones: lgaSummary.length,
                lgaSummary,
                clusters
            },
            'Cluster density'
        );
    }
);

// ─────────────────────────────────────────────
// @desc    Individual store analytics
// @route   GET /api/v1/stores/analytics/me
// @access  Store
// ─────────────────────────────────────────────
export const getMyStoreAnalytics = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const storeId = (req as any).store?.id;
        const store = await Store.findById(storeId).select(
            'profileViews searchAppearances clickThroughs boost'
        );

        if (!store) return next(new AppError('Store not found', 404));

        const referralCount = await Referral.countDocuments({
            referrer: storeId,
            status: 'validated'
        });

        (res as AppResponse).data(
            {
                profileViews: store.profileViews,
                searchAppearances: store.searchAppearances,
                clickThroughs: store.clickThroughs,
                ctr:
                    store.searchAppearances > 0
                        ? `${((store.clickThroughs / store.searchAppearances) * 100).toFixed(1)}%`
                        : '0%',
                validatedReferrals: referralCount,
                boost: store.boost
            },
            'Store analytics'
        );
    }
);
