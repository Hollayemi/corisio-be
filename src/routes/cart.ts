import { Router } from 'express';
import {
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    applyCoupon,
    removeCoupon,
    clearCart
} from '../controllers/cart';

import { protect } from '../middleware/auth';

const router = Router();
router.use(protect);


// @route   GET /api/v1/cart
// @desc    Get user cart with available coupons
router.get('/', getCart);

// @route   POST /api/v1/cart/items
// @desc    Add item to cart
router.post('/', addToCart);

// @route   PUT /api/v1/cart/items/:productId
// @desc    Update cart item quantity
router.put('/items/:productId', updateCartItem);

// @route   DELETE /api/v1/cart/items/:productId
// @desc    Remove item from cart
router.delete('/items/:productId', removeFromCart);

// @route   POST /api/v1/cart/coupon
// @desc    Apply coupon to cart
router.post('/coupon', applyCoupon);

// @route   DELETE /api/v1/cart/coupon/:code
// @desc    Remove coupon from cart
router.delete('/coupon/:code', removeCoupon);

// @route   DELETE /api/v1/cart
// @desc    Clear entire cart
router.delete('/', clearCart);


export default router;