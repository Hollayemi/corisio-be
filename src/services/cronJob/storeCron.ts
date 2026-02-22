import cron from 'node-cron';
import Store from '../../models/Store';
import BoostLedger from '../../models/BoostLedger';
import logger from '../../utils/logger';

export function initializeStoreCronJobs(): void {

    // ── Expire boosts — runs daily at midnight ─────────
    cron.schedule('0 0 * * *', async () => {
        try {
            const now = new Date();

            const expiredStores = await Store.find({
                'boost.level': { $ne: 'none' },
                'boost.expiresAt': { $lt: now }
            }).select('_id boost storeName');

            for (const store of expiredStores) {
                const previousLevel = store.boost.level;

                await Store.findByIdAndUpdate(store._id, {
                    $set: {
                        'boost.level': 'none',
                        'boost.activatedAt': undefined,
                        'boost.expiresAt': undefined
                    }
                });

                await BoostLedger.create({
                    store: store._id,
                    event: 'expired',
                    fromLevel: previousLevel,
                    toLevel: 'none',
                    expiresAt: now,
                    note: 'Boost expired automatically'
                });

                logger.info(`Boost expired for store: ${store.storeName} (was ${previousLevel})`);
            }

            if (expiredStores.length > 0) {
                logger.info(`Expired ${expiredStores.length} store boost(s)`);
            }
        } catch (error) {
            logger.error('Boost expiry cron error:', error);
        }
    });

    // ── Remind incomplete profiles — daily at 9 AM ─────
    cron.schedule('0 9 * * *', async () => {
        try {
            const oneDayAgo = new Date(Date.now() - 86_400_000);
            const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000);

            const incompleteStores = await Store.find({
                onboardingStatus: 'phone_verified',
                profileCompletionScore: { $lt: 50 },
                createdAt: {
                    $gte: threeDaysAgo,
                    $lte: new Date(Date.now() - 60_000) // at least 1 min old
                }
            }).select('phoneNumber storeName createdAt');

            for (const store of incompleteStores) {
                const ageMs = Date.now() - store.createdAt.getTime();
                const isDay1 = ageMs < 2 * 86_400_000;
                const isDay3 = ageMs >= 2 * 86_400_000;

                if (isDay1 || isDay3) {
                    // TODO: Twilio SMS
                    logger.info(
                        `[REMINDER SMS] ${store.phoneNumber}: Complete your Corisio profile to go live!`
                    );
                }
            }
        } catch (error) {
            logger.error('Profile reminder cron error:', error);
        }
    });

    // ── Alert admin: pending verifications > 48h — daily at 8 AM ─
    cron.schedule('0 8 * * *', async () => {
        try {
            const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);

            const staleCount = await Store.countDocuments({
                onboardingStatus: 'profile_complete',
                updatedAt: { $lt: twoDaysAgo }
            });

            if (staleCount > 0) {
                // TODO: notify admin via Slack/email
                logger.warn(
                    `[ADMIN ALERT] ${staleCount} store(s) pending verification for > 48 hours`
                );
            }
        } catch (error) {
            logger.error('Stale verification alert cron error:', error);
        }
    });

    logger.info('✅ Store cron jobs initialized');
}

export default { initializeStoreCronJobs };
