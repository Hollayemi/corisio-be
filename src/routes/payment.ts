import { Router } from 'express';
import PurchaseController from '../controllers/payment/index';
import { protect } from '../middleware/auth';

const router = Router();

// @route   GET /api/v1/payment/callback
// @desc    Payment gateway callback handler
// @access  Public (called by payment providers)
router.get('/callback', PurchaseController.paystackCallBackVerify);

// @route   POST /api/v1/payment/webhook/:provider
// @desc    Payment gateway webhook handler
// @access  Public (called by payment providers)
router.post('/webhook/:provider', PurchaseController.handleWebhook);

// @route   GET /api/v1/payment/service-charge
// @desc    Get service charge for payment method
// @access  Public
router.get('/service-charge', PurchaseController.getServiceCharge);

// @route   GET /api/v1/payment/methods
// @desc    Get supported payment methods
// @access  Public
router.get('/methods', PurchaseController.getPaymentMethods);

// @route   POST /api/v1/payment/verify
// @desc    Manually verify a payment
// @access  Private
router.post('/verify', protect, PurchaseController.verifyPayment);

export default router;