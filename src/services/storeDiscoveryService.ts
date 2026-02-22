import mongoose from 'mongoose';
import Store from '../models/Store';
import { rankStores, RankableStore } from './rankingService';
import { getRankingConfig } from '../config/rankingConfig';
import { PipelineStage } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Query parameters after validation
// ─────────────────────────────────────────────────────────────────────────────
export interface DiscoveryParams {
    lat: number;
    lng: number;
    radiusMetres: number;   // already converted from km by controller
    search?: string;
    category?: string;      // category ObjectId string
    sortBy: 'distance' | 'boost' | 'newest';
    boostedOnly: boolean;
    recentDays?: number;    // filter: stores verified within last N days
    page: number;
    limit: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe public projection — what the public endpoint is allowed to return
// Nothing internal, nothing that could reveal admin or anti-abuse data
// ─────────────────────────────────────────────────────────────────────────────
export const PUBLIC_STORE_PROJECTION = {
    _id: 1,
    storeName: 1,
    description: 1,
    address: {
        raw: 1,
        lga: 1,
        state: 1,
        coordinates: 1,
    },
    phoneNumber: 1,
    openingHours: 1,
    photos: 1,
    website: 1,
    category: 1,
    isFeatured: 1,
    // boost — only level and expiresAt needed; totalReferrals and source are internal
    'boost.level': 1,
    'boost.expiresAt': 1,
    // For ranking
    createdAt: 1,
} as const;

// Shape returned by the aggregation before ranking
interface RawStoreResult {
    _id: mongoose.Types.ObjectId;
    storeName: string;
    description?: string;
    address: {
        raw: string;
        lga: string;
        state: string;
        coordinates: { type: string; coordinates: [number, number] };
    };
    phoneNumber: string;
    openingHours: object[];
    photos: string[];
    website?: string;
    category: { _id: mongoose.Types.ObjectId; name: string; icon?: string };
    isFeatured: boolean;
    boost: { level: string; expiresAt?: Date };
    createdAt: Date;
    dist: { calculated: number };   // injected by $geoNear (metres)
}

// Shape after we attach distanceMetres for ranking compatibility
interface RankableRawStore extends RankableStore {
    _id: string;
    storeName: string;
    description?: string;
    address: RawStoreResult['address'];
    phoneNumber: string;
    openingHours: object[];
    photos: string[];
    website?: string;
    category: RawStoreResult['category'];
    isFeatured: boolean;
    createdAt: Date;
    distanceMetres: number;
    distanceKm: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the $geoNear aggregation pipeline
// ─────────────────────────────────────────────────────────────────────────────
function buildGeoNearStage(params: DiscoveryParams) {
    // Base filter — applied inside $geoNear for index efficiency
    // This avoids a full collection scan: Mongo uses the 2dsphere index
    // to filter by distance BEFORE any further matching
    const nearQuery: Record<string, unknown> = {
        onboardingStatus: 'verified',
        isActive: true,
    };

    if (params.boostedOnly) {
        nearQuery['boost.level'] = { $ne: 'none' };
        nearQuery['boost.expiresAt'] = { $gt: new Date() };
    }

    if (params.recentDays && params.recentDays > 0) {
        nearQuery.createdAt = {
            $gte: new Date(Date.now() - params.recentDays * 86_400_000),
        };
    }

    return {
        $geoNear: {
            near: {
                type: 'Point',
                coordinates: [params.lng, params.lat],
            },
            distanceField: 'dist.calculated',
            maxDistance: params.radiusMetres,
            spherical: true,
            query: nearQuery,
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build post-geoNear $match stage (search + category)
// ─────────────────────────────────────────────────────────────────────────────
function buildFilterStage(params: DiscoveryParams) {
    const matchConditions: Record<string, unknown>[] = [];

    // Text search: case-insensitive regex against storeName and description
    // We use regex here to avoid requiring a separate $text index call,
    // which doesn't compose cleanly with $geoNear in all MongoDB versions.
    // For very large collections (>100k stores), replace with Atlas Search.
    if (params.search && params.search.trim()) {
        const escaped = params.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = { $regex: escaped, $options: 'i' };
        matchConditions.push({
            $or: [
                { storeName: regex },
                { description: regex },
            ],
        });
    }

    // Category filter — match against populated category._id
    if (params.category && mongoose.Types.ObjectId.isValid(params.category)) {
        matchConditions.push({
            'category._id': new mongoose.Types.ObjectId(params.category),
        });
    }

    if (matchConditions.length === 0) return null;

    return { $match: { $and: matchConditions } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main discovery query
// Returns paginated + ranked results
// ─────────────────────────────────────────────────────────────────────────────
export async function discoverStores(params: DiscoveryParams): Promise<{
    stores: RankableRawStore[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    const pipeline: PipelineStage[] = [
        buildGeoNearStage(params),
        // Populate category name (needed for category filter + public response)
        {
            $lookup: {
                from: 'categories',
                localField: 'category',
                foreignField: '_id',
                as: 'category',
            },
        },
        { $unwind: { path: '$category'} },
    ];

    // Category and search filter stage
    const filterStage = buildFilterStage(params);
    if (filterStage) pipeline.push(filterStage);

    // Project only public-safe fields + dist
    pipeline.push({
        $project: {
            ...PUBLIC_STORE_PROJECTION,
            'category._id': 1,
            'category.name': 1,
            'category.icon': 1,
            dist: 1,
        },
    });

    // Fetch all results within the radius (pagination happens after ranking)
    // This is fine because radius is bounded (max 50km) and we have geo index.
    // We don't paginate in Mongo because ranking requires all in-radius docs.
    const raw = (await Store.aggregate(pipeline)) as RawStoreResult[];

    if (raw.length === 0) {
        return { stores: [], total: 0, page: params.page, limit: params.limit, totalPages: 0 };
    }

    // Attach distanceMetres for ranking compatibility
    const rankable: RankableRawStore[] = raw.map((s) => ({
        ...s,
        _id: s._id.toString(),
        distanceMetres: s.dist.calculated,
        distanceKm: parseFloat((s.dist.calculated / 1000).toFixed(2)),
    }));

    // ── sortBy override modes ─────────────────────────────────────────────
    // When sortBy = 'distance' or 'newest', skip the ranking algorithm
    // and do a simple sort. Ranking algorithm only applies when sortBy = 'boost'
    // or when sortBy is not specified (defaults to ranked order).

    let sorted: RankableRawStore[];

    if (params.sortBy === 'distance') {
        sorted = rankable.sort((a, b) => a.distanceMetres - b.distanceMetres);
    } else if (params.sortBy === 'newest') {
        sorted = rankable.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );
    } else {
        // Default + 'boost': use full ranking algorithm
        const config = getRankingConfig();
        const ranked = rankStores(rankable, params.radiusMetres, config);
        sorted = ranked.map((r) => r.store);
    }

    // Paginate in application layer
    const total = sorted.length;
    const totalPages = Math.ceil(total / params.limit);
    const startIdx = (params.page - 1) * params.limit;
    const pageSlice = sorted.slice(startIdx, startIdx + params.limit);

    return {
        stores: pageSlice,
        total,
        page: params.page,
        limit: params.limit,
        totalPages,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch a single verified store for the public profile endpoint
// Returns null if not found, not verified, or not active
// ─────────────────────────────────────────────────────────────────────────────
export async function getPublicStoreById(storeId: string): Promise<RankableRawStore | null> {
    if (!mongoose.Types.ObjectId.isValid(storeId)) return null;

    const results = await Store.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(storeId),
                onboardingStatus: 'verified',
                isActive: true,
            },
        },
        {
            $lookup: {
                from: 'categories',
                localField: 'category',
                foreignField: '_id',
                as: 'category',
            },
        },
        { $unwind: { path: '$category'} },
        {
            $project: {
                ...PUBLIC_STORE_PROJECTION,
                'category._id': 1,
                'category.name': 1,
                'category.icon': 1,
                verifiedAt: 1,   // registration / verification date for public profile
            },
        },
    ]);

    if (!results[0]) return null;

    return {
        ...results[0],
        _id: results[0]._id.toString(),
        distanceMetres: 0,
        distanceKm: 0,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Increment searchAppearances counter for a batch of store IDs
// Fire-and-forget — doesn't block the response
// ─────────────────────────────────────────────────────────────────────────────
export function incrementSearchAppearances(storeIds: string[]): void {
    if (storeIds.length === 0) return;
    Store.updateMany(
        { _id: { $in: storeIds } },
        { $inc: { searchAppearances: 1 } }
    ).catch((err) => console.error('Failed to increment searchAppearances:', err));
}

// ─────────────────────────────────────────────────────────────────────────────
// Increment profileViews counter for a single store
// Fire-and-forget — doesn't block the response
// ─────────────────────────────────────────────────────────────────────────────
export function incrementProfileViews(storeId: string): void {
    Store.findByIdAndUpdate(storeId, { $inc: { profileViews: 1 } }).catch((err) =>
        console.error('Failed to increment profileViews:', err)
    );
}
