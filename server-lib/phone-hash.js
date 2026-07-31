/**
 * Privacy-preserving phone hash index helpers (contacts match).
 * Hash = SHA-256(E.164). Writes must be Admin-only and bound to
 * the Firebase Auth token's verified phone_number — never client-supplied.
 */
'use strict';

const crypto = require('crypto');

function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

/**
 * Normalize / validate an E.164 phone from a verified Auth token claim.
 * @returns {{ ok: true, phone: string, hash: string } | { ok: false, error: string }}
 */
function phoneHashFromVerifiedToken(decoded) {
  const phone = String(decoded?.phone_number || '').trim();
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    return { ok: false, error: 'NO_VERIFIED_PHONE' };
  }
  return { ok: true, phone, hash: sha256Hex(phone) };
}

/**
 * Build the Admin write payload for phoneHashIndex/{hash}.
 * Ignores any client-supplied hash/phone — only token-derived values.
 */
function buildPhoneHashRecord(uid, decoded, nowMs = Date.now()) {
  const resolved = phoneHashFromVerifiedToken(decoded);
  if (!resolved.ok) return resolved;
  const owner = String(uid || '').trim();
  if (!owner) return { ok: false, error: 'MISSING_UID' };
  return {
    ok: true,
    hash: resolved.hash,
    phone: resolved.phone,
    data: { uid: owner, updatedAt: nowMs },
  };
}

module.exports = {
  sha256Hex,
  phoneHashFromVerifiedToken,
  buildPhoneHashRecord,
};
