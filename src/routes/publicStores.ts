import { Router } from 'express';
import {
    getPublicStores,
    getPublicStoreProfile,
} from '../controllers/public/publicStoreController';
import {
    recordProfileView,
    recordListingClick,
    recordCallClick,
    recordDirectionClick,
} from '../controllers/public/engagementController';

const router = Router();
// ── No authentication on any of these routes ─────────────────────────────────

// GET /api/v1/public/stores
// Query: lat, lng, radius, search, category, sortBy, boostedOnly, recentDays, page, limit
router.get('/stores', getPublicStores);

// GET /api/v1/public/stores/:storeId
router.get('/stores/:storeId', getPublicStoreProfile);



// ── Engagement tracking endpoints ─────────────────────────────────────────────
// POST only. Returns no store data. Fire-and-forget write to StoreEngagement.
// Call these from the frontend when a user performs the corresponding interaction.

// User opened the store's full profile page
router.post('/stores/:id/view', recordProfileView);

// User tapped a store card in the discovery listing
router.post('/stores/:id/listing-click', recordListingClick);

// User tapped the phone / call button on a store profile
router.post('/stores/:id/call-click', recordCallClick);

// User tapped the directions button on a store profile
router.post('/stores/:id/direction-click', recordDirectionClick);


export default router;
