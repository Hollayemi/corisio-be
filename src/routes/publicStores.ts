import { Router } from 'express';
import {
    getPublicStores,
    getPublicStoreProfile,
} from '../controllers/public/publicStoreController';

const router = Router();

// ── No authentication on any of these routes ─────────────────────────────────

// GET /api/v1/public/stores
// Query: lat, lng, radius, search, category, sortBy, boostedOnly, recentDays, page, limit
router.get('/stores', getPublicStores);

// GET /api/v1/public/stores/:storeId
router.get('/stores/:storeId', getPublicStoreProfile);

export default router;
