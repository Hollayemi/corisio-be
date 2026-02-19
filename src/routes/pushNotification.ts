import { Router } from 'express';
import {
    getAllNotifications,
    getNotificationById,
    createNotification,
    updateNotification,
    sendNotification,
    testNotification,
    estimateRecipients,
    deleteNotification,
    trackDelivered,
    trackClicked,
    getStatistics
} from '../controllers/pushNotificationController';
import { protect, checkPermission } from '../middleware/auth';
import { upload } from '../services/cloudinary';
import { validateNotificationCreate, validateNotificationUpdate } from '../middleware/pushNotificationValidation.middleware';

const router = Router();

// Public routes (for mobile app tracking)
router.post('/:id/delivered', trackDelivered);
router.post('/:id/clicked', trackClicked);

// All other routes require authentication
router.use(protect);

// Statistics
router.get('/statistics', checkPermission('access_reports'), getStatistics);

// Test notification
router.post('/test', checkPermission('manage_promotions'), testNotification);

// Estimate recipients
router.post('/estimate-recipients', checkPermission('manage_promotions'), estimateRecipients);

// CRUD routes
router.get('/', checkPermission('manage_promotions'), getAllNotifications);
router.get('/:id', checkPermission('manage_promotions'), getNotificationById);
router.post(
    '/',
    checkPermission('manage_promotions'),
    upload.single('image'),
    validateNotificationCreate,
    createNotification
);
router.put(
    '/:id',
    checkPermission('manage_promotions'),
    upload.single('image'),
    validateNotificationUpdate,
    updateNotification
);
router.delete('/:id', checkPermission('manage_promotions'), deleteNotification);

// Send notification
router.post('/:id/send', checkPermission('manage_promotions'), sendNotification);

export default router;
