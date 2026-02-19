import express from 'express';
import {
    getAllRegions,
    getRegionsWithCount,
    getRegion,
    createRegion,
    updateRegion,
    deleteRegion,
    searchRegions,
    toggleRegionActive,
    reorderRegions
} from '../controllers/admin/regionController';
import { protect, authorize } from '../middleware/auth';

const router = express.Router();

// Public routes
router.get('/', getAllRegions);
router.get('/with-count', getRegionsWithCount);
router.get('/search', searchRegions);
router.get('/:id', getRegion);

// router.use(authorize('admin'));
// router.use(protect);

// Protected/Admin routes
router.post('/', createRegion);
router.put('/:id', updateRegion);
router.delete('/:id', deleteRegion);
router.patch('/:id/toggle-active', toggleRegionActive);
router.put('/reorder', reorderRegions);

export default router;