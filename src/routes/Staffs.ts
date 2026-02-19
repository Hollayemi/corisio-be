import { Router } from 'express';
import {
    getAllStaff,
    getStaffById,
    createStaff,
    loginStaff,
    updateStaff,
    updateStaffRole,
    deleteStaff,
    suspendStaff,
    unsuspendStaff,
    disableStaff,
    enableStaff,
    resetPassword,
    bulkSuspend,
    bulkDelete,
    getActivityLogs
} from '../controllers/admin/staffController';
import { protect, authorize, checkPermission } from '../middleware/auth';
import { validateStaffCreate, validateStaffLogin, validateStaffUpdate } from '../middleware/staffValidation';

const router = Router();

// All routes require authentication
router.post('/login', validateStaffLogin, loginStaff);
router.use(protect);

// Staff CRUD routes
router.get('/', checkPermission('view_users'), getAllStaff);
router.get('/one', checkPermission('view_users'), getStaffById);
router.post('/', checkPermission('create_users'), validateStaffCreate, createStaff);
router.put('/:id', checkPermission('view_users'), validateStaffUpdate, updateStaff);
router.put('/:id/role', checkPermission('assign_roles'), updateStaffRole);
router.delete('/:id', checkPermission('suspend_accounts'), deleteStaff);

// Account management routes
router.post('/:id/suspend', checkPermission('suspend_accounts'), suspendStaff);
router.post('/:id/unsuspend', checkPermission('suspend_accounts'), unsuspendStaff);
router.post('/:id/disable', checkPermission('disable_accounts'), disableStaff);
router.post('/:id/enable', checkPermission('disable_accounts'), enableStaff);
router.post('/:id/reset-password', checkPermission('view_users'), resetPassword);

// Bulk operations
router.post('/bulk/suspend', checkPermission('suspend_accounts'), bulkSuspend);
router.delete('/bulk/delete', checkPermission('suspend_accounts'), bulkDelete);

// Activity logs
router.get('/:id/activity-logs', checkPermission('access_reports'), getActivityLogs);

export default router;