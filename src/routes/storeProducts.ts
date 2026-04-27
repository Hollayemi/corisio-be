import { Router } from 'express';
import {
    createProductHandler,
    updateProductHandler,
    updateAvailability,
    deleteProductHandler,
    getMyProducts,
    getMyProductById,
} from '../controllers/stores/productController';
import { protectStore, requireVerifiedStore } from '../middleware/storeAuth';

const router = Router();

// All product management requires:
//   1. Valid store JWT (protectStore)
//   2. Store must be verified (requireVerifiedStore)
router.use(protectStore);
// router.use(requireVerifiedStore);

// ── Product CRUD ─────────────────────────────────────────────────────────────
// POST   /api/v1/stores/products
// GET    /api/v1/stores/products
// GET    /api/v1/stores/products/:id
// PUT    /api/v1/stores/products/:id
// PATCH  /api/v1/stores/products/:id/availability
// DELETE /api/v1/stores/products/:id

router.get('/',    getMyProducts);
router.post('/new',   createProductHandler);

router.get('/:id',    getMyProductById);
router.put('/:id',    updateProductHandler);
router.delete('/:id', deleteProductHandler);

// Lightweight availability-only update (no full product payload needed)
router.patch('/:id/availability', updateAvailability);

export default router;
