import { Router } from 'express';
import {
    getProducts,
    getProduct,
    getProductBySku,
    createProduct,
    updateProduct,
    deleteProduct,
    updateStock,
    addVariant,
    updateVariant,
    deleteVariant,
    updateRegionalDistribution,
    getLowStockProducts,
    bulkUpdateProducts,
    getProductPreview,
    getStockHistory,
    setDealsOfTheDay,
    getDealsOfTheDay,
    removeFromDeals
} from '../controllers/admin/ProductController';
import { protect, authorize, ifToken } from '../middleware/auth';
import {
    validateProductCreate,
    validateProductUpdate,
    validateVariant,
    validateStockUpdate,
    validateBulkUpdate
} from '../middleware/productValidation';
import { upload } from '../services/cloudinary';

const router = Router();

// Public routes
router.get('/deals/deals-of-the-day', getDealsOfTheDay);
router.get('/sku/:sku', getProductBySku);
router.get('/:id', getProduct);

router.use(ifToken)

router.get('/', getProducts);

// Protected/Admin routes
router.use(protect);
router.use(authorize('admin'));

router.get('/low-stock/products', getLowStockProducts);
router.patch('/bulk-update', validateBulkUpdate, bulkUpdateProducts);

// Deals of the day management
router.post('/deals-of-the-day', setDealsOfTheDay);
router.delete('/:id/deals', removeFromDeals);

// Product preview with analytics
router.get('/:id/preview', getProductPreview);
router.get('/:id/stock-history', getStockHistory);

// Product CRUD with image upload
router.post('/', upload.array('images', 5), validateProductCreate, createProduct);
router.put('/', upload.array('images', 5), validateProductUpdate, updateProduct);
router.delete('/:id', deleteProduct);

// Stock management
router.patch('/:id/stock', validateStockUpdate, updateStock);

// Variants
router.post('/:id/variants', validateVariant, addVariant);
router.put('/:id/variants/:variantId', validateVariant, updateVariant);
router.delete('/:id/variants/:variantId', deleteVariant);

// Regional distribution
router.put('/:id/distribution', updateRegionalDistribution);

export default router;