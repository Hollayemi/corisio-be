import cron from 'node-cron';
import NotificationController from '../../controllers/others/notification';
// import PushNotificationService from '../pushNotificationService';
// import SocketSession from '../../models/Auth/userSession';
import logger from '../../utils/logger';

/**
 * Initialize all notification-related cron jobs
 */
function initializeNotificationCronJobs(): void {
    /**
     * Process scheduled notifications
     * Runs every minute
     */
    cron.schedule('* * * * *', async () => {
        try {
            await NotificationController.processScheduledNotifications();
        } catch (error) {
            logger.error('Scheduled notifications cron error:', error);
        }
    });

    /**
     * Clean up old notifications
     * Runs daily at 2 AM
     */
    cron.schedule('0 2 * * *', async () => {
        try {
            await NotificationController.cleanupOldNotifications();
        } catch (error) {
            logger.error('Cleanup cron error:', error);
        }
    });

    /**
     * Send digest notifications (daily summary)
     * Runs daily at 6 PM
     */
    cron.schedule('0 18 * * *', async () => {
        try {
            await sendDailyDigest();
        } catch (error) {
            logger.error('Daily digest cron error:', error);
        }
    });

    //  Clean up expired notifications
    //  Runs every hour
    cron.schedule('0 * * * *', async () => {
        try {
            const UserNotification = require('../models/user/notification');

            const result = await UserNotification.deleteMany({
                expiresAt: { $lt: new Date() },
                unread: 0
            });

            if (result.deletedCount > 0) {
                logger.info(`Deleted ${result.deletedCount} expired notifications`);
            }
        } catch (error) {
            logger.error('Expired notifications cleanup error:', error);
        }
    });

    logger.info('✅ Notification cron jobs initialized');
}


// daily digest sender
async function sendDailyDigest(): Promise<void> {
    try {
        const UserNotification = require('../models/user/notification');
        const UserSchema = require('../models/Auth/userModel');

        const usersWithUnread = await UserNotification.aggregate([
            {
                $match: {
                    unread: 1,
                    createdAt: {
                        $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
                    }
                }
            },
            {
                $group: {
                    _id: '$userId',
                    count: { $sum: 1 }
                }
            },
            {
                $match: {
                    count: { $gte: 3 } // At least 3 unread notifications
                }
            }
        ]);

        logger.info(`Sending daily digest to ${usersWithUnread.length} users`);

        for (const { _id: userId, count } of usersWithUnread) {
            const user = await UserSchema.findById(userId)
                .select('notification_pref email firstName')
                .lean();

            if (!user?.notification_pref?.email_notification) {
                continue;
            }

            await NotificationController.saveAndSendNotification({
                userId,
                title: 'Daily Summary',
                body: `You have ${count} unread notifications from today`,
                type: 'system',
                priority: 'low',
                silent: true
            }, 'user', {
                skipPush: true,
                sendEmail: true
            });
        }

        logger.info('Daily digest sent successfully');

    } catch (error) {
        logger.error('Send daily digest error:', error);
    }
}



// shutdown
function stopNotificationCronJobs(): void {
    cron.getTasks().forEach(task => task.stop());
    logger.info('Notification cron jobs stopped');
}

export {
    initializeNotificationCronJobs,
    stopNotificationCronJobs
};