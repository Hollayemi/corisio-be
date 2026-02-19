import { Router } from 'express';
import {
    getAllRoles,
    getRoleById,
    createRole,
    updateRole,
    deleteRole,
    getAllPermissions,
    addPermissionToRole,
    removePermissionFromRole
} from '../controllers/admin/RoleController';
import { protect, checkPermission } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(protect);

// Permission routes
router.get('/permissions', getAllPermissions);

// Role CRUD routes
router.get('/', checkPermission('view_users'), getAllRoles);
router.get('/:id', checkPermission('view_users'), getRoleById);
router.post('/', checkPermission('manage_roles'), createRole);
router.put('/:id', checkPermission('manage_roles'), updateRole);
router.delete('/:id', checkPermission('manage_roles'), deleteRole);

// Permission management
router.post('/:id/permissions', checkPermission('manage_roles'), addPermissionToRole);
router.delete('/:id/permissions/:permissionId', checkPermission('manage_roles'), removePermissionFromRole);

export default router;