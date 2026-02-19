import { Router } from 'express';
import {
    getAddresses,
    getAddress,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    getDefaultAddress
} from '../controllers/address';
import { protect } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(protect);

// @route   GET /api/v1/addresses/default
router.get('/default', getDefaultAddress);

// @route   GET /api/v1/addresses
// @desc    Get all addresses for user
router.get('/', getAddresses);

// @route   POST /api/v1/addresses
// @desc    Create new address
router.post('/', createAddress);

// @route   GET /api/v1/addresses/:id
// @desc    Get single address
router.get('/:id', getAddress);

// @route   PUT /api/v1/addresses/:id
// @desc    Update address
router.put('/:id', updateAddress);

// @route   DELETE /api/v1/addresses/:id
// @desc    Delete address
router.delete('/:id', deleteAddress);

// @route   PATCH /api/v1/addresses/:id/default
// @desc    Set address as default
router.patch('/:id/default', setDefaultAddress);


export default router;