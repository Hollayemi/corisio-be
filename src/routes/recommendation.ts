import { Router } from 'express';
import {
    getPersonalizedRecommendations,
    getCartBasedRecommendations,
    getOrderBasedRecommendations,
    getTrendingProducts,
    getRecommendationsByCategory,
    getSimilarProducts,
    getFrequentlyBoughtTogether
} from '../controllers/recommendationController';
import { protect } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/trending', getTrendingProducts);
router.get('/by-category/:category', getRecommendationsByCategory);
router.get('/similar/:productId', getSimilarProducts);
router.get('/bought-together/:productId', getFrequentlyBoughtTogether);

// Protected routes (require authentication)
router.use(protect);

router.get('/for-you', getPersonalizedRecommendations);
router.get('/cart-based', getCartBasedRecommendations);
router.get('/order-based', getOrderBasedRecommendations);

export default router;