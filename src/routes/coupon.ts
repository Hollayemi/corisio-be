import { Router } from 'express';
import {
    getCoupons,
    getCoupon,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    toggleCouponStatus,
    changeCouponStatus,
    bulkUpdateCoupons
} from '../controllers/admin/coupon';
import { protect, authorize } from '../middleware/auth';
import { validateCouponCreate, validateCouponUpdate } from '../middleware/couponValidation';

const router = Router();

router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/v1/admin/coupons
// @desc    Get all coupons with filtering and stats
router.get('/', getCoupons);

// @route   PATCH /api/v1/admin/coupons/bulk-update
// @desc    Bulk update coupons
router.patch('/bulk-update', bulkUpdateCoupons);

// @route   POST /api/v1/admin/coupons
// @desc    Create new coupon
router.post('/', validateCouponCreate, createCoupon);

// @route   GET /api/v1/admin/coupons/:id
// @desc    Get single coupon
router.get('/:id', getCoupon);

// @route   PUT /api/v1/admin/coupons/:id
// @desc    Update coupon
router.put('/:id', validateCouponUpdate, updateCoupon);

// @route   DELETE /api/v1/admin/coupons/:id
// @desc    Delete coupon
router.delete('/:id', deleteCoupon);

// @route   PATCH /api/v1/admin/coupons/:id/toggle-status
// @desc    Toggle coupon status (enable/disable)
router.patch('/:id/toggle-status', toggleCouponStatus);

// @route   PATCH /api/v1/admin/coupons/:id/status
// @desc    Change coupon status (draft/active)
router.patch('/:id/status', changeCouponStatus);

export default router;