import { Router } from 'express';
import {
   addDefaultSpecs,
   addCorisioCategories,
   getCorisioCategories
} from '../controllers/config/categoriesConfig';
import { ifStoreToken } from '../middleware/storeAuth';

const router = Router();

// ── No authentication on any of these routes ─────────────────────────────────

// GET /api/v1/configure/spec
router.get('/spec', addDefaultSpecs);

// GET /api/v1/configure/categories
router.get('/categories', addCorisioCategories);


router.use(ifStoreToken);
// GET /api/v1/categories/categories/thread?for_store=true
router.get('/categories/thread', getCorisioCategories);


export default router;
