/**
 * Referral attribution + virtual chip/cosmetic grants (Growth G2).
 * Served via api/media-config actions — no new serverless file.
 *
 * Scheme: ?ref={username} (or /invite/{username}) → usernames/{handle} → inviter uid.
 * Claim moment: new Auth account (creationTime within MAX_ACCOUNT_AGE_MS) with no referredBy.
 * Inviter grant gate: invitee has verified email OR phone (Firebase Auth).
 * Rewards: virtual chips only (not real money). Idempotent grant keys.
 */
'use strict';

const INVITEE_CHIPS = 150;
const INVITER_CHIPS = 250;
const MAX_ACCOUNT_AGE_MS = 72 * 60 * 60 * 1000; // 72h from Auth creation
const MAX_INVITER_REWARDS_PER_DAY = 20;
const COSMETIC_ID = 'invite_spark';

function normalizeRefCode(raw) {
  return String(raw || '')
    .replace(/^@/, '')
    .toLowerCase()
    .trim()
    .slice(0, 40);
}

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function resolveInviterUid(db, code) {
  const handle = normalizeRefCode(code);
  if (!handle || handle.length < 2) return null;
  const snap = await db.collection('usernames').doc(handle).get();
  if (!snap.exists) return null;
  const uid = String(snap.data()?.uid || '').trim();
  return uid || null;
}

async function grantChipsOnce(db, FieldValue, uid, { amount, reason, grantId }) {
  const grantRef = db.collection('users').doc(uid).collection('referralGrants').doc(grantId);
  const walletRef = db.collection('users').doc(uid).collection('wallet').doc('chips');
  const txRef = db.collection('users').doc(uid).collection('chipTransactions').doc();

  const result = await db.runTransaction(async (tx) => {
    const existing = await tx.get(grantRef);
    if (existing.exists) {
      return { ok: true, duplicate: true, amount: 0 };
    }
    const walletSnap = await tx.get(walletRef);
    const { STARTING_CHIPS } = require('./dangal-economy');
    let bal = 0;
    let life = 0;
    if (!walletSnap.exists) {
      bal = STARTING_CHIPS;
      life = STARTING_CHIPS;
      tx.set(walletRef, { balance: bal + amount, lifetimeEarned: life + amount, grantedStart: true }, { merge: true });
    } else {
      bal = Number(walletSnap.data()?.balance) || 0;
      life = Number(walletSnap.data()?.lifetimeEarned) || 0;
      tx.set(
        walletRef,
        { balance: bal + amount, lifetimeEarned: life + amount },
        { merge: true }
      );
    }
    tx.set(grantRef, {
      amount,
      reason: String(reason || 'referral').slice(0, 80),
      at: FieldValue.serverTimestamp(),
    });
    tx.set(txRef, {
      amount,
      reason: String(reason || 'referral').slice(0, 80),
      grantId,
      virtualOnly: true,
      at: FieldValue.serverTimestamp(),
    });
    return { ok: true, duplicate: false, amount, balance: bal + amount };
  });
  return result;
}

async function unlockInviteCosmetic(db, FieldValue, uid) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() || {} : {};
  const theme = data.profileTheme && typeof data.profileTheme === 'object' ? { ...data.profileTheme } : {};
  const unlocked = Array.isArray(theme.unlocked) ? theme.unlocked.slice() : [];
  if (unlocked.includes(COSMETIC_ID)) return { ok: true, already: true };
  unlocked.push(COSMETIC_ID);
  theme.unlocked = unlocked;
  await ref.set(
    {
      profileTheme: theme,
      referralFlair: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true, already: false, cosmeticId: COSMETIC_ID };
}

function inviteeVerified(authUser) {
  if (!authUser) return false;
  if (authUser.emailVerified) return true;
  if (authUser.phoneNumber) return true;
  const providers = authUser.providerData || [];
  return providers.some((p) => p && (p.providerId === 'google.com' || p.providerId === 'phone'));
}

async function claimReferral(db, admin, inviteeUid, body) {
  const FieldValue = admin.firestore.FieldValue;
  const code = normalizeRefCode(body?.code || body?.ref);
  if (!code) {
    const err = new Error('Missing referral code');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const inviteeRef = db.collection('users').doc(inviteeUid);
  const inviteeSnap = await inviteeRef.get();
  const inviteeData = inviteeSnap.exists ? inviteeSnap.data() || {} : {};
  if (inviteeData.referredBy) {
    return {
      ok: true,
      alreadyAttributed: true,
      referredBy: inviteeData.referredBy,
      rewards: null,
      note: 'Attribution already set — later refs ignored.',
    };
  }

  let authUser;
  try {
    authUser = await admin.auth().getUser(inviteeUid);
  } catch (e) {
    const err = new Error('Auth user not found');
    err.code = 'AUTH_ERROR';
    throw err;
  }
  const createdMs = Date.parse(authUser.metadata?.creationTime || '') || 0;
  if (!createdMs || Date.now() - createdMs > MAX_ACCOUNT_AGE_MS) {
    return {
      ok: false,
      reason: 'not_new_account',
      message: 'Referrals only attribute on new signups.',
    };
  }

  const inviterUid = await resolveInviterUid(db, code);
  if (!inviterUid) {
    return { ok: false, reason: 'invalid_code', message: 'Invite link not found.' };
  }
  if (inviterUid === inviteeUid) {
    return { ok: false, reason: 'self_referral', message: 'You cannot invite yourself.' };
  }

  // Same verified email/phone as inviter → block
  try {
    const inviterAuth = await admin.auth().getUser(inviterUid);
    const invEmail = String(inviterAuth.email || '').toLowerCase();
    const invPhone = String(inviterAuth.phoneNumber || '');
    const myEmail = String(authUser.email || '').toLowerCase();
    const myPhone = String(authUser.phoneNumber || '');
    if (invEmail && myEmail && invEmail === myEmail) {
      return { ok: false, reason: 'same_contact', message: 'Same account contact.' };
    }
    if (invPhone && myPhone && invPhone === myPhone) {
      return { ok: false, reason: 'same_contact', message: 'Same account contact.' };
    }
  } catch (e) {
    /* inviter may lack auth — still allow uid-based */
  }

  await inviteeRef.set(
    {
      referredBy: inviterUid,
      referralCode: code,
      referredAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db
    .collection('users')
    .doc(inviterUid)
    .set(
      {
        referralStats: {
          joinedCount: FieldValue.increment(1),
          lastJoinedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );

  const rewards = {
    invitee: null,
    inviter: null,
    cosmetic: null,
    pendingInviter: false,
    virtualOnly: true,
  };

  try {
    rewards.invitee = await grantChipsOnce(db, FieldValue, inviteeUid, {
      amount: INVITEE_CHIPS,
      reason: 'referral_welcome',
      grantId: `referral:${inviteeUid}:invitee`,
    });
  } catch (e) {
    console.warn('[referrals] invitee grant', e?.message || e);
    rewards.invitee = { ok: false, error: e?.message || 'grant_failed' };
  }

  try {
    rewards.cosmetic = await unlockInviteCosmetic(db, FieldValue, inviteeUid);
  } catch (e) {
    console.warn('[referrals] cosmetic', e?.message || e);
  }

  const verified = inviteeVerified(authUser);
  if (verified) {
    const inviterReward = await tryGrantInviter(db, FieldValue, inviterUid, inviteeUid);
    rewards.inviter = inviterReward;
  } else {
    rewards.pendingInviter = true;
    await inviteeRef.set(
      { referralInviterPending: true, referralInviterUid: inviterUid },
      { merge: true }
    );
  }

  return {
    ok: true,
    attributed: true,
    referredBy: inviterUid,
    referralCode: code,
    rewards,
    copy: 'Thanks — virtual chips · not real money.',
  };
}

async function tryGrantInviter(db, FieldValue, inviterUid, inviteeUid) {
  const dailyRef = db.collection('users').doc(inviterUid).collection('dailyCredits').doc(`ref_${dayKey()}`);
  const dailySnap = await dailyRef.get();
  const count = Number(dailySnap.data()?.referralRewards) || 0;
  if (count >= MAX_INVITER_REWARDS_PER_DAY) {
    return { ok: false, reason: 'inviter_daily_cap', amount: 0 };
  }
  const grant = await grantChipsOnce(db, FieldValue, inviterUid, {
    amount: INVITER_CHIPS,
    reason: 'referral_invitee_joined',
    grantId: `referral:${inviteeUid}:inviter`,
  });
  if (!grant.duplicate) {
    await dailyRef.set(
      {
        referralRewards: count + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await db
      .collection('users')
      .doc(inviterUid)
      .set(
        {
          referralStats: {
            rewardedCount: FieldValue.increment(1),
          },
        },
        { merge: true }
      );
  }
  return grant;
}

/** After invitee verifies email/phone — pay pending inviter once. */
async function activateReferral(db, admin, inviteeUid) {
  const FieldValue = admin.firestore.FieldValue;
  const inviteeRef = db.collection('users').doc(inviteeUid);
  const snap = await inviteeRef.get();
  const data = snap.exists ? snap.data() || {} : {};
  if (!data.referredBy) {
    return { ok: false, reason: 'no_attribution' };
  }
  let authUser;
  try {
    authUser = await admin.auth().getUser(inviteeUid);
  } catch (e) {
    return { ok: false, reason: 'auth_error' };
  }
  if (!inviteeVerified(authUser)) {
    return { ok: false, reason: 'not_verified' };
  }
  const inviterUid = String(data.referralInviterUid || data.referredBy);
  const grant = await tryGrantInviter(db, FieldValue, inviterUid, inviteeUid);
  if (data.referralInviterPending) {
    await inviteeRef.set({ referralInviterPending: false }, { merge: true });
  }
  return { ok: true, inviter: grant, virtualOnly: true };
}

async function getReferralStats(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  const stats = snap.exists ? snap.data()?.referralStats || {} : {};
  const usernameSnap = await db.collection('users').doc(uid).get();
  const username = usernameSnap.exists
    ? String(usernameSnap.data()?.username || '').replace(/^@/, '')
    : '';
  return {
    code: username || null,
    joinedCount: Number(stats.joinedCount) || 0,
    rewardedCount: Number(stats.rewardedCount) || 0,
    virtualOnly: true,
    note: 'Virtual chips · not real money',
  };
}

module.exports = {
  INVITEE_CHIPS,
  INVITER_CHIPS,
  MAX_ACCOUNT_AGE_MS,
  MAX_INVITER_REWARDS_PER_DAY,
  COSMETIC_ID,
  normalizeRefCode,
  resolveInviterUid,
  claimReferral,
  activateReferral,
  getReferralStats,
  grantChipsOnce,
};
