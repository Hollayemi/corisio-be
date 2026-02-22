import { Router } from 'express';
import { getMyStoreAnalytics } from '../controllers/admin/analyticsController';
import { protectStore } from '../middleware/storeAuth';

const router = Router();

router.use(protectStore);

router.get('/analytics/me', getMyStoreAnalytics);

export default router;
