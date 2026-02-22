import { Request, Response, NextFunction } from 'express';
import { AppError, asyncHandler, AppResponse } from '../../middleware/error';
import {
    discoverStores,
    getPublicStoreById,
    incrementSearchAppearances,
    incrementProfileViews,
    DiscoveryParams,
} from '../../services/storeDiscoveryService';
import { isBoostActive } from '../../services/rankingService';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_RADIUS_KM   = 5;
const MAX_RADIUS_KM       = 50;
const DEFAULT_LIMIT       = 20;
const MAX_LIMIT           = 50;
const DEFAULT_PAGE        = 1;

// ─────────────────────────────────────────────────────────────────────────────
// Format a store for public consumption
// Enforces what is and is not exposed — single place to update if needed
// ─────────────────────────────────────────────────────────────────────────────
function formatPublicStore(store: any, includeDistance = false) {
    const boostActive = isBoostActive(store.boost?.level, store.boost?.expiresAt);

    const result: Record<string, unknown> = {
        id: store._id,
        storeName: store.storeName,
        description: store.description ?? null,
        address: {
            raw: store.address?.raw ?? null,
            lga: store.address?.lga ?? null,
            state: store.address?.state ?? null,
            coordinates: store.address?.coordinates?.coordinates
                ? {
                      lng: store.address.coordinates.coordinates[0],
                      lat: store.address.coordinates.coordinates[1],
                  }
                : null,
        },
        phoneNumber: store.phoneNumber,
        openingHours: store.openingHours ?? [],
        photos: store.photos ?? [],
        website: store.website ?? null,
        category: store.category
            ? {
                  id: store.category._id,
                  name: store.category.name,
                  icon: store.category.icon ?? null,
              }
            : null,
        isFeatured: store.isFeatured ?? false,
        boost: boostActive
            ? {
                  level: store.boost.level,
                  expiresAt: store.boost.expiresAt,
              }
            : null,  // null = no active boost — don't reveal expired level
        registeredAt: store.createdAt,
        verifiedAt: store.verifiedAt ?? null,
    };

    if (includeDistance) {
        result.distanceKm = store.distanceKm ?? null;
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Public store discovery (list with ranking)
// @route   GET /api/v1/public/stores
// @access  Public (no auth required)
// ─────────────────────────────────────────────────────────────────────────────
export const getPublicStores = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { lat, lng, radius, search, category, sortBy, boostedOnly, recentDays, page, limit } =
            req.query;

        // ── Validate required params ─────────────────────────────────────
        if (!lat || !lng) {
            return next(new AppError('lat and lng are required query parameters', 400));
        }

        const parsedLat = parseFloat(lat as string);
        const parsedLng = parseFloat(lng as string);

        if (isNaN(parsedLat) || isNaN(parsedLng)) {
            return next(new AppError('lat and lng must be valid numbers', 400));
        }

        if (parsedLat < -90 || parsedLat > 90) {
            return next(new AppError('lat must be between -90 and 90', 400));
        }

        if (parsedLng < -180 || parsedLng > 180) {
            return next(new AppError('lng must be between -180 and 180', 400));
        }

        // ── Parse and clamp optional params ──────────────────────────────
        const radiusKm = Math.min(
            parseFloat((radius as string) || String(DEFAULT_RADIUS_KM)) || DEFAULT_RADIUS_KM,
            MAX_RADIUS_KM
        );
        const radiusMetres = radiusKm * 1000;

        const parsedPage  = Math.max(1, parseInt((page as string)  || String(DEFAULT_PAGE),  10) || DEFAULT_PAGE);
        const parsedLimit = Math.min(MAX_LIMIT, Math.max(1, parseInt((limit as string) || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));

        const sortByParam = (['distance', 'boost', 'newest'] as const).includes(
            sortBy as any
        )
            ? (sortBy as 'distance' | 'boost' | 'newest')
            : 'boost';

        const params: DiscoveryParams = {
            lat: parsedLat,
            lng: parsedLng,
            radiusMetres,
            search: (search as string) || undefined,
            category: (category as string) || undefined,
            sortBy: sortByParam,
            boostedOnly: boostedOnly === 'true',
            recentDays: recentDays ? parseInt(recentDays as string, 10) || undefined : undefined,
            page: parsedPage,
            limit: parsedLimit,
        };

        // ── Run discovery ─────────────────────────────────────────────────
        const result = await discoverStores(params);

        // Fire-and-forget analytics — does not affect response time
        if (result.stores.length > 0) {
            incrementSearchAppearances(result.stores.map((s) => s._id));
        }

        // ── Format response ───────────────────────────────────────────────
        const stores = result.stores.map((s) => formatPublicStore(s, true));

        (res as AppResponse).data(
            {
                stores,
                pagination: {
                    total: result.total,
                    page: result.page,
                    limit: result.limit,
                    totalPages: result.totalPages,
                    hasNextPage: result.page < result.totalPages,
                    hasPrevPage: result.page > 1,
                },
                query: {
                    lat: parsedLat,
                    lng: parsedLng,
                    radiusKm,
                    sortBy: sortByParam,
                },
            },
            'Stores retrieved'
        );
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Public store profile
// @route   GET /api/v1/public/stores/:storeId
// @access  Public (no auth required)
// ─────────────────────────────────────────────────────────────────────────────
export const getPublicStoreProfile = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
        const { storeId } = req.params;

        const store = await getPublicStoreById(storeId);

        // Treat not-found, suspended, and not-verified identically → 404
        // This prevents information leakage about internal store states
        if (!store) {
            return next(new AppError('Store not found', 404));
        }

        // Fire-and-forget analytics
        incrementProfileViews(storeId);

        (res as AppResponse).data(
            { store: formatPublicStore(store, false) },
            'Store retrieved'
        );
    }
);
