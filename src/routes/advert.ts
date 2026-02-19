import { Router } from 'express';
import {
    getAdverts,
    getAdvert,
    createAdvert,
    updateAdvert,
    deleteAdvert,
    toggleAdvertStatus,
    trackAdvertClick,
    getAdvertStats,
    reorderAdverts
} from '../controllers/admin/advertController';
import { protect, authorize } from '../middleware/auth';
import { upload } from '../services/cloudinary';

const router = Router();

// Public routes
router.get('/', getAdverts);
router.get('/:id', getAdvert);
router.post('/:id/click', trackAdvertClick);

// Protected/Admin routes
router.use(protect);
// router.use(authorize('admin'));

router.post('/', upload.single('image'), createAdvert);
router.get('/stats/summary', getAdvertStats);
router.put('/reorder', reorderAdverts);
router.put('/:id', upload.single('image'), updateAdvert);
router.delete('/:id', deleteAdvert);
router.patch('/:id/toggle', toggleAdvertStatus);

export default router;