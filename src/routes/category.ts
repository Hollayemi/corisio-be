import express from 'express';
import {
    getAllCategories,
    getCategoriesWithCount,
    getCategory,
    getCategoryWithProducts,
    createCategory,
    updateCategory,
    deleteCategory,
    searchCategories,
    toggleCategoryActive,
    reorderCategories
} from '../controllers/admin/categoryController';
import { protect, authorize } from '../middleware/auth';
import { upload } from '../services/cloudinary';

const router = express.Router();

// Public routes
router.get('/', getAllCategories);
router.get('/with-count', getCategoriesWithCount);
router.get('/search', searchCategories);
router.get('/filter/:id', getCategoryWithProducts);
router.get('/:id', getCategory);

// Protected/Admin routes
router.use(protect);
router.use(authorize('admin'));

router.post('/', upload.single('icon'), createCategory);
router.put('/:id', upload.single('icon'), updateCategory);
router.delete('/:id', deleteCategory);
router.patch('/:id/toggle-active', toggleCategoryActive);
router.put('/reorder', reorderCategories);

export default router;