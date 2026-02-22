import { Router } from 'express';
import {
    getAllStores,
    getPendingStores,
    getStoreDetail,
    verifyStore,
    rejectStore,
    grantBoost,
    getReferralTree,
    getAllReferrals,
    flagReferral,
    unflagReferral,
    getExpiringBoosts,
    getBoostLedger,
    suspendStore,
} from '../controllers/admin/storeAdminController';
import {
    getReferralAnalytics,
    getOnboardingFunnel,
    getClusterDensity,
} from '../controllers/admin/analyticsController';
import {
    protect,
    requireCorisioAdmin,
    checkPermission,
} from '../middleware/auth';

const router = Router();

// All Corisio admin routes require:
//   1. A valid JWT (protect)
//   2. That JWT must belong to a CorisioAdmin account (requireCorisioAdmin)
router.use(protect);
router.use(requireCorisioAdmin);

// ── Store verification queue ────────────────────────────────────────────────
// Who can access: admin, verification_agent, super_admin
router.get('/stores',           checkPermission('view_stores'),   getAllStores);
router.get('/stores/pending',           checkPermission('view_stores'),   getPendingStores);
router.get('/stores/:id',               checkPermission('view_stores'),   getStoreDetail);
router.post('/stores/:id/verify',       checkPermission('create_stores'), verifyStore);
router.post('/stores/:id/reject',       checkPermission('create_stores'), rejectStore);
router.post('/stores/:id/suspend',       checkPermission('create_stores'), suspendStore);
router.get('/stores/:id/referral-tree', checkPermission('view_stores'),   getReferralTree);

// Who can access: admin, super_admin
router.post('/stores/:id/boost-grant',  checkPermission('manage_boosts'), grantBoost);

// ── Referral management ─────────────────────────────────────────────────────
// Who can access: admin, verification_agent, analyst, super_admin
router.get('/referrals',               checkPermission('view_referrals'),   getAllReferrals);

// Who can access: admin, super_admin
router.post('/referrals/:id/flag',     checkPermission('manage_referrals'), flagReferral);
router.post('/referrals/:id/unflag',   checkPermission('manage_referrals'), unflagReferral);

// ── Boost management ────────────────────────────────────────────────────────
// Who can access: admin, analyst, super_admin
router.get('/boosts/expiring',         checkPermission('view_boosts'), getExpiringBoosts);
router.get('/boosts/ledger/:storeId',  checkPermission('view_boosts'), getBoostLedger);

// ── Analytics ───────────────────────────────────────────────────────────────
// Who can access: analyst, admin, super_admin
router.get('/analytics/referrals',       checkPermission('access_reports'), getReferralAnalytics);
router.get('/analytics/onboarding',      checkPermission('access_reports'), getOnboardingFunnel);
router.get('/analytics/cluster-density', checkPermission('access_reports'), getClusterDensity);

export default router;
