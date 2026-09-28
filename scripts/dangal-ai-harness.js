#!/usr/bin/env node
/**
 * Dev harness for the Dangal AI hooks.
 *   node scripts/dangal-ai-harness.js          → every hook with AI off (deterministic fallbacks)
 *   node scripts/dangal-ai-harness.js --live   → also calls the configured provider, only when
 *                                                AI_FEATURES_ENABLED=true and a provider key is set
 */
'use strict';

const { createDangalAI, HOOKS, SCHEMAS } = require('../server-lib/dangal-ai');

const INPUTS = {
  coachExplain: { gameId: 'chess', situation: 'Opening, both sides castled', move: 'Nf3' },
  commentary: { gameId: 'penalty', event: 'save', score: '2-1' },
  generateQuestions: { category: 'Science', count: 3 },
  generateWordPack: { game: 'charades', theme: 'Movies', count: 8 },
  botPersona: { gameId: 'poker', level: 'shark', seed: 'harness' },
};

async function pass(label, ai) {
  console.log('\n== ' + label + ' ==');
  for (const hook of HOOKS) {
    const out = await ai.run(hook, INPUTS[hook], { uid: 'harness' });
    const ok = SCHEMAS[hook](out.data);
    console.log(`${ok ? 'ok ' : 'BAD'} ${hook.padEnd(18)} [${out.source}${out.reason ? ': ' + out.reason : ''}] ${JSON.stringify(out.data).slice(0, 110)}`);
    if (!ok) process.exitCode = 1;
  }
  console.log('telemetry', JSON.stringify(ai.telemetry()));
}

(async () => {
  await pass('AI off', createDangalAI({ env: { AI_FEATURES_ENABLED: 'false' } }));
  if (process.argv.includes('--live')) {
    const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_API_KEY || process.env.GROK_API_KEY);
    if (process.env.AI_FEATURES_ENABLED !== 'true' || !hasKey) {
      console.log('\n--live skipped: set AI_FEATURES_ENABLED=true and a provider key to exercise the real provider.');
      return;
    }
    await pass('AI on (' + (process.env.AI_PROVIDER || 'anthropic') + ')', createDangalAI());
  }
})();
