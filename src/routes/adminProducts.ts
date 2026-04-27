import { Router } from 'express';
import {
    listAllProducts,
    toggleProductActive,
    getProductStats,
    getProductDetail,
} from '../controllers/admin/productAdminController';
import {
    protect,
    requireCorisioAdmin,
    checkPermission,
} from '../middleware/auth';

const router = Router();

// All admin product routes require:
//   1. A valid JWT (protect)
//   2. That JWT must belong to a CorisioAdmin (requireCorisioAdmin)
router.use(protect);
router.use(requireCorisioAdmin);

// ── Product management ───────────────────────────────────────────────────────
// Who can access: admin, super_admin (manage_config)

// GET  /api/v1/admin/products
// Query: storeId, category, sub_category, product_group,
//        isActive, availability, condition, search, page, limit
router.get('/',          checkPermission('manage_config'), listAllProducts);

// GET  /api/v1/admin/products/stats
router.get('/stats',     checkPermission('manage_config'), getProductStats);

// GET  /api/v1/admin/products/:id
router.get('/:id',       checkPermission('manage_config'), getProductDetail);

// PATCH /api/v1/admin/products/:id/toggle-active
router.patch('/:id/toggle-active', checkPermission('manage_config'), toggleProductActive);

export default router;
