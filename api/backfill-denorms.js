/**
 * Cron / manual: backfill group isPublic/nameLower + users_public projections.
 * Auth: Bearer CRON_SECRET
 *
 * GET/POST /api/backfill-denorms
 * Optional ?reset=1 to clear cursors and re-run.
 */
const { sendSuccess, sendError, requireMethod } = require('../server-lib/http');
const { requireCronSecret, initAdmin } = require('../server-lib/auth');
const { runDenormBackfillPage } = require('../server-lib/backfill-denorms');

module.exports = async (req, res) => {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  if (!requireCronSecret(req, res)) return;

  try {
    const admin = initAdmin();
    if (!admin) {
      return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'FIREBASE_SERVICE_ACCOUNT_JSON is required');
    }
    const db = admin.firestore();

    const reset = String(req.query?.reset || '') === '1' || req.body?.reset === true;
    if (reset) {
      await db.collection('chaupaalMeta').doc('denormBackfill').set(
        {
          groupsDone: false,
          usersDone: false,
          groupsLastId: null,
          usersLastId: null,
          groupsPatchedTotal: 0,
          usersPatchedTotal: 0,
          resetAt: new Date(),
        },
        { merge: true }
      );
    }

    // Multiple pages per invoke so one cron/manual hit progresses meaningfully
    const pages = [];
    for (let i = 0; i < 5; i++) {
      const page = await runDenormBackfillPage(db);
      pages.push(page);
      const gDone = !!(page.groups?.done || page.groups?.skipped);
      const uDone = !!(page.usersPublic?.done || page.usersPublic?.skipped);
      if (gDone && uDone) break;
    }

    const meta = (await db.collection('chaupaalMeta').doc('denormBackfill').get()).data() || {};
    return sendSuccess(res, {
      pages,
      meta: {
        groupsDone: !!meta.groupsDone,
        usersDone: !!meta.usersDone,
        groupsPatchedTotal: meta.groupsPatchedTotal || 0,
        usersPatchedTotal: meta.usersPatchedTotal || 0,
      },
    });
  } catch (e) {
    console.error('[backfill-denorms]', e?.message || e);
    return sendError(res, 500, 'BACKFILL_FAILED', e?.message || 'Backfill failed');
  }
};
