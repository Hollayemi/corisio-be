import mongoose from 'mongoose';
import Store from '../models/stores/Store';
import StoreEngagement, {
    EngagementEventType,
    ENGAGEMENT_EVENT_TYPES,
} from '../models/stores/StoreEngagement';

// ─────────────────────────────────────────────────────────────────────────────
// Map: event type → StoreEngagement field name
// Single place to maintain if fields are renamed or added
// ─────────────────────────────────────────────────────────────────────────────
const EVENT_FIELD_MAP: Record<EngagementEventType, string> = {
    profileView:     'profileViews',
    listingClick:    'listingClicks',
    callClick:       'callClicks',
    directionClick:  'directionClicks',
};

// ─────────────────────────────────────────────────────────────────────────────
// Get today's UTC date string in 'YYYY-MM-DD' format
// Using UTC consistently avoids timezone-drift issues when
// the server runs in a different timezone from the data consumers
// ─────────────────────────────────────────────────────────────────────────────
export function getTodayUTC(): string {
    return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Validate that a store is eligible to receive engagement events:
//   - exists
//   - onboardingStatus === 'verified'
//   - isActive === true
//
// Returns the store ID string if valid, null otherwise.
// Uses lean() + projection for minimum overhead.
// ─────────────────────────────────────────────────────────────────────────────
export async function validateStoreForEngagement(
    storeId: string
): Promise<boolean> {
    if (!mongoose.Types.ObjectId.isValid(storeId)) return false;

    const store = await Store.findOne(
        {
            _id: storeId,
            onboardingStatus: 'verified',
            isActive: true,
        },
        { _id: 1 }   // projection: only need to confirm existence
    ).lean();

    return store !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// recordEngagement — core atomic write
//
// Strategy: findOneAndUpdate with upsert
//   - If today's document exists → $inc the counter
//   - If not → create it with the counter at 1
//   - The unique compound index on (storeId + date) prevents race-condition
//     duplicate creation even under concurrent requests
//
// This function is intentionally synchronous-looking but async — it is called
// in fire-and-forget fashion by the controller (no await) so it never blocks
// the HTTP response.
// ─────────────────────────────────────────────────────────────────────────────
export async function recordEngagement(
    storeId: string,
    eventType: EngagementEventType
): Promise<void> {
    const field = EVENT_FIELD_MAP[eventType];
    if (!field) {
        console.error(`[engagement] Unknown event type: ${eventType}`);
        return;
    }

    const today = getTodayUTC();

    await StoreEngagement.findOneAndUpdate(
        { storeId, date: today },
        {
            $inc: { [field]: 1 },
            // $setOnInsert only runs when creating a new document (upsert path)
            // Avoids overwriting the storeId/date on every update
            $setOnInsert: {
                storeId: new mongoose.Types.ObjectId(storeId),
                date: today,
            },
        },
        {
            upsert: true,
            new: false,         // we don't need the updated doc returned
            runValidators: false, // skip validators for performance on hot path
        }
    );

    // For listingClick: also increment the lifetime counter on the Store document
    // This keeps Store.clickThroughs in sync (used by the store owner analytics endpoint)
    if (eventType === 'listingClick') {
        Store.findByIdAndUpdate(storeId, { $inc: { clickThroughs: 1 } }).catch((err) =>
            console.error('[engagement] Failed to increment clickThroughs:', err)
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// getEngagementSummary — admin analytics aggregation
//
// Returns:
//   totals: { profileViews, listingClicks, callClicks, directionClicks }
//   daily:  array of { date, profileViews, listingClicks, callClicks, directionClicks }
//           sorted ascending by date
//
// Efficient: single aggregation pipeline, uses the (storeId, date) index
// ─────────────────────────────────────────────────────────────────────────────
export interface EngagementTotals {
    profileViews: number;
    listingClicks: number;
    callClicks: number;
    directionClicks: number;
}

export interface DailyEngagement extends EngagementTotals {
    date: string;
}

export interface EngagementSummary {
    storeId: string;
    period: { startDate: string; endDate: string };
    totals: EngagementTotals;
    daily: DailyEngagement[];
    daysWithActivity: number;
}

export async function getEngagementSummary(
    storeId: string,
    startDate: string,
    endDate: string
): Promise<EngagementSummary> {
    const pipeline = [
        // Stage 1: Restrict to store + date range (hits compound index)
        {
            $match: {
                storeId: new mongoose.Types.ObjectId(storeId),
                date: { $gte: startDate, $lte: endDate },
            },
        },
        // Stage 2: Sort by date for daily array output
        { $sort: { date: 1 } },
        // Stage 3: Simultaneously build totals and daily array
        {
            $group: {
                _id: null,
                profileViews:    { $sum: '$profileViews' },
                listingClicks:   { $sum: '$listingClicks' },
                callClicks:      { $sum: '$callClicks' },
                directionClicks: { $sum: '$directionClicks' },
                daysWithActivity: { $sum: 1 },
                daily: {
                    $push: {
                        date:            '$date',
                        profileViews:    '$profileViews',
                        listingClicks:   '$listingClicks',
                        callClicks:      '$callClicks',
                        directionClicks: '$directionClicks',
                    },
                },
            },
        },
    ];

    const results = await StoreEngagement.aggregate(pipeline);

    const zeroTotals: EngagementTotals = {
        profileViews: 0,
        listingClicks: 0,
        callClicks: 0,
        directionClicks: 0,
    };

    if (!results[0]) {
        return {
            storeId,
            period: { startDate, endDate },
            totals: zeroTotals,
            daily: [],
            daysWithActivity: 0,
        };
    }

    const r = results[0];

    return {
        storeId,
        period: { startDate, endDate },
        totals: {
            profileViews:    r.profileViews,
            listingClicks:   r.listingClicks,
            callClicks:      r.callClicks,
            directionClicks: r.directionClicks,
        },
        daily: r.daily as DailyEngagement[],
        daysWithActivity: r.daysWithActivity,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// getPlatformEngagementSummary — admin platform-wide daily totals
// Used for platform-level reporting across ALL stores
// ─────────────────────────────────────────────────────────────────────────────
export async function getPlatformEngagementSummary(
    startDate: string,
    endDate: string
): Promise<{
    period: { startDate: string; endDate: string };
    totals: EngagementTotals;
    daily: DailyEngagement[];
}> {
    const pipeline = [
        {
            $match: {
                date: { $gte: startDate, $lte: endDate },
            },
        },
        { $sort: { date: 1 as const } },
        {
            $group: {
                _id: '$date',
                profileViews:    { $sum: '$profileViews' },
                listingClicks:   { $sum: '$listingClicks' },
                callClicks:      { $sum: '$callClicks' },
                directionClicks: { $sum: '$directionClicks' },
            },
        },
        { $sort: { _id: 1 as const } },
    ];

    const dailyRaw = await StoreEngagement.aggregate(pipeline);

    const daily: DailyEngagement[] = dailyRaw.map((d) => ({
        date:            d._id,
        profileViews:    d.profileViews,
        listingClicks:   d.listingClicks,
        callClicks:      d.callClicks,
        directionClicks: d.directionClicks,
    }));

    const totals = daily.reduce(
        (acc, d) => ({
            profileViews:    acc.profileViews    + d.profileViews,
            listingClicks:   acc.listingClicks   + d.listingClicks,
            callClicks:      acc.callClicks       + d.callClicks,
            directionClicks: acc.directionClicks  + d.directionClicks,
        }),
        { profileViews: 0, listingClicks: 0, callClicks: 0, directionClicks: 0 }
    );

    return { period: { startDate, endDate }, totals, daily };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export event types for use in controllers
// ─────────────────────────────────────────────────────────────────────────────
export { ENGAGEMENT_EVENT_TYPES };
export type { EngagementEventType };
