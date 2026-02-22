// ─────────────────────────────────────────────────────────────────────────────
// Ranking Service — Pure Functions
//
// All functions here are pure: same inputs always produce same outputs,
// no database calls, no side effects. Fully unit-testable without mocks.
//
// Ranking formula:
//   finalScore = (boostWeight × boostScore)
//              + (distanceWeight × normalizedDistance)
//              + (recencyWeight × recencyScore)
//
//   If store.isFeatured: finalScore × featuredMultiplier
// ─────────────────────────────────────────────────────────────────────────────

import { getRankingConfig, BOOST_SCORES, RankingConfig } from '../config/rankingConfig';

export interface RankableStore {
    _id: string;
    boost: {
        level: string;
        expiresAt?: Date | null;
    };
    isFeatured: boolean;
    createdAt: Date;
    distanceMetres: number;   // from MongoDB $geoNear dist.calculated
}

export interface RankedStore<T extends RankableStore> {
    store: T;
    score: number;
    _debug?: {
        boostContribution: number;
        distanceContribution: number;
        recencyContribution: number;
        effectiveBoostLevel: string;
        featuredMultiplierApplied: boolean;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve boost level — treats expired boosts as 'none'
// This is the single source of truth for "is a boost currently active"
// ─────────────────────────────────────────────────────────────────────────────
export function resolveBoostLevel(
    level: string,
    expiresAt: Date | null | undefined,
    now: Date = new Date()
): string {
    if (level === 'none') return 'none';
    if (!expiresAt) return 'none';
    return expiresAt > now ? level : 'none';
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalise distance to a 0-1 score
//   - Distance 0 metres   → 1.0  (best)
//   - Distance = radius   → 0.0  (worst within radius)
//   - Beyond radius is excluded by the Mongo query — never reaches here
// ─────────────────────────────────────────────────────────────────────────────
export function normalizeDistance(distanceMetres: number, radiusMetres: number): number {
    if (radiusMetres <= 0) return 0;
    const clamped = Math.max(0, Math.min(distanceMetres, radiusMetres));
    return 1 - clamped / radiusMetres;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recency score — exponential decay over the recency window
//   - Verified today        → 1.0
//   - At recencyWindowDays  → ~0.37 (1/e)
//   - Beyond window         → approaches 0 (never negative)
// ─────────────────────────────────────────────────────────────────────────────
export function calcRecencyScore(
    createdAt: Date,
    recencyWindowDays: number,
    now: Date = new Date()
): number {
    if (recencyWindowDays <= 0) return 0;
    const ageMs = now.getTime() - createdAt.getTime();
    const ageSeconds = ageMs / 1000;
    const windowSeconds = recencyWindowDays * 86_400;
    return Math.exp(-ageSeconds / windowSeconds);
}

// ─────────────────────────────────────────────────────────────────────────────
// Score a single store
// ─────────────────────────────────────────────────────────────────────────────
export function scoreStore<T extends RankableStore>(
    store: T,
    radiusMetres: number,
    config: RankingConfig,
    now: Date = new Date(),
    debug = false
): RankedStore<T> {
    const { weights, boostScores, recencyWindowDays, featuredMultiplier } = config;

    // 1. Boost
    const effectiveLevel = resolveBoostLevel(
        store.boost.level,
        store.boost.expiresAt,
        now
    );
    const rawBoostScore = boostScores[effectiveLevel] ?? 0;
    const maxBoostScore = Math.max(...Object.values(boostScores));
    const normalizedBoost = maxBoostScore > 0 ? rawBoostScore / maxBoostScore : 0;
    const boostContribution = weights.boost * normalizedBoost;

    // 2. Distance
    const normalizedDist = normalizeDistance(store.distanceMetres, radiusMetres);
    const distanceContribution = weights.distance * normalizedDist;

    // 3. Recency
    const recencyScore = calcRecencyScore(store.createdAt, recencyWindowDays, now);
    const recencyContribution = weights.recency * recencyScore;

    // 4. Sum
    let finalScore = boostContribution + distanceContribution + recencyContribution;

    // 5. Featured multiplier
    const featuredApplied = store.isFeatured;
    if (featuredApplied) {
        finalScore *= featuredMultiplier;
    }

    const result: RankedStore<T> = { store, score: finalScore };

    if (debug) {
        result._debug = {
            boostContribution: parseFloat(boostContribution.toFixed(4)),
            distanceContribution: parseFloat(distanceContribution.toFixed(4)),
            recencyContribution: parseFloat(recencyContribution.toFixed(4)),
            effectiveBoostLevel: effectiveLevel,
            featuredMultiplierApplied: featuredApplied,
        };
    }

    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rank an array of stores — sorts descending by score
// ─────────────────────────────────────────────────────────────────────────────
export function rankStores<T extends RankableStore>(
    stores: T[],
    radiusMetres: number,
    config?: RankingConfig,
    now: Date = new Date()
): RankedStore<T>[] {
    const cfg = config ?? getRankingConfig();

    return stores
        .map((store) => scoreStore(store, radiusMetres, cfg, now))
        .sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public helper — check if a boost is currently active (used by controllers)
// ─────────────────────────────────────────────────────────────────────────────
export function isBoostActive(
    level: string,
    expiresAt: Date | null | undefined
): boolean {
    return resolveBoostLevel(level, expiresAt) !== 'none';
}
