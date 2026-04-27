import { Router } from 'express';
import {
    searchPublicProducts,
    getPublicProduct,
    getStoreProductsPublic,
} from '../controllers/public/productSearchController';

const router = Router();

// ── No authentication on any of these routes ─────────────────────────────────

// GET /api/v1/public/products/search
// Query: query, category, sub_category, product_group,
//        condition, availability, minPrice, maxPrice,
//        tags (comma-separated), lat, lng, radius,
//        page, limit, sortBy
router.get('/products/search', searchPublicProducts);

// GET /api/v1/public/products/:id
router.get('/products/:id', getPublicProduct);

// GET /api/v1/public/stores/:storeId/products
// Returns active in-stock products for a specific verified store
router.get('/stores/:storeId/products', getStoreProductsPublic);

export default router;
