/**
 * Unit tests for server-lib/agora-token — config gate + channel sanitize.
 * Uses throwaway App ID/certificate env so minting stays offline-deterministic.
 */
'use strict';
const assert = require('assert');
const { getAgoraConfig, mintAgoraToken, uidToNumber } = require('../server-lib/agora-token');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function withAgoraEnv(enabled, fn) {
  const prevId = process.env.AGORA_APP_ID;
  const prevCert = process.env.AGORA_APP_CERTIFICATE;
  try {
    if (enabled) {
      // 32-char hex-ish placeholders — SDK only needs non-empty strings for buildTokenWithUid.
      process.env.AGORA_APP_ID = 'a'.repeat(32);
      process.env.AGORA_APP_CERTIFICATE = 'b'.repeat(32);
    } else {
      delete process.env.AGORA_APP_ID;
      delete process.env.AGORA_APP_CERTIFICATE;
    }
    fn();
  } finally {
    if (prevId === undefined) delete process.env.AGORA_APP_ID;
    else process.env.AGORA_APP_ID = prevId;
    if (prevCert === undefined) delete process.env.AGORA_APP_CERTIFICATE;
    else process.env.AGORA_APP_CERTIFICATE = prevCert;
  }
}

function main() {
  test('getAgoraConfig requires both App ID and certificate', () => {
    withAgoraEnv(false, () => {
      assert.strictEqual(getAgoraConfig().configured, false);
    });
    withAgoraEnv(true, () => {
      assert.strictEqual(getAgoraConfig().configured, true);
    });
  });

  test('mintAgoraToken returns configured:false when secrets missing', () => {
    withAgoraEnv(false, () => {
      const out = mintAgoraToken({ channel: 'room1', uid: 'user1' });
      assert.deepStrictEqual(out, { configured: false, reason: 'AGORA_NOT_CONFIGURED' });
    });
  });

  test('mintAgoraToken requires a sanitized channel when configured', () => {
    withAgoraEnv(true, () => {
      const missing = mintAgoraToken({ channel: '!!!', uid: 'u1' });
      assert.strictEqual(missing.configured, true);
      assert.strictEqual(missing.error, 'channel_required');

      const ok = mintAgoraToken({ channel: 'mehfil room/1!', uid: 'u1' });
      assert.strictEqual(ok.configured, true);
      assert.strictEqual(ok.channel, 'mehfilroom1');
      assert.ok(typeof ok.token === 'string' && ok.token.length > 10);
      assert.ok(Number.isFinite(ok.uid) && ok.uid > 0);
      assert.ok(ok.expiresAt > Math.floor(Date.now() / 1000));
    });
  });

  test('uidToNumber is stable and never zero', () => {
    assert.strictEqual(uidToNumber(42), 42);
    assert.strictEqual(uidToNumber('99'), 99);
    const a = uidToNumber('profile_abc');
    const b = uidToNumber('profile_abc');
    assert.strictEqual(a, b);
    assert.ok(a > 0);
    assert.notStrictEqual(uidToNumber('profile_abc'), uidToNumber('profile_xyz'));
  });

  console.log('\nAll agora-token tests passed.');
}

main();
