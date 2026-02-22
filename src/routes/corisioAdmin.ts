import { Router } from 'express';
import {
    login,
    logout,
    refreshToken,
    getMe,
    changePassword,
    forgotPassword,
    resetPassword,
    getAllAdmins,
    getAdminById,
    createAdmin,
    updateAdmin,
    suspendAdmin,
    unsuspendAdmin,
    disableAdmin,
    adminResetPassword,
    deleteAdmin,
    getRolesAndPermissions,
} from '../controllers/admin/corisioAdminController';

import {
    protect,
    requireCorisioAdmin,
    requireSuperAdmin,
    checkPermission,
} from '../middleware/auth';

const router = Router();

// ── Public ───────────────────────────────────────────────────────────────────
router.post('/auth/login', login);
router.post('/auth/refresh-token', refreshToken);
router.post('/auth/forgot-password', forgotPassword);
router.put('/auth/reset-password/:token', resetPassword);

// ── All routes below require a valid Corisio Admin JWT ────────────────────────
router.use(protect);
router.use(requireCorisioAdmin);

// Auth — self-service
router.post('/auth/logout', logout);
router.get('/auth/me', getMe);
router.put('/auth/change-password', changePassword);

// Roles & permission catalogue (any admin can view)
router.get('/roles', checkPermission('view_admins'), getRolesAndPermissions);

// Admin account management
router.get('/admins', checkPermission('view_admins'), getAllAdmins);
router.get('/admins/:id', checkPermission('view_admins'), getAdminById);

// Create / update / delete — super_admin only
router.post('/admins', requireSuperAdmin, checkPermission('manage_admins'), createAdmin);
router.put('/admins/:id', requireSuperAdmin, checkPermission('manage_admins'), updateAdmin);
router.delete('/admins/:id', requireSuperAdmin, checkPermission('manage_admins'), deleteAdmin);

// Account lifecycle
router.post('/admins/:id/suspend', requireSuperAdmin, checkPermission('manage_admins'), suspendAdmin);
router.post('/admins/:id/unsuspend', requireSuperAdmin, checkPermission('manage_admins'), unsuspendAdmin);
router.post('/admins/:id/disable', requireSuperAdmin, checkPermission('manage_admins'), disableAdmin);
router.post('/admins/:id/reset-password', requireSuperAdmin, checkPermission('manage_admins'), adminResetPassword);

export default router;
