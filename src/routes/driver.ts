import { Router } from 'express';
import {
    getAllDrivers,
    getDriverById,
    createDriver,
    updateDriver,
    deleteDriver,
    verifyDriver,
    rejectDriver,
    suspendDriver,
    unsuspendDriver,
    disableDriver,
    enableDriver,
    resendPasswordLink,
    bulkSuspend,
    bulkDelete,
    getActivityLogs,
    getDriverStatistics,
    getDashboardSummary
} from '../controllers/driver';
import { protect, checkPermission } from '../middleware/auth';
import { upload } from '../services/cloudinary';
import { validateDriverCreate, validateDriverUpdate } from '../middleware/driverValidation';

const router = Router();

// All routes require authentication
router.use(protect);

// Dashboard and statistics
router.get('/dashboard/summary', checkPermission('view_users'), getDashboardSummary);

// Driver CRUD routes
router.get('/', checkPermission('view_users'), getAllDrivers);
router.get('/:id', checkPermission('view_users'), getDriverById);
router.post(
    '/',
    checkPermission('create_users'),
    upload.fields([
        { name: 'profilePhoto', maxCount: 1 },
        { name: 'driversLicense', maxCount: 1 }
    ]),
    validateDriverCreate,
    createDriver
);
router.put(
    '/:id',
    checkPermission('view_users'),
    upload.fields([
        { name: 'profilePhoto', maxCount: 1 },
        { name: 'driversLicense', maxCount: 1 }
    ]),
    validateDriverUpdate,
    updateDriver
);
router.delete('/:id', checkPermission('suspend_accounts'), deleteDriver);

// Verification routes
router.post('/:id/verify', checkPermission('create_users'), verifyDriver);
router.post('/:id/reject', checkPermission('create_users'), rejectDriver);

// Account management routes
router.post('/:id/suspend', checkPermission('suspend_accounts'), suspendDriver);
router.post('/:id/unsuspend', checkPermission('suspend_accounts'), unsuspendDriver);
router.post('/:id/disable', checkPermission('disable_accounts'), disableDriver);
router.post('/:id/enable', checkPermission('disable_accounts'), enableDriver);
router.post('/:id/resend-password-link', checkPermission('view_users'), resendPasswordLink);

// Statistics and activity
router.get('/:id/statistics', checkPermission('access_reports'), getDriverStatistics);
router.get('/:id/activity-logs', checkPermission('access_reports'), getActivityLogs);

// Bulk operations
router.post('/bulk/suspend', checkPermission('suspend_accounts'), bulkSuspend);
router.delete('/bulk/delete', checkPermission('suspend_accounts'), bulkDelete);

export default router;