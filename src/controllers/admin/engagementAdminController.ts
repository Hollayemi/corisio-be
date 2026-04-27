import { Request, Response, NextFunction } from 'express';
import { AppError, asyncHandler, AppResponse } from '../../middleware/error';
import Store from '../../models/stores/Store';
import {
    getEngagementSummary,
    getPlatformEngagementSummary,
} from '../../services/engagementService';

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a 'YYYY-MM-DD' string into a Date. Returns null if invalid. */
function parseDate(value: string | undefined): string | null {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const d = new Date(value + 'T00:00:00.000Z');
    return isNaN(d.getTime()) ? null : value;
}

/** Default date range: last N days from today */
function defaultDateRange(days: number): { startDate: string; endDate: string } {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86_400_000);
    return {
        startDate: start.toISOString().slice(0, 10),
        endDate:   end.toISOString().slice(0, 10),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get engagement analytics for a single store
// @route   GET /api/v1/admin/analytics/engagement/:storeId
// @access  Admin + access_reports
// ─────────────────────────────────────────────────────────────────────────────
export const getStoreEngagementAnalytics = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { storeId } = req.params;
        const { startDate: rawStart, endDate: rawEnd } = req.query;

        // Validate storeId
        const store = await Store.findById(storeId)
            .select('storeName onboardingStatus isActive boost profileViews searchAppearances clickThroughs')
            .lean();

        if (!store) return next(new AppError('Store not found', 404));

        // Parse date range — default to last 30 days
        const defaults = defaultDateRange(30);
        const startDate = parseDate(rawStart as string) ?? defaults.startDate;
        const endDate   = parseDate(rawEnd   as string) ?? defaults.endDate;

        if (startDate > endDate) {
            return next(new AppError('startDate must be on or before endDate', 400));
        }

        // Run aggregation
        const summary = await getEngagementSummary(storeId, startDate, endDate);

        // Also include the lifetime counters from the Store doc for context
        const lifetimeTotals = {
            profileViews:      store.profileViews      ?? 0,
            searchAppearances: store.searchAppearances ?? 0,
            clickThroughs:     store.clickThroughs     ?? 0,
        };

        (res as AppResponse).data(
            {
                store: {
                    id: storeId,
                    storeName: store.storeName,
                    onboardingStatus: store.onboardingStatus,
                    boostLevel: store.boost?.level ?? 'none',
                },
                period: summary.period,
                totals: summary.totals,
                daysWithActivity: summary.daysWithActivity,
                daily: summary.daily,
                lifetimeTotals,
            },
            'Store engagement analytics'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get platform-wide engagement totals + daily breakdown
// @route   GET /api/v1/admin/analytics/engagement
// @access  Admin + access_reports
// ─────────────────────────────────────────────────────────────────────────────
export const getPlatformEngagementAnalytics = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
        const { startDate: rawStart, endDate: rawEnd } = req.query;

        const defaults = defaultDateRange(30);
        const startDate = parseDate(rawStart as string) ?? defaults.startDate;
        const endDate   = parseDate(rawEnd   as string) ?? defaults.endDate;

        const summary = await getPlatformEngagementSummary(startDate, endDate);

        // Compute engagement rate: callClicks / listingClicks (call conversion)
        const callConversionRate =
            summary.totals.listingClicks > 0
                ? parseFloat(
                      ((summary.totals.callClicks / summary.totals.listingClicks) * 100).toFixed(1)
                  )
                : 0;

        const directionConversionRate =
            summary.totals.listingClicks > 0
                ? parseFloat(
                      ((summary.totals.directionClicks / summary.totals.listingClicks) * 100).toFixed(1)
                  )
                : 0;

        (res as AppResponse).data(
            {
                period: summary.period,
                totals: summary.totals,
                conversionRates: {
                    callConversionPct:      callConversionRate,
                    directionConversionPct: directionConversionRate,
                },
                daily: summary.daily,
            },
            'Platform engagement analytics'
        );
    }
);
