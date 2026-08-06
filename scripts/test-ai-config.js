/**
 * Unit tests for AI feature gate + model tier resolution.
 * Mutates process.env temporarily; always restores.
 */
'use strict';
const assert = require('assert');
const path = require('path');

const MODULE = path.join(__dirname, '../server-lib/ai-config.js');

function withEnv(overrides, fn) {
  const keys = Object.keys(overrides);
  const prev = {};
  for (const k of keys) {
    prev[k] = process.env[k];
    if (overrides[k] === undefined) delete process.env[k];
    else process.env[k] = overrides[k];
  }
  try {
    delete require.cache[require.resolve(MODULE)];
    return fn(require(MODULE));
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
    delete require.cache[require.resolve(MODULE)];
  }
}

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('AI features stay off unless AI_FEATURES_ENABLED is exactly true', () => {
  withEnv({ AI_FEATURES_ENABLED: undefined }, (cfg) => {
    assert.strictEqual(cfg.isAiFeaturesEnabled(), false);
  });
  withEnv({ AI_FEATURES_ENABLED: 'True' }, (cfg) => {
    assert.strictEqual(cfg.isAiFeaturesEnabled(), false);
  });
  withEnv({ AI_FEATURES_ENABLED: '1' }, (cfg) => {
    assert.strictEqual(cfg.isAiFeaturesEnabled(), false);
  });
  withEnv({ AI_FEATURES_ENABLED: 'true' }, (cfg) => {
    assert.strictEqual(cfg.isAiFeaturesEnabled(), true);
  });
});

test('resolveModel prefers explicit model, then tier, then fast default', () => {
  withEnv(
    {
      AI_FEATURES_ENABLED: 'false',
      AI_MODEL_FAST: 'fast-model-x',
      AI_MODEL_BALANCED: 'balanced-model-y',
    },
    (cfg) => {
      assert.strictEqual(cfg.resolveModel({ model: 'custom-z' }), 'custom-z');
      assert.strictEqual(cfg.resolveModel({ tier: 'fast' }), 'fast-model-x');
      assert.strictEqual(cfg.resolveModel({ tier: 'balanced' }), 'balanced-model-y');
      assert.strictEqual(cfg.resolveModel({}), 'fast-model-x');
      assert.strictEqual(cfg.resolveModel({ tier: 'unknown' }), 'fast-model-x');
    }
  );
});

test('AI_PROVIDER defaults to anthropic', () => {
  withEnv({ AI_PROVIDER: undefined }, (cfg) => {
    assert.strictEqual(cfg.AI_PROVIDER, 'anthropic');
  });
  withEnv({ AI_PROVIDER: 'Gemini' }, (cfg) => {
    assert.strictEqual(cfg.AI_PROVIDER, 'gemini');
  });
});

console.log('\nAI config unit tests passed.');
