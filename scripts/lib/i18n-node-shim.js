/**
 * Preload for Node tests that require/vm-run browser files which call t() / tHtml() / tn() /
 * optionLabel(): exposes the real i18n runtime (English) as globals.
 *   node -r ./scripts/lib/i18n-node-shim.js scripts/test-….js
 * VM contexts can pick the same functions up via require('./lib/i18n-node-shim').globals.
 */
'use strict';

const { loadI18n } = require('./i18n-runtime');

const rt = loadI18n({ region: false, format: false });
const globals = {
  t: (...a) => rt.t(...a),
  tHtml: (...a) => rt.tHtml(...a),
  tn: (...a) => rt.tn(...a),
  optionLabel: (...a) => rt.optionLabel(...a),
  optionLabelHtml: (...a) => rt.optionLabelHtml(...a),
  optionCode: (...a) => rt.optionCode(...a),
  tEn: (...a) => rt.tEn(...a),
  bidi: (...a) => rt.bidi(...a),
  bidiList: (...a) => rt.bidiList(...a),
};
Object.entries(globals).forEach(([k, v]) => {
  if (typeof globalThis[k] !== 'function') globalThis[k] = v;
});

// Tests that run browser files in their own vm contexts get the same i18n globals (unless they set
// their own) — game UIs call t() / tHtml() at load and render time.
const vm = require('vm');
function withI18n(ctx) {
  if (ctx && typeof ctx === 'object' && !vm.isContext(ctx)) {
    Object.entries(globals).forEach(([k, v]) => {
      if (!(k in ctx)) ctx[k] = v;
    });
  }
  return ctx;
}
const origCreate = vm.createContext;
vm.createContext = (ctx, opts) => origCreate.call(vm, withI18n(ctx === undefined ? {} : ctx), opts);
const origRunNew = vm.runInNewContext;
vm.runInNewContext = (code, ctx, opts) => origRunNew.call(vm, code, withI18n(ctx === undefined ? {} : ctx), opts);
const origScriptRunNew = vm.Script.prototype.runInNewContext;
vm.Script.prototype.runInNewContext = function (ctx, opts) {
  return origScriptRunNew.call(this, withI18n(ctx === undefined ? {} : ctx), opts);
};

// Aggregate suites spawn child tests with plain `node file.js` — they inherit the shim via NODE_OPTIONS.
if (!/i18n-node-shim/.test(process.env.NODE_OPTIONS || '')) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --require "${__filename.replace(/\\/g, '/')}"`.trim();
}

module.exports = { globals, runtime: rt };
