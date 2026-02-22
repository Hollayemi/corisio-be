import Store, { IStore } from '../models/Store';
import Referral, { IReferral } from '../models/Referral';
import BoostLedger from '../models/BoostLedger';
import logger from '../utils/logger';

type BoostLevel = 'none' | 'bronze' | 'silver' | 'gold';

interface BoostThreshold {
    min: number;
    duration: number; // days
}

const BOOST_THRESHOLDS: Record<string, BoostThreshold> = {
    bronze: { min: 1, duration: 30 },
    silver: { min: 4, duration: 60 },
    gold: { min: 10, duration: 90 }
};

// ─────────────────────────────────────────────
// Haversine distance in km
// ─────────────────────────────────────────────
function haversineDistance(
    [lng1, lat1]: [number, number],
    [lng2, lat2]: [number, number]
): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─────────────────────────────────────────────
// Anti-abuse checks
// ─────────────────────────────────────────────
export async function runAbuseChecks(
    referral: IReferral,
    referredStore: IStore
): Promise<boolean> {
    const flags: string[] = [];

    // 1. Self-referral
    if (referral.referrer.toString() === referral.referred.toString()) {
        flags.push('self_referral');
    }

    // 2. Duplicate phone already validated
    const existingByPhone = await Referral.findOne({
        referredPhoneNumber: referredStore.phoneNumber,
        status: 'validated',
        _id: { $ne: referral._id }
    });
    if (existingByPhone) flags.push('duplicate_phone');

    // 3. Circular referral — A referred B, B cannot refer A
    const circular = await Referral.findOne({
        referrer: referral.referred,
        referred: referral.referrer,
        status: 'validated'
    });
    if (circular) flags.push('circular_referral');

    // 4. Velocity — referrer submitted > 5 referrals in last 24h
    const recentCount = await Referral.countDocuments({
        referrer: referral.referrer,
        createdAt: { $gte: new Date(Date.now() - 86_400_000) }
    });
    if (recentCount > 5) flags.push('velocity_exceeded');

    // 5. Geo distance > 50km (soft flag — not auto-reject)
    const referrerStore = await Store.findById(referral.referrer).select(
        'address.coordinates'
    );
    if (
        referrerStore?.address?.coordinates?.coordinates &&
        referredStore?.address?.coordinates?.coordinates
    ) {
        const distKm = haversineDistance(
            referrerStore.address.coordinates.coordinates as [number, number],
            referredStore.address.coordinates.coordinates as [number, number]
        );
        if (distKm > 50) flags.push('geo_distance_warning');
    }

    // 6. Same device fingerprint
    const referredFull = await Store.findById(referral.referred).select(
        'deviceFingerprint'
    );
    if (
        referral.deviceFingerprintAtRegistration &&
        referredFull?.deviceFingerprint &&
        referral.deviceFingerprintAtRegistration === referredFull.deviceFingerprint
    ) {
        flags.push('same_device');
    }

    // 7. Same registration IP
    const referredIp = await Store.findById(referral.referred).select(
        'registrationIp'
    );
    if (
        referral.ipAtRegistration &&
        referredIp?.registrationIp &&
        referral.ipAtRegistration === referredIp.registrationIp
    ) {
        flags.push('same_ip_registration');
    }

    const HARD_FAIL_FLAGS = [
        'self_referral',
        'duplicate_phone',
        'circular_referral',
        'same_device'
    ];
    const hasHardFail = flags.some((f) => HARD_FAIL_FLAGS.includes(f));

    if (flags.length > 0) {
        referral.flagReason = flags.join(', ');
        if (hasHardFail) referral.flagged = true;
        await referral.save();
        logger.warn(`Referral ${referral._id} flagged: ${flags.join(', ')}`);
    }

    return !hasHardFail;
}

// ─────────────────────────────────────────────
// Validate referral after store is verified
// ─────────────────────────────────────────────
export async function validateReferral(verifiedStoreId: string): Promise<void> {
    const store = await Store.findById(verifiedStoreId);
    if (!store?.referredBy || store.referralValidated) return;

    const referral = await Referral.findOne({
        referred: verifiedStoreId,
        status: { $ne: 'rejected' },
        flagged: false
    });

    if (!referral) {
        logger.info(`No pending referral found for store ${verifiedStoreId}`);
        return;
    }

    const isClean = await runAbuseChecks(referral, store);
    if (!isClean) {
        referral.status = 'rejected';
        referral.flagged = true;
        referral.flagReason = (referral.flagReason || '') + '; failed at verification';
        await referral.save();
        logger.warn(`Referral ${referral._id} rejected at verification stage`);
        return;
    }

    // Mark referral validated
    const now = new Date();
    referral.status = 'validated';
    referral.boostApplied = true;
    referral.boostAppliedAt = now;
    referral.milestones.adminVerifiedAt = now;
    referral.milestones.validatedAt = now;
    await referral.save();

    // Mark on the referred store
    store.referralValidated = true;
    store.referralValidatedAt = now;
    await store.save();

    logger.info(`Referral validated for store ${verifiedStoreId} — referrer: ${referral.referrer}`);

    // Assign/upgrade boost on referrer
    await assignBoost(referral.referrer.toString(), referral._id?.toString());
}

// ─────────────────────────────────────────────
// Assign or upgrade boost based on validated count
// ─────────────────────────────────────────────
export async function assignBoost(
    referrerId: string,
    triggerReferralId?: string
): Promise<void> {
    const referrer = await Store.findById(referrerId);
    if (!referrer) return;

    const validatedCount = await Referral.countDocuments({
        referrer: referrerId,
        status: 'validated',
        boostApplied: true
    });

    const previousLevel = referrer.boost.level as BoostLevel;
    let newLevel: BoostLevel = 'none';
    let durationDays = 0;

    if (validatedCount >= BOOST_THRESHOLDS.gold.min) {
        newLevel = 'gold';
        durationDays = BOOST_THRESHOLDS.gold.duration;
    } else if (validatedCount >= BOOST_THRESHOLDS.silver.min) {
        newLevel = 'silver';
        durationDays = BOOST_THRESHOLDS.silver.duration;
    } else if (validatedCount >= BOOST_THRESHOLDS.bronze.min) {
        newLevel = 'bronze';
        durationDays = BOOST_THRESHOLDS.bronze.duration;
    }

    if (newLevel === 'none') return;

    const now = new Date();
    let expiresAt = new Date(now.getTime() + durationDays * 86_400_000);

    // Extend active boost instead of resetting it
    if (
        newLevel === previousLevel &&
        referrer.boost.expiresAt &&
        referrer.boost.expiresAt > now
    ) {
        expiresAt = new Date(
            referrer.boost.expiresAt.getTime() + durationDays * 86_400_000
        );
    }

    const isUpgrade = newLevel !== previousLevel;

    referrer.boost = {
        level: newLevel,
        activatedAt: isUpgrade ? now : referrer.boost.activatedAt,
        expiresAt,
        totalReferrals: validatedCount,
        source: 'referral'
    };

    await referrer.save();

    // Immutable ledger entry
    await BoostLedger.create({
        store: referrerId,
        event: previousLevel === 'none' ? 'activated' : isUpgrade ? 'upgraded' : 'activated',
        fromLevel: previousLevel,
        toLevel: newLevel,
        triggerReferral: triggerReferralId,
        expiresAt,
        note: `Validated referral count: ${validatedCount}`
    });

    logger.info(
        `Boost ${previousLevel === 'none' ? 'activated' : 'upgraded'} for store ${referrerId}: ${previousLevel} → ${newLevel}`
    );
}

// ─────────────────────────────────────────────
// Calculate profile completion score
// ─────────────────────────────────────────────
export function calculateProfileScore(store: Partial<IStore>): number {
    const weights: Record<string, number> = {
        storeName: 15,
        ownerName: 10,
        phoneNumber: 10,
        category: 10,
        address: 15,
        photos: 15,
        openingHours: 10,
        description: 10,
        website: 5
    };

    let score = 0;
    if (store.storeName) score += weights.storeName;
    if (store.ownerName) score += weights.ownerName;
    if (store.phoneNumber) score += weights.phoneNumber;
    if (store.category) score += weights.category;
    if (store.address?.raw) score += weights.address;
    if (store.photos && store.photos.length > 0) score += weights.photos;
    if (store.openingHours && store.openingHours.length > 0) score += weights.openingHours;
    if (store.description) score += weights.description;
    if (store.website) score += weights.website;
    return score;
}

// ─────────────────────────────────────────────
// Get boost progress info for a store
// ─────────────────────────────────────────────
export function getBoostProgress(totalReferrals: number): {
    currentLevel: BoostLevel;
    nextLevel: BoostLevel | null;
    referralsToNext: number;
} {
    let currentLevel: BoostLevel = 'none';
    let nextLevel: BoostLevel | null = 'bronze';
    let referralsToNext = BOOST_THRESHOLDS.bronze.min - totalReferrals;

    if (totalReferrals >= BOOST_THRESHOLDS.gold.min) {
        currentLevel = 'gold';
        nextLevel = null;
        referralsToNext = 0;
    } else if (totalReferrals >= BOOST_THRESHOLDS.silver.min) {
        currentLevel = 'silver';
        nextLevel = 'gold';
        referralsToNext = BOOST_THRESHOLDS.gold.min - totalReferrals;
    } else if (totalReferrals >= BOOST_THRESHOLDS.bronze.min) {
        currentLevel = 'bronze';
        nextLevel = 'silver';
        referralsToNext = BOOST_THRESHOLDS.silver.min - totalReferrals;
    }

    return { currentLevel, nextLevel, referralsToNext };
}

export default {
    validateReferral,
    assignBoost,
    runAbuseChecks,
    calculateProfileScore,
    getBoostProgress
};
