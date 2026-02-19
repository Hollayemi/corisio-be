import { Router } from 'express';
import {
    createOrder,
    getUserOrders,
    getOrder,
    cancelOrder,
    trackOrder,
    rateOrder,
    getOrderStats
} from '../controllers/order';

import { protect } from '../middleware/auth';

const router = Router();

router.use(protect);


// @route   POST /api/v1/orders
// @desc    Create order from cart
router.post('/', createOrder);

// @route   GET /api/v1/orders
// @desc    Get user orders with pagination and filtering
router.get('/', getUserOrders);

// @route   GET /api/v1/orders/stats
// @desc    Get order statistics
router.get('/stats', getOrderStats);

// @route   GET /api/v1/orders/:id
// @desc    Get single order details
router.get('/:id', getOrder);

// @route   POST /api/v1/orders/:id/cancel
// @desc    Cancel an order
router.post('/:id/cancel', cancelOrder);

// @route   GET /api/v1/orders/:id/track
// @desc    Track order status
router.get('/:id/track', trackOrder);

// @route   POST /api/v1/orders/:id/rate
// @desc    Rate a delivered order
router.post('/:id/rate', rateOrder);


export default router;