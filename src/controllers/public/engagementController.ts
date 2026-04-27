import { Request, Response, NextFunction } from 'express';
import { AppError, asyncHandler, AppResponse } from '../../middleware/error';
import {
    validateStoreForEngagement,
    recordEngagement,
    EngagementEventType,
} from '../../services/engagementService';

// ─────────────────────────────────────────────────────────────────────────────
// Shared handler factory
//
// All four engagement endpoints follow the same pattern:
//   1. Validate the storeId (format + verified + active)
//   2. Fire engagement write (non-blocking — does NOT await)
//   3. Return immediately with minimal 200 response
//
// The response is intentionally lean — no store data is returned.
// This makes these endpoints fast and safe: they can't be used to
// probe internal store state.
// ─────────────────────────────────────────────────────────────────────────────
function makeEngagementHandler(eventType: EngagementEventType) {
    return asyncHandler(
        async (req: Request, res: Response, next: NextFunction) => {
            const { id } = req.params;

            // Validate store is eligible (verified + active)
            const isValid = await validateStoreForEngagement(id);
            if (!isValid) {
                // Use 404 to avoid revealing whether the store exists but is suspended
                return next(new AppError('Store not found', 404));
            }

            // Fire-and-forget: do NOT await — response returns before the DB write
            // This keeps the endpoint at ~5ms regardless of DB write latency
            recordEngagement(id, eventType).catch((err) =>
                console.error(`[engagement] Failed to record ${eventType} for ${id}:`, err)
            );

            (res as AppResponse).success('Event recorded');
        }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/v1/public/stores/:id/view
// @access  Public
// @desc    Record a profile view event
//          Call this when a user opens a store's full profile page
// ─────────────────────────────────────────────────────────────────────────────
export const recordProfileView = makeEngagementHandler('profileView');

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/v1/public/stores/:id/listing-click
// @access  Public
// @desc    Record a listing click
//          Call this when a user taps a store card in the discovery listing
//          (before navigating to the full profile)
// ─────────────────────────────────────────────────────────────────────────────
export const recordListingClick = makeEngagementHandler('listingClick');

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/v1/public/stores/:id/call-click
// @access  Public
// @desc    Record a call button click
//          Call this when a user taps the phone number / call button
// ─────────────────────────────────────────────────────────────────────────────
export const recordCallClick = makeEngagementHandler('callClick');

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/v1/public/stores/:id/direction-click
// @access  Public
// @desc    Record a directions button click
//          Call this when a user taps "Get Directions" on a store profile
// ─────────────────────────────────────────────────────────────────────────────
export const recordDirectionClick = makeEngagementHandler('directionClick');
