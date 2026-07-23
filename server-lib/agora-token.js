/**
 * Agora RTC token mint (Part 2 Phase 5 — Mehfil).
 * Env: AGORA_APP_ID + AGORA_APP_CERTIFICATE.
 * Returns { configured:false } when secrets missing — no silent provider switch.
 */
const crypto = require('crypto');

function getAgoraConfig() {
  const appId = String(process.env.AGORA_APP_ID || '').trim();
  const appCertificate = String(process.env.AGORA_APP_CERTIFICATE || '').trim();
  return {
    configured: !!(appId && appCertificate),
    appId,
    appCertificate,
  };
}

function uidToNumber(uid) {
  let numericUid = Number(uid);
  if (Number.isFinite(numericUid) && numericUid > 0) return numericUid >>> 0;
  const h = crypto.createHash('sha1').update(String(uid || 'anon')).digest();
  numericUid = h.readUInt32BE(0) >>> 0;
  return numericUid === 0 ? 1 : numericUid;
}

/**
 * @param {{ channel: string, uid: string|number }} opts
 */
function mintAgoraToken(opts = {}) {
  const cfg = getAgoraConfig();
  if (!cfg.configured) {
    return { configured: false, reason: 'AGORA_NOT_CONFIGURED' };
  }
  const channel = String(opts.channel || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64);
  if (!channel) {
    return { configured: true, error: 'channel_required' };
  }

  let RtcTokenBuilder;
  let RtcRole;
  try {
    ({ RtcTokenBuilder, RtcRole } = require('agora-access-token'));
  } catch (e) {
    return { configured: false, reason: 'AGORA_SDK_MISSING' };
  }

  const numericUid = uidToNumber(opts.uid);
  const expire = Math.floor(Date.now() / 1000) + 60 * 60 * 6;
  const token = RtcTokenBuilder.buildTokenWithUid(
    cfg.appId,
    cfg.appCertificate,
    channel,
    numericUid,
    RtcRole.PUBLISHER,
    expire
  );
  return {
    configured: true,
    appId: cfg.appId,
    channel,
    uid: numericUid,
    token,
    expiresAt: expire,
  };
}

module.exports = {
  getAgoraConfig,
  mintAgoraToken,
};
