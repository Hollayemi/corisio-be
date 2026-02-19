import { Router } from 'express';
import {
    getNigeriaStates
} from '../controllers/others/nigeriaStates';

const router = Router();

// Public routes
router.get('/nigeria-states', getNigeriaStates);

export default router;