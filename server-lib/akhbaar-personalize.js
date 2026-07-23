/**
 * Akhbaar / Aur Sunao personalization engine (Part 2 Phase 4).
 *
 * Privacy HARD RULE: only use fields the user explicitly put on Chaupaal
 * (profile, posts, location shares, job updates) — never external inference.
 *
 * Gated by AI_FEATURES_ENABLED for AI-generated digest copy; template cards
 * still require the kill-switch for proactive generation consistency with companion.
 */

const { isAiFeaturesEnabled } = require('./ai-config');
const { callAI } = require('./ai');
const { canSendProactive, recordEventSent, localDateKey } = require('./chaupaal-cadence');
const { fetchWeatherForUser } = require('./weather');
const { fetchLocalEvents } = require('./events-provider');

function profileBlob(data) {
  return { ...(data || {}), ...(data?.profile || {}) };
}

function readDob(profile) {
  return (
    profile?.dateOfBirth ||
    profile?.birthday ||
    profile?.dob ||
    profile?.profile?.dateOfBirth ||
    profile?.profile?.birthday ||
    profile?.profile?.dob ||
    null
  );
}

function isBirthdayToday(profile, tz) {
  const b = readDob(profile);
  if (!b) return false;
  const s = String(b).trim();
  const m = s.match(/(\d{4}-)?(\d{1,2})-(\d{1,2})/);
  if (!m) return false;
  const bm = Number(m[2]);
  const bd = Number(m[3]);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date());
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    return month === bm && day === bd;
  } catch {
    return false;
  }
}

function allowsAppearInFriendsPrompts(profile) {
  // Default true — opt-out only when explicitly false
  if (profile?.akhbaarAppearInFriendsPrompts === false) return false;
  if (profile?.profile?.akhbaarAppearInFriendsPrompts === false) return false;
  return true;
}

function interestsList(profile) {
  const raw = profile?.interests || profile?.hobbies || profile?.profile?.interests || profile?.profile?.hobbies || [];
  const free = [
    profile?.interestsFreeText,
    profile?.hobbiesFreeText,
    profile?.profile?.interestsFreeText,
    profile?.profile?.hobbiesFreeText,
  ]
    .filter(Boolean)
    .join(' ');
  let list = [];
  if (Array.isArray(raw)) list = raw.map((x) => String(x).trim()).filter(Boolean);
  else if (typeof raw === 'string') {
    list = raw
      .split(/[,;/|]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  if (free) {
    free.split(/[,;/|\s]+/).forEach((w) => {
      const t = w.trim();
      if (t.length > 2) list.push(t);
    });
  }
  return [...new Set(list)];
}

function keywordOverlap(a, b) {
  const norm = (list) =>
    list.map((s) => s.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, ' ').trim()).filter(Boolean);
  const A = norm(a);
  const B = new Set(norm(b));
  const hits = [];
  A.forEach((w) => {
    if (B.has(w)) hits.push(w);
    else {
      for (const x of B) {
        if (x.includes(w) || w.includes(x)) {
          hits.push(w);
          break;
        }
      }
    }
  });
  return [...new Set(hits)].slice(0, 5);
}

async function createPersonalEvent(db, uid, { type, title, text, cta, action, friendUid, friendName, meta }) {
  const doc = {
    type,
    displayMode: 'graphicCard',
    payload: {
      title,
      text,
      subtitle: 'Personalized for you',
      kicker: 'Akhbaar',
      cta: cta || 'Got it',
      action: action || 'dismiss',
      friendUid: friendUid || null,
      friendName: friendName || null,
      fromApp: true,
      label: 'Chaupaal personalization',
      ...(meta || {}),
    },
    createdAt: new Date(),
    dismissed: false,
    engaged: false,
    serverOwned: true,
  };
  return db.collection('users').doc(uid).collection('chaupaalEvents').add(doc);
}

async function loadCloseFriendProfiles(db, uid) {
  try {
    const snap = await db.collection('users').doc(uid).collection('close_friends').limit(40).get();
    const ids = snap.docs.map((d) => d.id);
    if (!ids.length) return [];
    const refs = ids.map((id) => db.collection('users').doc(id));
    const snaps = await db.getAll(...refs);
    return snaps
      .filter((s) => s.exists)
      .map((s) => ({ uid: s.id, ...profileBlob(s.data()) }));
  } catch {
    return [];
  }
}

async function daysSinceLastDm(db, uid, friendUid) {
  // Best-effort: look at relationship lastInteraction if present
  try {
    const rel = await db
      .collection('users')
      .doc(uid)
      .collection('relationships')
      .doc(friendUid)
      .get();
    if (rel.exists) {
      const t = rel.data()?.lastMessageAt || rel.data()?.updatedAt;
      if (t?.toDate) {
        return (Date.now() - t.toDate().getTime()) / (24 * 60 * 60 * 1000);
      }
      if (t) {
        const ms = new Date(t).getTime();
        if (Number.isFinite(ms)) return (Date.now() - ms) / (24 * 60 * 60 * 1000);
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function maybeDigestCard(db, uid, profile, state, stateRef) {
  const gate = canSendProactive(state, { type: 'akhbaar_digest' });
  if (!gate.ok) return { skipped: gate.reason };

  const city = profile.currentCity || profile.city || '';
  const industry = profile.industry || '';
  const occupation = profile.occupation || '';
  const hobbies = interestsList(profile);

  let text = '';
  if (isAiFeaturesEnabled()) {
    try {
      const result = await callAI({
        tier: 'fast',
        feature: 'akhbaar_digest',
        max_tokens: 180,
        system:
          'Write one short Akhbaar-style prompt card for an Indian social app. Use ONLY the provided profile fields. No guilt. JSON: {"title":"...","text":"..."}',
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              city,
              industry,
              occupation,
              hobbies: hobbies.slice(0, 8),
              kind: 'daily_digest',
            }),
          },
        ],
      });
      const raw = String(result.text || '');
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0) {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        text = String(parsed.text || '').slice(0, 400);
        var title = String(parsed.title || 'For you today').slice(0, 80);
      }
    } catch (e) {
      console.warn('[akhbaar-personalize] digest AI', e?.message || e);
    }
  }

  if (!text) {
    if (city) {
      title = `Around ${city}`;
      text = `What's one thing happening in ${city} that more people should know about?`;
    } else if (industry || occupation) {
      title = industry || 'Your world';
      text = `Anything interesting in ${occupation || industry} lately worth sharing?`;
    } else if (hobbies.length) {
      title = 'Shared spark';
      text = `You're into ${hobbies[0]} — what's a recent favourite?`;
    } else {
      return { skipped: 'no_profile_signal' };
    }
  }

  const created = await createPersonalEvent(db, uid, {
    type: 'akhbaar_digest',
    title: title || 'For you today',
    text,
    cta: 'Open Akhbaar',
    action: 'open_akhbaar',
  });
  const next = recordEventSent(state, { type: 'akhbaar_digest', now: new Date() });
  await stateRef.set(next, { merge: true });
  return { sent: created.id, kind: 'digest' };
}

async function maybeFriendBirthday(db, uid, state, stateRef, tz) {
  const friends = await loadCloseFriendProfiles(db, uid);
  for (const friend of friends) {
    if (!allowsAppearInFriendsPrompts(friend)) continue;
    if (!isBirthdayToday(friend, tz)) continue;
    const type = `akhbaar_bday_${friend.uid}`;
    const gate = canSendProactive(state, { type });
    if (!gate.ok) continue;
    const name = friend.name || friend.displayName || friend.username || 'your friend';
    const created = await createPersonalEvent(db, uid, {
      type: 'akhbaar_friend_birthday',
      title: `${name}'s birthday`,
      text: `Wish ${name} a happy birthday — opens a pre-filled Baithak message.`,
      cta: 'Wish them',
      action: 'wish_friend',
      friendUid: friend.uid,
      friendName: name,
      meta: { prefill: `Happy birthday, ${name}! 🎂` },
    });
    const next = recordEventSent(state, { type, now: new Date() });
    await stateRef.set(next, { merge: true });
    return { sent: created.id, kind: 'friend_birthday' };
  }
  return { skipped: 'no_birthday' };
}

async function maybeQuietCloseFriend(db, uid, state, stateRef) {
  const friends = await loadCloseFriendProfiles(db, uid);
  for (const friend of friends.slice(0, 12)) {
    if (!allowsAppearInFriendsPrompts(friend)) continue;
    const days = await daysSinceLastDm(db, uid, friend.uid);
    if (days == null || days < 14) continue;
    const type = `akhbaar_quiet_${friend.uid}`;
    const gate = canSendProactive(state, { type });
    if (!gate.ok) continue;
    const name = friend.name || friend.displayName || 'a close friend';
    const created = await createPersonalEvent(db, uid, {
      type: 'akhbaar_quiet_friend',
      title: 'Haven’t talked in a while',
      text: `You and ${name} have been quiet lately. A gentle hello is enough — no pressure.`,
      cta: 'Say hi',
      action: 'open_friend_dm',
      friendUid: friend.uid,
      friendName: name,
    });
    const next = recordEventSent(state, { type, now: new Date() });
    await stateRef.set(next, { merge: true });
    return { sent: created.id, kind: 'quiet_friend' };
  }
  return { skipped: 'no_quiet' };
}

async function maybeWeatherPrompt(db, uid, profile, state, stateRef) {
  const city = profile.currentCity || profile.city || '';
  if (!city) return { skipped: 'no_city' };
  const gate = canSendProactive(state, { type: 'akhbaar_weather' });
  if (!gate.ok) return { skipped: gate.reason };

  const wx = await fetchWeatherForUser({ city });
  if (!wx.ok) return { skipped: wx.reason || 'weather_failed' };
  if (!['rain', 'storm', 'clear'].includes(wx.bucket)) return { skipped: 'weather_neutral' };

  let text =
    wx.bucket === 'rain' || wx.bucket === 'storm'
      ? `${wx.summary} in ${wx.city || city} — anyone up for chai?`
      : `Clear skies in ${wx.city || city} — perfect for a short walk. Who’s in?`;

  const created = await createPersonalEvent(db, uid, {
    type: 'akhbaar_weather',
    title: `${wx.city || city} weather`,
    text,
    cta: 'Share in Duniya',
    action: 'open_duniya',
    meta: { weatherBucket: wx.bucket, tempC: wx.tempC },
  });
  const next = recordEventSent(state, { type: 'akhbaar_weather', now: new Date() });
  await stateRef.set(next, { merge: true });
  return { sent: created.id, kind: 'weather' };
}

async function maybeLocalEvent(db, uid, profile, state, stateRef, tz) {
  const city = profile.currentCity || profile.city || '';
  const gate = canSendProactive(state, { type: 'akhbaar_local_event' });
  if (!gate.ok) return { skipped: gate.reason };
  const events = await fetchLocalEvents({ city, tz });
  if (!events.length) return { skipped: 'no_events' };
  const ev = events[0];
  const created = await createPersonalEvent(db, uid, {
    type: 'akhbaar_local_event',
    title: ev.title,
    text: ev.text,
    cta: 'Open Akhbaar',
    action: 'open_akhbaar',
    meta: { eventId: ev.id, source: ev.source },
  });
  const next = recordEventSent(state, { type: 'akhbaar_local_event', now: new Date() });
  await stateRef.set(next, { merge: true });
  return { sent: created.id, kind: 'local_event' };
}

async function maybeSharedInterests(db, uid, profile, state, stateRef) {
  const mine = interestsList(profile);
  if (mine.length < 1) return { skipped: 'no_interests' };
  const gate = canSendProactive(state, { type: 'akhbaar_shared_interest' });
  if (!gate.ok) return { skipped: gate.reason };

  const friends = await loadCloseFriendProfiles(db, uid);
  const topicCounts = {};
  const byTopic = {};
  friends.forEach((f) => {
    if (!allowsAppearInFriendsPrompts(f)) return;
    const hits = keywordOverlap(mine, interestsList(f));
    hits.forEach((t) => {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
      byTopic[t] = byTopic[t] || [];
      byTopic[t].push(f.name || f.displayName || 'friend');
    });
  });
  const ranked = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] < 2) return { skipped: 'no_overlap' };
  const [topic, count] = ranked[0];
  const names = (byTopic[topic] || []).slice(0, 3).join(', ');
  const created = await createPersonalEvent(db, uid, {
    type: 'akhbaar_shared_interest',
    title: `${count} friends into ${topic}`,
    text: `${names} share an interest in ${topic}. Start a Baithak group or drop a Peepal note — better as a circle than a 1:1.`,
    cta: 'Open Baithak',
    action: 'open_baithak',
    meta: { topic, count },
  });
  const next = recordEventSent(state, { type: 'akhbaar_shared_interest', now: new Date() });
  await stateRef.set(next, { merge: true });
  return { sent: created.id, kind: 'shared_interest' };
}

async function maybeJobOrCityChange(db, uid, state, stateRef) {
  // Friends who updated occupation/city recently and allow appearing in prompts
  const friends = await loadCloseFriendProfiles(db, uid);
  const now = Date.now();
  for (const friend of friends) {
    if (!allowsAppearInFriendsPrompts(friend)) continue;
    const updated =
      friend.profileUpdatedAt?.toDate?.()?.getTime?.() ||
      friend.updatedAt?.toDate?.()?.getTime?.() ||
      (friend.profileUpdatedAt ? new Date(friend.profileUpdatedAt).getTime() : 0) ||
      0;
    if (!updated || now - updated > 5 * 24 * 60 * 60 * 1000) continue;
    const city = friend.currentCity || friend.city || '';
    const job = friend.occupation || friend.company || '';
    if (!city && !job) continue;
    const type = `akhbaar_update_${friend.uid}`;
    const gate = canSendProactive(state, { type });
    if (!gate.ok) continue;
    const name = friend.name || friend.displayName || 'A friend';
    const detail = [job && `new role vibes (${job})`, city && `now in ${city}`].filter(Boolean).join(' · ');
    const created = await createPersonalEvent(db, uid, {
      type: 'akhbaar_friend_update',
      title: `${name} updated their profile`,
      text: detail || 'They shared something new on Chaupaal — say hello?',
      cta: 'Message them',
      action: 'open_friend_dm',
      friendUid: friend.uid,
      friendName: name,
    });
    const next = recordEventSent(state, { type, now: new Date() });
    await stateRef.set(next, { merge: true });
    return { sent: created.id, kind: 'friend_update' };
  }
  return { skipped: 'no_updates' };
}

/**
 * Process one user — at most one personalization card per scheduler pass
 * (respects canSendProactive daily caps).
 */
async function processAkhbaarPersonalization(db, uid, state, stateRef) {
  if (!isAiFeaturesEnabled()) {
    // Still allow non-AI template cards when kill-switch is off? Spec says gate everything.
    return { skipped: 'ai_off' };
  }

  let profile = {};
  try {
    const snap = await db.collection('users').doc(uid).get();
    profile = profileBlob(snap.data() || {});
  } catch {
    profile = {};
  }

  if (profile.akhbaarPersonalizeOptOut === true) {
    return { skipped: 'user_opt_out' };
  }

  const tz = state.timezone || 'Asia/Kolkata';

  // Priority: friend birthday → friend update → quiet CF → weather → local event → shared interest → digest
  const steps = [
    () => maybeFriendBirthday(db, uid, state, stateRef, tz),
    () => maybeJobOrCityChange(db, uid, state, stateRef),
    () => maybeQuietCloseFriend(db, uid, state, stateRef),
    () => maybeWeatherPrompt(db, uid, profile, state, stateRef),
    () => maybeLocalEvent(db, uid, profile, state, stateRef, tz),
    () => maybeSharedInterests(db, uid, profile, state, stateRef),
    () => maybeDigestCard(db, uid, profile, state, stateRef),
  ];

  for (const step of steps) {
    // Refresh state between attempts so typeDateKeys / daily cap stay accurate
    const fresh = (await stateRef.get()).data() || state;
    Object.assign(state, fresh);
    try {
      const r = await step();
      if (r?.sent) return r;
    } catch (e) {
      console.warn('[akhbaar-personalize]', uid, e?.message || e);
    }
  }
  return { skipped: 'nothing_to_send' };
}

module.exports = {
  processAkhbaarPersonalization,
  allowsAppearInFriendsPrompts,
  isBirthdayToday,
  interestsList,
  readDob,
};
