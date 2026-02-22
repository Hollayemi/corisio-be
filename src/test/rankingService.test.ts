/**
 * Unit tests for rankingService.ts
 *
 * Run: npx jest src/tests/rankingService.test.ts
 * These are pure function tests — no database, no mocks needed.
 */

import {
    resolveBoostLevel,
    normalizeDistance,
    calcRecencyScore,
    scoreStore,
    rankStores,
    isBoostActive,
    RankableStore,
} from '../services/rankingService';
import { RankingConfig } from '../config/rankingConfig';

// ─────────────────────────────────────────────────────────────────────────────
// Test config — deterministic, not pulled from env
// ─────────────────────────────────────────────────────────────────────────────
const TEST_CONFIG: RankingConfig = {
    weights: { boost: 0.50, distance: 0.40, recency: 0.10 },
    boostScores: { none: 0, bronze: 1, silver: 2, gold: 3 },
    recencyWindowDays: 30,
    featuredMultiplier: 1.25,
};

const NOW = new Date('2024-11-20T12:00:00.000Z');
const RADIUS_5KM = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// resolveBoostLevel
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveBoostLevel', () => {
    test('returns "none" when level is already "none"', () => {
        expect(resolveBoostLevel('none', null, NOW)).toBe('none');
    });

    test('returns "none" when expiresAt is null', () => {
        expect(resolveBoostLevel('gold', null, NOW)).toBe('none');
    });

    test('returns "none" when expiresAt is in the past', () => {
        const expiredDate = new Date(NOW.getTime() - 1000);
        expect(resolveBoostLevel('silver', expiredDate, NOW)).toBe('none');
    });

    test('returns the boost level when expiresAt is in the future', () => {
        const futureDate = new Date(NOW.getTime() + 86_400_000);
        expect(resolveBoostLevel('gold', futureDate, NOW)).toBe('gold');
        expect(resolveBoostLevel('silver', futureDate, NOW)).toBe('silver');
        expect(resolveBoostLevel('bronze', futureDate, NOW)).toBe('bronze');
    });

    test('treats exactly-expired boost as "none"', () => {
        // expiresAt === NOW (not strictly greater than)
        expect(resolveBoostLevel('gold', NOW, NOW)).toBe('none');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// isBoostActive
// ─────────────────────────────────────────────────────────────────────────────
describe('isBoostActive', () => {
    test('returns false for none level', () => {
        const future = new Date(NOW.getTime() + 86_400_000);
        expect(isBoostActive('none', future)).toBe(false);
    });

    test('returns false for expired boost', () => {
        const past = new Date(NOW.getTime() - 1000);
        expect(isBoostActive('gold', past)).toBe(false);
    });

    test('returns true for active boost', () => {
        const future = new Date(NOW.getTime() + 86_400_000);
        expect(isBoostActive('silver', future)).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// normalizeDistance
// ─────────────────────────────────────────────────────────────────────────────
describe('normalizeDistance', () => {
    test('returns 1.0 for distance 0', () => {
        expect(normalizeDistance(0, RADIUS_5KM)).toBe(1);
    });

    test('returns 0.0 for distance equal to radius', () => {
        expect(normalizeDistance(RADIUS_5KM, RADIUS_5KM)).toBe(0);
    });

    test('returns 0.5 for distance halfway to radius', () => {
        expect(normalizeDistance(2500, RADIUS_5KM)).toBe(0.5);
    });

    test('clamps distance beyond radius to 0', () => {
        expect(normalizeDistance(6000, RADIUS_5KM)).toBe(0);
    });

    test('returns 0 if radius is 0', () => {
        expect(normalizeDistance(0, 0)).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// calcRecencyScore
// ─────────────────────────────────────────────────────────────────────────────
describe('calcRecencyScore', () => {
    test('returns 1.0 for brand-new store (same instant)', () => {
        const score = calcRecencyScore(NOW, 30, NOW);
        expect(score).toBeCloseTo(1.0, 5);
    });

    test('returns ~0.37 (1/e) at recency window boundary', () => {
        const createdAt = new Date(NOW.getTime() - 30 * 86_400_000);
        const score = calcRecencyScore(createdAt, 30, NOW);
        expect(score).toBeCloseTo(1 / Math.E, 2);
    });

    test('returns a value approaching 0 for very old stores', () => {
        const createdAt = new Date(NOW.getTime() - 365 * 86_400_000); // 1 year ago
        const score = calcRecencyScore(createdAt, 30, NOW);
        expect(score).toBeLessThan(0.01);
        expect(score).toBeGreaterThanOrEqual(0);
    });

    test('returns 0 when recencyWindowDays is 0', () => {
        expect(calcRecencyScore(NOW, 0, NOW)).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// scoreStore
// ─────────────────────────────────────────────────────────────────────────────
describe('scoreStore', () => {
    const baseStore = (overrides: Partial<RankableStore> = {}): RankableStore => ({
        _id: 'store1',
        boost: { level: 'none', expiresAt: null },
        isFeatured: false,
        createdAt: new Date(NOW.getTime() - 60 * 86_400_000), // 60 days old
        distanceMetres: 2500,
        ...overrides,
    });

    test('gold active boost scores higher than silver active boost', () => {
        const future = new Date(NOW.getTime() + 86_400_000);
        const goldStore  = baseStore({ boost: { level: 'gold',   expiresAt: future } });
        const silverStore = baseStore({ boost: { level: 'silver', expiresAt: future } });

        const goldScore   = scoreStore(goldStore,   RADIUS_5KM, TEST_CONFIG, NOW);
        const silverScore = scoreStore(silverStore, RADIUS_5KM, TEST_CONFIG, NOW);

        expect(goldScore.score).toBeGreaterThan(silverScore.score);
    });

    test('expired gold boost scores the same as no boost', () => {
        const past = new Date(NOW.getTime() - 1000);
        const expiredGold = baseStore({ boost: { level: 'gold', expiresAt: past } });
        const noBoost     = baseStore({ boost: { level: 'none', expiresAt: null } });

        const expiredScore  = scoreStore(expiredGold, RADIUS_5KM, TEST_CONFIG, NOW);
        const noBoostScore  = scoreStore(noBoost,     RADIUS_5KM, TEST_CONFIG, NOW);

        // Both should be equal because expired is treated as 'none'
        expect(expiredScore.score).toBeCloseTo(noBoostScore.score, 5);
    });

    test('closer store ranks higher than farther store (same boost)', () => {
        const nearStore = baseStore({ distanceMetres: 500  });
        const farStore  = baseStore({ distanceMetres: 4500 });

        const nearScore = scoreStore(nearStore, RADIUS_5KM, TEST_CONFIG, NOW);
        const farScore  = scoreStore(farStore,  RADIUS_5KM, TEST_CONFIG, NOW);

        expect(nearScore.score).toBeGreaterThan(farScore.score);
    });

    test('featured multiplier increases score', () => {
        const regular  = baseStore({ isFeatured: false });
        const featured = baseStore({ isFeatured: true  });

        const regularScore  = scoreStore(regular,  RADIUS_5KM, TEST_CONFIG, NOW);
        const featuredScore = scoreStore(featured, RADIUS_5KM, TEST_CONFIG, NOW);

        expect(featuredScore.score).toBeCloseTo(
            regularScore.score * TEST_CONFIG.featuredMultiplier,
            5
        );
    });

    test('new store gets higher recency score than old store', () => {
        const newStore = baseStore({ createdAt: new Date(NOW.getTime() - 1 * 86_400_000) });
        const oldStore = baseStore({ createdAt: new Date(NOW.getTime() - 90 * 86_400_000) });

        const newScore = scoreStore(newStore, RADIUS_5KM, TEST_CONFIG, NOW);
        const oldScore = scoreStore(oldStore, RADIUS_5KM, TEST_CONFIG, NOW);

        expect(newScore.score).toBeGreaterThan(oldScore.score);
    });

    test('score is in range [0, featuredMultiplier]', () => {
        const future = new Date(NOW.getTime() + 86_400_000);
        const bestCase = baseStore({
            boost: { level: 'gold', expiresAt: future },
            distanceMetres: 0,
            isFeatured: true,
            createdAt: NOW,
        });

        const result = scoreStore(bestCase, RADIUS_5KM, TEST_CONFIG, NOW);
        expect(result.score).toBeLessThanOrEqual(TEST_CONFIG.featuredMultiplier + 0.001);
        expect(result.score).toBeGreaterThan(0);
    });

    test('debug mode returns _debug breakdown', () => {
        const store = baseStore();
        const result = scoreStore(store, RADIUS_5KM, TEST_CONFIG, NOW, true);
        expect(result._debug).toBeDefined();
        expect(result._debug!.effectiveBoostLevel).toBe('none');
        expect(result._debug!.featuredMultiplierApplied).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// rankStores
// ─────────────────────────────────────────────────────────────────────────────
describe('rankStores', () => {
    const future = new Date(NOW.getTime() + 86_400_000);

    const stores: RankableStore[] = [
        {
            _id: 'far-bronze',
            boost: { level: 'bronze', expiresAt: future },
            isFeatured: false,
            createdAt: new Date(NOW.getTime() - 60 * 86_400_000),
            distanceMetres: 4000,
        },
        {
            _id: 'near-no-boost',
            boost: { level: 'none', expiresAt: null },
            isFeatured: false,
            createdAt: new Date(NOW.getTime() - 60 * 86_400_000),
            distanceMetres: 200,
        },
        {
            _id: 'mid-gold',
            boost: { level: 'gold', expiresAt: future },
            isFeatured: false,
            createdAt: new Date(NOW.getTime() - 60 * 86_400_000),
            distanceMetres: 2000,
        },
        {
            _id: 'mid-expired-gold',
            boost: { level: 'gold', expiresAt: new Date(NOW.getTime() - 1000) },
            isFeatured: false,
            createdAt: new Date(NOW.getTime() - 60 * 86_400_000),
            distanceMetres: 2000,
        },
    ];

    test('returns array sorted by descending score', () => {
        const ranked = rankStores(stores, RADIUS_5KM, TEST_CONFIG, NOW);
        for (let i = 0; i < ranked.length - 1; i++) {
            expect(ranked[i].score).toBeGreaterThanOrEqual(ranked[i + 1].score);
        }
    });

    test('gold active boost ranks highest', () => {
        const ranked = rankStores(stores, RADIUS_5KM, TEST_CONFIG, NOW);
        expect(ranked[0].store._id).toBe('mid-gold');
    });

    test('expired gold ranks similar to no-boost store', () => {
        const ranked = rankStores(stores, RADIUS_5KM, TEST_CONFIG, NOW);
        const expiredIdx = ranked.findIndex((r) => r.store._id === 'mid-expired-gold');
        const nearNoneIdx = ranked.findIndex((r) => r.store._id === 'near-no-boost');
        // near-no-boost is closer so should beat expired gold
        expect(nearNoneIdx).toBeLessThan(expiredIdx);
    });

    test('returns empty array for empty input', () => {
        expect(rankStores([], RADIUS_5KM, TEST_CONFIG, NOW)).toEqual([]);
    });
});
