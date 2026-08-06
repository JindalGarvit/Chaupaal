/**
 * Unit tests for cat-content grounding / URL hygiene (no Anthropic network).
 * Run: node scripts/test-cat-content.js
 */
'use strict';
const assert = require('assert');
const {
  extractAnthropicText,
  parseJsonArrayLoose,
  isArticleUrl,
  normalizeCatLink,
  sanitizeCatNewsItems,
  sanitizeCatMCQItems,
  catNewsLooksGrounded,
  catMCQLooksGrounded,
  CACHE_VERSION,
} = require('../server-lib/cat-content');

function test(name, fn) {
  fn();
  console.log('✓', name);
}

test('CACHE_VERSION is set for cache busting', () => {
  assert.ok(typeof CACHE_VERSION === 'string' && CACHE_VERSION.length > 0);
});

test('extractAnthropicText joins text blocks only', () => {
  assert.strictEqual(extractAnthropicText(null), '');
  assert.strictEqual(
    extractAnthropicText({
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'tool_use', name: 'web_search' },
        { type: 'text', text: ' world' },
      ],
    }),
    'Hello\n world'
  );
});

test('parseJsonArrayLoose strips fences and recovers array slice', () => {
  assert.strictEqual(parseJsonArrayLoose(''), null);
  assert.strictEqual(parseJsonArrayLoose('not json'), null);
  assert.deepStrictEqual(parseJsonArrayLoose('```json\n[{"a":1}]\n```'), [{ a: 1 }]);
  assert.deepStrictEqual(parseJsonArrayLoose('prefix [{"a":1},{"b":2}] trailing'), [
    { a: 1 },
    { b: 2 },
  ]);
  assert.strictEqual(parseJsonArrayLoose('{"not":"array"}'), null);
});

test('isArticleUrl rejects non-http and bare homepages', () => {
  assert.strictEqual(isArticleUrl('https://example.com/news/story'), true);
  assert.strictEqual(isArticleUrl('http://example.com/a'), true);
  assert.strictEqual(isArticleUrl('https://example.com/'), false);
  assert.strictEqual(isArticleUrl('https://example.com'), false);
  assert.strictEqual(isArticleUrl('ftp://example.com/x'), false);
  assert.strictEqual(isArticleUrl('not a url'), false);
});

test('normalizeCatLink keeps article URLs and Google News search, drops junk', () => {
  assert.strictEqual(
    normalizeCatLink('https://www.thehindu.com/news/national/foo/'),
    'https://www.thehindu.com/news/national/foo/'
  );
  assert.ok(
    String(normalizeCatLink('https://news.google.com/search?q=india')).includes('news.google.com')
  );
  assert.strictEqual(normalizeCatLink('https://example.com/'), null);
  assert.strictEqual(normalizeCatLink('javascript:alert(1)'), null);
  assert.strictEqual(normalizeCatLink(null), null);
});

test('sanitizeCatNewsItems nulls homepage links and fills defaults', () => {
  const out = sanitizeCatNewsItems([
    { headline: 'H', body: 'B', source: 'S', link: 'https://reuters.com/' },
    { link: 'https://reuters.com/world/asia/article-1' },
  ]);
  assert.strictEqual(out[0].link, null);
  assert.strictEqual(out[0].date, 'Today');
  assert.strictEqual(out[1].link, 'https://reuters.com/world/asia/article-1');
  assert.strictEqual(out[1].headline, '');
});

test('sanitizeCatMCQItems coerces options/correct', () => {
  const out = sanitizeCatMCQItems([
    { q: 'Q?', options: 'bad', correct: 'x', link: 'https://bbc.com/news/1' },
  ]);
  assert.deepStrictEqual(out[0].options, []);
  assert.strictEqual(out[0].correct, 0);
  assert.strictEqual(out[0].link, 'https://bbc.com/news/1');
});

test('catNewsLooksGrounded requires body depth and article links', () => {
  const body = 'x'.repeat(50);
  assert.strictEqual(catNewsLooksGrounded(null), false);
  assert.strictEqual(
    catNewsLooksGrounded([
      { headline: 'A', body, link: 'https://a.com/story' },
      { headline: 'B', body, link: 'https://b.com/story' },
    ]),
    true
  );
  assert.strictEqual(
    catNewsLooksGrounded([
      { headline: 'A', body, link: 'https://a.com/' },
      { headline: 'B', body, link: 'https://b.com/' },
    ]),
    false
  );
  assert.strictEqual(
    catNewsLooksGrounded([
      { headline: 'A', body: 'short', link: 'https://a.com/story' },
      { headline: 'B', body: 'short', link: 'https://b.com/story' },
    ]),
    false
  );
});

test('catMCQLooksGrounded requires three real questions', () => {
  const q = (n) => ({
    q: `Question ${n}?`,
    options: ['a', 'b'],
    synopsis: 'context',
    link: `https://news.example.com/q${n}`,
  });
  assert.strictEqual(catMCQLooksGrounded([q(1), q(2)]), false);
  assert.strictEqual(catMCQLooksGrounded([q(1), q(2), q(3)]), true);
  assert.strictEqual(
    catMCQLooksGrounded([
      q(1),
      q(2),
      { q: 'Q3?', options: ['a'], synopsis: 'x', link: 'https://example.com/' },
    ]),
    false
  );
});

console.log('\nAll cat-content tests passed.');
