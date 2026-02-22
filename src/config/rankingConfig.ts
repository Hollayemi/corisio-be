// ─────────────────────────────────────────────────────────────────────────────
// Ranking configuration for public store discovery
//
// All weights are loaded from environment variables so they can be tuned
// in production without a code deploy. Defaults are sensible starting values.
//
// WEIGHT DESIGN RATIONALE:
//   Boost (0.50): Primary incentive signal — stores that have earned their
//                 boost through referrals should noticeably rank higher.
//   Distance (0.40): Core UX — nearby stores are most useful to users.
//   Recency (0.10): Light lift for newly verified stores during their first
//                   30 days to help them get initial visibility.
//
// The three weights MUST sum to 1.0. If you change one, adjust the others.
// ─────────────────────────────────────────────────────────────────────────────

export interface RankingWeights {
    boost: number;
    distance: number;
    recency: number;
}

export interface RankingConfig {
    weights: RankingWeights;
    boostScores: Record<string, number>;
    recencyWindowDays: number;
    featuredMultiplier: number;
}

function parseFloat_safe(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
}

// Boost level → numeric score (0-3 scale)
// none is 0 — an expired boost is treated as 'none' before scoring
export const BOOST_SCORES: Record<string, number> = {
    none: 0,
    bronze: 1,
    silver: 2,
    gold: 3,
};

export function getRankingConfig(): RankingConfig {
    const boostWeight    = parseFloat_safe(process.env.RANKING_BOOST_WEIGHT,    0.50);
    const distanceWeight = parseFloat_safe(process.env.RANKING_DISTANCE_WEIGHT, 0.40);
    const recencyWeight  = parseFloat_safe(process.env.RANKING_RECENCY_WEIGHT,  0.10);

    return {
        weights: {
            boost:    boostWeight,
            distance: distanceWeight,
            recency:  recencyWeight,
        },
        boostScores: BOOST_SCORES,
        // How long a new store gets a recency lift (default 30 days)
        recencyWindowDays: parseFloat_safe(process.env.RANKING_RECENCY_WINDOW_DAYS, 30),
        // Featured stores (admin-flagged) get this multiplier applied to their final score
        featuredMultiplier: parseFloat_safe(process.env.RANKING_FEATURED_MULTIPLIER, 1.25),
    };
}
