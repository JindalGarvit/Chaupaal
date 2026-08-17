/**
 * Sanitize Duniya story overlays + interactive widgets.
 * Structured JSON is the source of truth (never a flattened JPEG).
 */

function cleanText(value, max) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function cleanUid(value) {
  const uid = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,180}$/.test(uid) ? uid : '';
}

function cleanMedia(value) {
  const media = String(value || '').trim();
  return /^https:\/\//i.test(media) ? media.slice(0, 2048) : '';
}

function clamp01(n, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback == null ? 0.5 : fallback;
  return Math.max(0, Math.min(1, x));
}

function clampNum(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

const OVERLAY_TYPES = new Set([
  'text',
  'draw',
  'emoji',
  'gif',
  'music',
  'location',
  'mention',
  'link',
  'poll',
  'question',
  'quiz',
  'slider',
  'countdown',
  'addyours',
  'credit',
  'filter',
]);

const FILTERS = new Set(['normal', 'bright', 'contrast', 'warm', 'cool', 'mono', 'fade']);

function cleanHttpsUrl(value) {
  const raw = String(value || '').trim();
  if (!/^https:\/\//i.test(raw)) return '';
  if (/javascript:|data:/i.test(raw)) return '';
  return raw.slice(0, 2048);
}

function cleanOptions(list, max, optMax) {
  const arr = Array.isArray(list) ? list : [];
  return arr
    .map((x) => cleanText(typeof x === 'object' ? x.text || x.label : x, optMax || 40))
    .filter(Boolean)
    .slice(0, max);
}

function cleanDrawStrokes(strokes) {
  const list = Array.isArray(strokes) ? strokes : [];
  return list.slice(0, 80).map((s) => ({
    color: /^#[0-9a-fA-F]{3,8}$/.test(String(s?.color || '')) ? String(s.color) : '#E63946',
    width: clampNum(s?.width, 1, 24, 4),
    eraser: !!s?.eraser,
    points: (Array.isArray(s?.points) ? s.points : [])
      .slice(0, 400)
      .map((p) => ({
        x: clamp01(p?.x, 0),
        y: clamp01(p?.y, 0),
      }))
      .filter((p) => Number.isFinite(p.x)),
  })).filter((s) => s.points.length > 1);
}

function cleanOverlay(item, index) {
  if (!item || typeof item !== 'object') return null;
  const type = String(item.type || '').toLowerCase();
  if (!OVERLAY_TYPES.has(type)) return null;
  const base = {
    id: cleanText(item.id, 48) || `ov_${index}`,
    type,
    x: clamp01(item.x),
    y: clamp01(item.y),
    scale: clampNum(item.scale, 0.2, 4, 1),
    rotate: clampNum(item.rotate, -180, 180, 0),
    z: clampNum(item.z, 0, 50, index),
  };
  if (type === 'text') {
    const text = cleanText(item.text, 140);
    if (!text) return null;
    return {
      ...base,
      text,
      color: cleanText(item.color, 20) || '#FFFFFF',
      bg: cleanText(item.bg, 20) || '',
      style: ['display', 'serif', 'poster'].includes(String(item.style || ''))
        ? String(item.style)
        : 'display',
      align: ['left', 'center', 'right'].includes(String(item.align || ''))
        ? String(item.align)
        : 'center',
    };
  }
  if (type === 'draw') {
    const strokes = cleanDrawStrokes(item.strokes);
    if (!strokes.length) return null;
    return { ...base, strokes };
  }
  if (type === 'emoji') {
    const emoji = cleanText(item.emoji || item.text, 16);
    if (!emoji) return null;
    return { ...base, emoji };
  }
  if (type === 'gif') {
    const url = cleanMedia(item.url || item.src);
    if (!url) return null;
    return { ...base, url, preview: cleanMedia(item.preview) || url };
  }
  if (type === 'mention') {
    const uid = cleanUid(item.uid);
    const name = cleanText(item.name || item.username, 80);
    if (!uid || !name) return null;
    return { ...base, uid, name, username: cleanText(item.username, 40) };
  }
  if (type === 'link') {
    const url = cleanHttpsUrl(item.url);
    if (!url) return null;
    return { ...base, url, label: cleanText(item.label, 80) || url.replace(/^https:\/\//i, '').slice(0, 40) };
  }
  if (type === 'credit') {
    const uid = cleanUid(item.uid);
    return {
      ...base,
      uid,
      name: cleanText(item.name, 80) || 'Chaupaal member',
      locked: true,
    };
  }
  if (type === 'filter') {
    const filter = FILTERS.has(String(item.filter || '')) ? String(item.filter) : 'normal';
    return { ...base, filter };
  }
  if (type === 'poll') {
    const options = cleanOptions(item.options, 4, 36);
    if (options.length < 2) return null;
    return { ...base, prompt: cleanText(item.prompt, 80) || 'Vote', options };
  }
  if (type === 'question') {
    return { ...base, prompt: cleanText(item.prompt, 100) || 'Ask me' };
  }
  if (type === 'quiz') {
    const options = cleanOptions(item.options, 4, 36);
    if (options.length < 2) return null;
    const correct = clampNum(item.correctIndex, 0, options.length - 1, 0);
    return { ...base, prompt: cleanText(item.prompt, 80) || 'Quiz', options, correctIndex: correct };
  }
  if (type === 'slider') {
    return {
      ...base,
      prompt: cleanText(item.prompt, 80) || 'Slide',
      emoji: cleanText(item.emoji, 8) || '🔥',
    };
  }
  if (type === 'countdown') {
    const targetAt = Number(item.targetAt);
    if (!Number.isFinite(targetAt) || targetAt < Date.now() - 86400000) return null;
    return { ...base, title: cleanText(item.title, 80) || 'Countdown', targetAt };
  }
  if (type === 'addyours') {
    return {
      ...base,
      prompt: cleanText(item.prompt, 80) || 'Add yours',
      thumb: cleanMedia(item.thumb),
    };
  }
  if (type === 'music' || type === 'location') {
    return base;
  }
  return base;
}

function cleanOverlays(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr.map(cleanOverlay).filter(Boolean).slice(0, 30);
}

function firstOfType(overlays, type) {
  return (overlays || []).find((o) => o.type === type) || null;
}

function cleanInteractive(raw, overlays) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  const pollOv = src.poll || firstOfType(overlays, 'poll');
  if (pollOv && Array.isArray(pollOv.options) && pollOv.options.length >= 2) {
    out.poll = {
      prompt: cleanText(pollOv.prompt, 80) || 'Vote',
      options: cleanOptions(pollOv.options, 4, 36),
    };
  }
  const qOv = src.question || firstOfType(overlays, 'question');
  if (qOv && (qOv.prompt || src.question)) {
    out.question = { prompt: cleanText(qOv.prompt, 100) || 'Ask me' };
  }
  const quizOv = src.quiz || firstOfType(overlays, 'quiz');
  if (quizOv && Array.isArray(quizOv.options) && quizOv.options.length >= 2) {
    const options = cleanOptions(quizOv.options, 4, 36);
    out.quiz = {
      prompt: cleanText(quizOv.prompt, 80) || 'Quiz',
      options,
      correctIndex: clampNum(quizOv.correctIndex, 0, options.length - 1, 0),
    };
  }
  const slOv = src.slider || firstOfType(overlays, 'slider');
  if (slOv) {
    out.slider = {
      prompt: cleanText(slOv.prompt, 80) || 'Slide',
      emoji: cleanText(slOv.emoji, 8) || '🔥',
    };
  }
  const cdOv = src.countdown || firstOfType(overlays, 'countdown');
  if (cdOv && Number(cdOv.targetAt)) {
    out.countdown = {
      title: cleanText(cdOv.title, 80) || 'Countdown',
      targetAt: Number(cdOv.targetAt),
    };
  }
  const ayOv = src.addYours || src.addyours || firstOfType(overlays, 'addyours');
  if (ayOv) {
    out.addYours = {
      prompt: cleanText(ayOv.prompt, 80) || 'Add yours',
      thumb: cleanMedia(ayOv.thumb),
    };
  }
  return Object.keys(out).length ? out : null;
}

function cleanMentions(list) {
  const arr = Array.isArray(list) ? list : [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const uid = cleanUid(item?.uid);
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push({
      uid,
      name: cleanText(item.name, 80),
      username: cleanText(item.username, 40),
      x: clamp01(item.x),
      y: clamp01(item.y),
    });
    if (out.length >= 12) break;
  }
  return out;
}

function cleanRestoryOf(value) {
  if (!value || typeof value !== 'object') return null;
  const storyId = cleanText(value.storyId, 180);
  const uid = cleanUid(value.uid);
  if (!storyId || !uid) return null;
  return {
    storyId,
    uid,
    name: cleanText(value.name, 80) || 'Chaupaal member',
  };
}

function publicInteractive(interactive, { voted, own, tallies } = {}) {
  if (!interactive || typeof interactive !== 'object') return null;
  const out = {};
  if (interactive.poll) {
    out.poll = {
      prompt: interactive.poll.prompt,
      options: interactive.poll.options,
      counts: own || voted?.poll != null ? tallies?.poll || null : null,
      myVote: voted?.poll != null ? voted.poll : null,
    };
  }
  if (interactive.question) {
    out.question = { prompt: interactive.question.prompt, answered: !!voted?.question };
  }
  if (interactive.quiz) {
    out.quiz = {
      prompt: interactive.quiz.prompt,
      options: interactive.quiz.options,
      correctIndex: own || voted?.quiz != null ? interactive.quiz.correctIndex : null,
      counts: own || voted?.quiz != null ? tallies?.quiz || null : null,
      myVote: voted?.quiz != null ? voted.quiz : null,
    };
  }
  if (interactive.slider) {
    out.slider = {
      prompt: interactive.slider.prompt,
      emoji: interactive.slider.emoji,
      average: own || voted?.slider != null ? tallies?.sliderAvg ?? null : null,
      myValue: voted?.slider != null ? voted.slider : null,
    };
  }
  if (interactive.countdown) out.countdown = interactive.countdown;
  if (interactive.addYours) out.addYours = interactive.addYours;
  return Object.keys(out).length ? out : null;
}

function tallyResponses(docs, interactive) {
  const poll = interactive?.poll ? new Array(interactive.poll.options.length).fill(0) : null;
  const quiz = interactive?.quiz ? new Array(interactive.quiz.options.length).fill(0) : null;
  let sliderSum = 0;
  let sliderN = 0;
  docs.forEach((doc) => {
    const d = doc.data ? doc.data() : doc;
    if (poll && Number.isInteger(d.poll) && d.poll >= 0 && d.poll < poll.length) poll[d.poll] += 1;
    if (quiz && Number.isInteger(d.quiz) && d.quiz >= 0 && d.quiz < quiz.length) quiz[d.quiz] += 1;
    if (Number.isFinite(Number(d.slider))) {
      sliderSum += Number(d.slider);
      sliderN += 1;
    }
  });
  return {
    poll,
    quiz,
    sliderAvg: sliderN ? Math.round(sliderSum / sliderN) : null,
    responseCount: docs.length,
  };
}

module.exports = {
  OVERLAY_TYPES,
  FILTERS,
  cleanOverlays,
  cleanInteractive,
  cleanMentions,
  cleanRestoryOf,
  publicInteractive,
  tallyResponses,
  cleanHttpsUrl,
  clamp01,
  clampNum,
};
