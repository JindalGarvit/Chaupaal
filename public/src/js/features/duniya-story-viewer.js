/**
 * Duniya story viewer — tray, hold-to-pause, overlays, owner tools, replies.
 */
(function () {
  'use strict';
  const NS = (window.DuniyaStory = window.DuniyaStory || {});
  const IMAGE_MS = 6000;

  NS.openViewerImpl = function openViewerImpl(story, list, opts) {
    const tray = (opts?.tray && opts.tray.length ? opts.tray : NS.bundleTray(list || [story])).filter((g) => g?.length);
    if (!tray.length) return;
    let bundleIdx = Math.max(
      0,
      tray.findIndex((g) => g.some((s) => s.id === story?.id) || g[0]?.uid === story?.uid)
    );
    let itemIdx = Math.max(
      0,
      tray[bundleIdx].findIndex((s) => s.id === story?.id)
    );
    if (itemIdx < 0) itemIdx = NS.firstUnwatchedIndex(tray[bundleIdx]);

    let paused = false;
    let holding = false;
    let progressTimer = null;
    let elapsed = 0;
    let duration = IMAGE_MS;
    let liked = false;
    let sheetOpen = false;
    let muted = true;
    let videoEl = null;
    let musicAudio = null;

    const root = document.createElement('div');
    root.className = 'ds-overlay';
    root.dataset.navManaged = '1';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Story');
    const device = document.querySelector('.device') || document.body;
    device.appendChild(root);

    const teardown = () => {
      clearInterval(progressTimer);
      try {
        if (typeof pauseAllMusic === 'function') pauseAllMusic();
      } catch (e) {}
      try {
        musicAudio?.pause();
      } catch (e) {}
      root.remove();
      try {
        if (typeof restoreAppShell === 'function') restoreAppShell('duniya_story_viewer');
      } catch (e) {}
    };
    let layer = { close: teardown };
    if (typeof openLayer === 'function') layer = openLayer(root, teardown, { host: device, remove: true, label: 'Story' });

    function current() {
      return tray[bundleIdx][itemIdx];
    }

    function setPaused(v) {
      paused = v;
      if (videoEl) {
        try {
          if (paused) videoEl.pause();
          else videoEl.play().catch(() => {});
        } catch (e) {}
      }
      if (musicAudio) {
        try {
          if (paused) musicAudio.pause();
          else if (!muted) musicAudio.play().catch(() => {});
        } catch (e) {}
      }
    }

    function startProgress() {
      clearInterval(progressTimer);
      elapsed = 0;
      const s = current();
      duration =
        s.mediaType === 'video'
          ? Math.min(90000, Number(s.durationMs) || Number(s.trimEndMs - s.trimStartMs) || 15000)
          : IMAGE_MS;
      const bar = root.querySelector(`[data-bar="${itemIdx}"] b`);
      progressTimer = setInterval(() => {
        if (paused || holding || sheetOpen || document.hidden) return;
        elapsed += 80;
        if (bar) bar.style.width = Math.min(100, (elapsed / duration) * 100) + '%';
        if (elapsed >= duration) next(true);
      }, 80);
    }

    function next(fromTimer) {
      const bundle = tray[bundleIdx];
      if (itemIdx < bundle.length - 1) {
        itemIdx += 1;
        paint();
        return;
      }
      if (bundleIdx < tray.length - 1) {
        bundleIdx += 1;
        itemIdx = NS.firstUnwatchedIndex(tray[bundleIdx]);
        paint();
        return;
      }
      if (fromTimer) layer.close();
    }

    function prev() {
      if (itemIdx > 0) {
        itemIdx -= 1;
        paint();
        return;
      }
      if (bundleIdx > 0) {
        bundleIdx -= 1;
        itemIdx = tray[bundleIdx].length - 1;
        paint();
      }
    }

    function closeSheets() {
      root.querySelectorAll('.ds-sheet').forEach((n) => n.remove());
      sheetOpen = false;
      setPaused(false);
    }

    function openSheet(html, onMount) {
      closeSheets();
      sheetOpen = true;
      setPaused(true);
      const sheet = document.createElement('div');
      sheet.className = 'ds-sheet';
      sheet.innerHTML = html;
      root.appendChild(sheet);
      const close = () => {
        sheet.remove();
        sheetOpen = false;
        setPaused(false);
      };
      onMount?.(sheet, close);
      return close;
    }

    async function paint() {
      clearInterval(progressTimer);
      const s = current();
      const own = !!(s.own || (typeof currentUser !== 'undefined' && s.uid === currentUser?.uid));
      NS.markStorySeen(s);
      const name = s.name || 'Chaupaal member';
      const av = s.avatar && /^https:/.test(s.avatar) ? `<img src="${NS.esc(s.avatar)}" alt="">` : `<div class="ds-av">${NS.esc((s.avatar || '👤').slice(0, 2))}</div>`;
      const media =
        s.mediaType === 'video' && s.media
          ? `<video src="${NS.esc(s.media)}" playsinline ${muted ? 'muted' : ''} autoplay></video>`
          : s.media
            ? `<img src="${NS.esc(s.media)}" alt="">`
            : '';
      root.innerHTML = `
        <div class="ds-progress">${tray[bundleIdx]
          .map(
            (_, i) =>
              `<i data-bar="${i}"><b style="width:${i < itemIdx ? '100' : '0'}%"></b></i>`
          )
          .join('')}</div>
        <div class="ds-stage${NS.filterClass(s.filter)}" data-stage>${media}</div>
        <div class="ds-header">
          <button type="button" class="ds-icon-btn" data-profile style="padding:0;overflow:hidden;">${av}</button>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;">${typeof formatDisplayNameHtml === 'function' ? formatDisplayNameHtml(name, s) : NS.esc(name)}</div>
            <div style="font-size:11px;opacity:.7;">${typeof timeAgoStr === 'function' ? timeAgoStr(s.createdAt) : ''}</div>
          </div>
          ${own ? `<button type="button" class="ds-icon-btn" data-viewers aria-label="Viewers">👁</button>` : ''}
          <button type="button" class="ds-icon-btn" data-more aria-label="More">⋯</button>
          <button type="button" class="ds-icon-btn" data-mute aria-label="Mute">${muted ? '🔇' : '🔊'}</button>
          <button type="button" class="ds-icon-btn" data-close aria-label="Close">✕</button>
        </div>
        <div class="ds-hit">
          <div class="ds-hit-l" data-prev></div>
          <div class="ds-hit-r" data-next></div>
        </div>
        <div class="ds-bottombar">
          ${
            own
              ? `<button type="button" class="ds-cta" data-viewers>${NS.tt('story_viewers', 'Viewers')}${s.viewCount != null ? ` · ${Number(s.viewCount) || 0}` : ''}</button>
                 <button type="button" class="ds-icon-btn" data-comments aria-label="Comments">💬</button>
                 <button type="button" class="ds-icon-btn" data-send aria-label="Send">✈</button>`
              : `<button type="button" class="ds-icon-btn" data-like aria-label="Like">♡</button>
                 <button type="button" class="ds-icon-btn" data-comments aria-label="Comments">💬</button>
                 <form class="ds-compose" data-reply><input type="text" maxlength="280" placeholder="${NS.esc(NS.tt('story_reply', 'Message ') + (name.split(' ')[0] || ''))}"><button type="submit" class="ds-icon-btn" aria-label="Send reply">➤</button></form>
                 <button type="button" class="ds-icon-btn" data-send aria-label="Send">✈</button>`
          }
        </div>`;
      const stage = root.querySelector('[data-stage]');
      videoEl = stage.querySelector('video');
      if (videoEl) {
        videoEl.muted = muted;
        videoEl.addEventListener('loadedmetadata', () => {
          if (videoEl.duration) duration = Math.min(90000, videoEl.duration * 1000);
        });
      }
      NS.renderOverlaysInto(stage, s, {});
      if (typeof enhanceMediaIn === 'function') enhanceMediaIn(stage);
      if (s.music?.previewUrl) {
        try {
          musicAudio = new Audio(s.music.previewUrl);
          musicAudio.loop = true;
          if (!muted) musicAudio.play().catch(() => {});
        } catch (e) {}
      }
      wireInteractive(stage, s, own);
      startProgress();
      hydrateInteractions(s);

      root.querySelector('[data-close]').addEventListener('click', () => layer.close());
      root.querySelector('[data-mute]').addEventListener('click', () => {
        muted = !muted;
        if (videoEl) {
          videoEl.muted = muted;
          if (!muted) videoEl.play().catch(() => {});
        }
        if (musicAudio) {
          if (muted) musicAudio.pause();
          else musicAudio.play().catch(() => {});
        }
        root.querySelector('[data-mute]').textContent = muted ? '🔇' : '🔊';
      });
      root.querySelector('[data-profile]').addEventListener('click', () => {
        setPaused(true);
        if (typeof openPublicProfile === 'function') openPublicProfile({ uid: s.uid, name: s.name, avatar: s.avatar });
      });
      root.querySelectorAll('[data-viewers]').forEach((b) => b.addEventListener('click', () => showViewers(s)));
      root.querySelector('[data-more]').addEventListener('click', () => showMore(s, own));
      root.querySelector('[data-comments]')?.addEventListener('click', () => showComments(s, own));
      root.querySelector('[data-send]')?.addEventListener('click', () => showSend(s));
      root.querySelector('[data-like]')?.addEventListener('click', async (ev) => {
        liked = !liked;
        ev.currentTarget.textContent = liked ? '❤' : '♡';
        try {
          await likePlatformStory(s, liked);
        } catch (e) {
          NS.report('duniya_story_like', e);
        }
      });
      root.querySelector('[data-reply]')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = e.target.querySelector('input');
        const text = input.value.trim();
        if (!text) return;
        await sendDmReply(s, text);
        input.value = '';
      });
      const hit = root.querySelector('.ds-hit');
      let holdT = 0;
      hit.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.ds-widget,button,a,input')) return;
        holdT = setTimeout(() => {
          holding = true;
          setPaused(true);
        }, 160);
      });
      const endHold = () => {
        clearTimeout(holdT);
        if (holding) {
          holding = false;
          setPaused(false);
        }
      };
      hit.addEventListener('pointerup', endHold);
      hit.addEventListener('pointercancel', endHold);
      hit.addEventListener('pointerleave', endHold);
      root.querySelector('[data-prev]').addEventListener('click', (e) => {
        if (holding) return;
        e.stopPropagation();
        prev();
      });
      root.querySelector('[data-next]').addEventListener('click', (e) => {
        if (holding) return;
        e.stopPropagation();
        next(false);
      });
      let sx = 0;
      root.addEventListener(
        'touchstart',
        (e) => {
          sx = e.touches[0].clientX;
        },
        { passive: true }
      );
      root.addEventListener(
        'touchend',
        (e) => {
          const dx = e.changedTouches[0].clientX - sx;
          if (Math.abs(dx) > 60) {
            if (dx < 0) next(false);
            else prev();
          }
        },
        { passive: true }
      );
    }

    async function hydrateInteractions(s) {
      if (!s.id || typeof getStoryInteractions !== 'function') return;
      try {
        const ix = await getStoryInteractions(s);
        liked = !!ix.liked;
        const likeBtn = root.querySelector('[data-like]');
        if (likeBtn) likeBtn.textContent = liked ? '❤' : '♡';
        s._ix = ix;
        if (ix.addYoursFaces) s.addYoursFaces = ix.addYoursFaces;
      } catch (e) {
        NS.report('duniya_story_ix', e);
      }
    }

    function wireInteractive(stage, s, own) {
      stage.querySelectorAll('[data-poll]').forEach((b) =>
        b.addEventListener('click', async () => {
          setPaused(true);
          try {
            const res = await respondStoryInteractive(s, 'poll', Number(b.dataset.poll));
            applyTallies(stage, res.interactive?.poll);
          } catch (e) {
            NS.report('duniya_story_poll', e);
          }
          setPaused(false);
        })
      );
      stage.querySelectorAll('[data-quiz]').forEach((b) =>
        b.addEventListener('click', async () => {
          setPaused(true);
          try {
            const res = await respondStoryInteractive(s, 'quiz', Number(b.dataset.quiz));
            const quiz = res.interactive?.quiz;
            const correct = quiz?.correctIndex;
            b.style.background = Number(b.dataset.quiz) === correct ? '#c8f0c8' : '#f0c8c8';
            applyTallies(stage, quiz);
          } catch (e) {
            NS.report('duniya_story_quiz', e);
          }
          setPaused(false);
        })
      );
      stage.querySelector('[data-slider]')?.addEventListener('change', async (e) => {
        try {
          await respondStoryInteractive(s, 'slider', Number(e.target.value));
        } catch (err) {
          NS.report('duniya_story_slider', err);
        }
      });
      stage.querySelector('[data-ask]')?.addEventListener('click', () => {
        openSheet(
          `<h3>${NS.esc(s.overlays?.find((o) => o.type === 'question')?.prompt || 'Answer')}</h3><textarea data-a maxlength="280"></textarea>`,
          (sheet, close) => {
            sheet.querySelector('[data-done]') ||
              sheet.insertAdjacentHTML('beforeend', `<button type="button" class="ds-cta" data-send-a>Send</button>`);
            sheet.querySelector('[data-send-a],[data-done]')?.addEventListener('click', async () => {
              const text = sheet.querySelector('[data-a]')?.value?.trim();
              if (text) {
                try {
                  await respondStoryInteractive(s, 'question', text);
                } catch (e) {
                  NS.report('duniya_story_question', e);
                }
              }
              close();
            });
          }
        );
      });
      stage.querySelector('[data-add-yours]')?.addEventListener('click', () => {
        layer.close();
        NS.startCreate({ parentStory: s });
      });
      stage.querySelectorAll('[data-link]').forEach((b) =>
        b.addEventListener('click', () => {
          const url = b.dataset.link;
          if (typeof openExternalLink === 'function') openExternalLink(url);
          else if (typeof checkUrlAndOpen === 'function') checkUrlAndOpen(url);
          else window.open(url, '_blank', 'noopener');
        })
      );
      stage.querySelectorAll('[data-mention]').forEach((b) =>
        b.addEventListener('click', () => {
          setPaused(true);
          if (typeof openPublicProfile === 'function') openPublicProfile({ uid: b.dataset.mention });
        })
      );
      if (own && s.interactive?.question) {
        stage.querySelector('[data-kind="question"]')?.addEventListener('click', (e) => {
          if (e.target.closest('[data-ask]')) return;
          showQuestionInbox(s);
        });
      }
    }

    function applyTallies(stage, poll) {
      if (!poll?.counts || !poll.options) return;
      const total = poll.counts.reduce((a, b) => a + b, 0) || 1;
      stage.querySelectorAll('[data-poll],[data-quiz]').forEach((b, i) => {
        const n = poll.counts[i] || 0;
        b.textContent = `${poll.options[i]} · ${Math.round((n / total) * 100)}%`;
      });
    }

    async function showViewers(s) {
      if (!(s.own || (typeof currentUser !== 'undefined' && s.uid === currentUser?.uid))) return;
      openSheet(`<h3>${NS.tt('story_viewers', 'Viewers')}</h3><input type="search" data-q placeholder="${NS.tt('search', 'Search')}"><div data-list class="ds-empty">…</div>`, (sheet) => {
        const listEl = sheet.querySelector('[data-list]');
        const load = async (q) => {
          try {
            const data = await listStoryViews(s, q);
            const rows = data.viewers || [];
            listEl.className = '';
            listEl.innerHTML = rows.length
              ? rows
                  .map(
                    (v) =>
                      `<div class="ds-row" data-uid="${NS.esc(v.uid)}">${
                        v.avatar && /^https:/.test(v.avatar) ? `<img src="${NS.esc(v.avatar)}" alt="">` : ''
                      }<div><strong>${NS.esc(v.name)}</strong><small style="display:block;color:var(--muted)">@${NS.esc(v.username || '')}</small></div></div>`
                  )
                  .join('')
              : `<div class="ds-empty">${NS.tt('story_no_views', 'No views yet')}</div>`;
            listEl.querySelectorAll('[data-uid]').forEach((row) =>
              row.addEventListener('click', () => {
                if (typeof openPublicProfile === 'function') openPublicProfile({ uid: row.dataset.uid });
              })
            );
          } catch (e) {
            NS.report('duniya_story_views', e);
            listEl.innerHTML = `<div class="ds-empty">${NS.tt('story_no_views', 'No views yet')}</div>`;
          }
        };
        load('');
        sheet.querySelector('[data-q]').addEventListener('input', (e) => {
          clearTimeout(e.target._t);
          e.target._t = setTimeout(() => load(e.target.value), 200);
        });
      });
    }

    async function showComments(s, own) {
      const ix = s._ix || (typeof getStoryInteractions === 'function' ? await getStoryInteractions(s) : { comments: [] });
      s._ix = ix;
      openSheet(
        `<h3>${NS.tt('comments', 'Comments')}</h3>
         <div data-list>${(ix.comments || [])
           .map(
             (c) =>
               `<div class="ds-row" data-cid="${NS.esc(c.id)}"><div><strong>${NS.esc(c.name)}</strong> ${NS.esc(c.text)}</div>${
                 own || c.uid === currentUser?.uid
                   ? `<button type="button" data-del="${NS.esc(c.id)}" aria-label="Delete">✕</button>`
                   : ''
               }</div>`
           )
           .join('') || `<div class="ds-empty">${NS.tt('no_comments', 'No comments yet')}</div>`}</div>
         <form data-cform class="ds-compose" style="margin-top:8px;"><input type="text" maxlength="500" placeholder="${NS.tt('write_comment', 'Write a comment')}"><button class="ds-cta" type="submit">Send</button></form>`,
        (sheet) => {
          sheet.querySelector('[data-cform]').addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = sheet.querySelector('input').value.trim();
            if (!text) return;
            try {
              await commentPlatformStory(s, text);
              sheet.querySelector('input').value = '';
              if (typeof showToast === 'function') showToast(NS.tt('commented', 'Comment sent'));
            } catch (err) {
              NS.report('duniya_story_comment', err);
            }
          });
          sheet.querySelectorAll('[data-del]').forEach((b) =>
            b.addEventListener('click', async () => {
              try {
                await deleteStoryComment(s, b.dataset.del);
                b.closest('.ds-row')?.remove();
              } catch (err) {
                NS.report('duniya_story_del_comment', err);
              }
            })
          );
        }
      );
    }

    async function showSend(s) {
      openSheet(`<h3>${NS.tt('story_send', 'Send')}</h3><input type="search" data-q placeholder="${NS.tt('search', 'Search friends')}"><div data-list></div><button type="button" class="ds-cta" data-go>${NS.tt('send', 'Send')}</button>`, async (sheet, close) => {
        const selected = new Set();
        const listEl = sheet.querySelector('[data-list]');
        const paint = async (q) => {
          let rows = [];
          try {
            if (typeof searchUsersProvider === 'function' && q) rows = await searchUsersProvider(q, { limit: 12 });
            else if (typeof hydrateRelationships === 'function') {
              /* keep empty until query */
            }
          } catch (e) {}
          listEl.innerHTML = (rows || [])
            .map(
              (u) =>
                `<label class="ds-row"><input type="checkbox" data-uid="${NS.esc(u.uid)}"><span>${NS.esc(u.name || u.username)}</span></label>`
            )
            .join('') || `<div class="ds-empty">${NS.tt('search_friends', 'Search people to send to')}</div>`;
          listEl.querySelectorAll('[data-uid]').forEach((cb) =>
            cb.addEventListener('change', () => {
              if (cb.checked) selected.add(cb.dataset.uid);
              else selected.delete(cb.dataset.uid);
            })
          );
        };
        paint('');
        sheet.querySelector('[data-q]').addEventListener('input', (e) => {
          clearTimeout(e.target._t);
          e.target._t = setTimeout(() => paint(e.target.value), 200);
        });
        sheet.querySelector('[data-go]').addEventListener('click', async () => {
          const uids = [...selected];
          if (!uids.length) return;
          try {
            if (typeof sendStoryToPeers === 'function') await sendStoryToPeers(s, { uids });
            if (typeof showToast === 'function') showToast(NS.tt('story_sent', 'Sent'));
            close();
          } catch (err) {
            NS.report('duniya_story_send', err);
            if (typeof showToast === 'function') showToast(err.message || 'Could not send');
          }
        });
      });
    }

    async function sendDmReply(s, text) {
      const peer = { uid: s.uid, name: s.name, avatar: s.avatar, photoURL: s.avatar };
      try {
        if (typeof assertCanMessage === 'function') {
          const ok = await assertCanMessage(peer);
          if (!ok) return;
        }
        let chatId = typeof dmChatIdFor === 'function' ? dmChatIdFor(s.uid) : '';
        if (typeof ensurePeerDmChat === 'function') chatId = (await ensurePeerDmChat(s.uid)) || chatId;
        if (typeof sendRealtimeMessage === 'function') {
          await sendRealtimeMessage(chatId, text, false, null, {
            type: 'story',
            storyId: s.id,
            destination: 'duniya',
            url: s.thumb || s.media,
            thumb: s.thumb || s.media,
            name: s.name,
            ownerUid: s.uid,
            mediaType: s.mediaType,
            expiresAt: s.expiresAt,
          });
        }
        if (typeof showToast === 'function') showToast(NS.tt('story_replied', 'Reply sent'));
      } catch (e) {
        NS.report('duniya_story_reply', e);
      }
    }

    function showMore(s, own) {
      openSheet(
        `<h3>${NS.tt('more', 'More')}</h3>
         ${own ? `<button type="button" data-a="delete">${NS.tt('delete', 'Delete')}</button>
                  <button type="button" data-a="highlight">${NS.tt('add_highlight', 'Add to Highlight')}</button>
                  <button type="button" data-a="save">${NS.tt('save', 'Save')}</button>` : `<button type="button" data-a="restory">${NS.tt('restory', 'Restory')}</button>
                  <button type="button" data-a="mute">${NS.tt('mute_stories', 'Mute stories')}</button>
                  <button type="button" data-a="flag">${NS.tt('report', 'Report')}</button>`}
         <button type="button" data-a="post">${NS.tt('share_as_post', 'Share as Duniya post')}</button>
         <button type="button" data-a="copy">${NS.tt('copy_link', 'Copy link')}</button>`,
        (sheet, close) => {
          sheet.querySelectorAll('[data-a]').forEach((b) =>
            b.addEventListener('click', async () => {
              const a = b.dataset.a;
              close();
              if (a === 'delete' && window.confirm(NS.tt('delete_story_q', 'Delete this story?'))) {
                try {
                  await deletePlatformStory(s);
                  if (typeof renderDuniyaStories === 'function') renderDuniyaStories();
                  layer.close();
                } catch (e) {
                  NS.report('duniya_story_delete', e);
                }
              } else if (a === 'highlight') {
                try {
                  const data = await storyCall('list_highlights', {});
                  const h = (data.highlights || [])[0];
                  if (!h) {
                    if (typeof showToast === 'function') showToast(NS.tt('make_highlight_first', 'Create a highlight on your profile first'));
                    return;
                  }
                  await storyCall('add_highlight_story', { highlightId: h.id, destination: 'duniya', storyId: s.id });
                  if (typeof showToast === 'function') showToast(NS.tt('added_highlight', 'Added to highlight'));
                } catch (e) {
                  NS.report('duniya_story_highlight', e);
                }
              } else if (a === 'save' && s.media) {
                try {
                  const aTag = document.createElement('a');
                  aTag.href = s.media;
                  aTag.download = 'story';
                  aTag.rel = 'noopener';
                  aTag.click();
                } catch (e) {}
              } else if (a === 'restory') {
                layer.close();
                if (typeof NS.openEditor === 'function') {
                  NS.openEditor({
                    mediaUrl: s.media,
                    mediaType: s.mediaType,
                    restoryOf: { storyId: s.id, uid: s.uid, name: s.name },
                    overlays: [
                      { type: 'credit', uid: s.uid, name: s.name, x: 0.5, y: 0.9, locked: true, z: 20 },
                    ],
                  });
                }
              } else if (a === 'post') {
                layer.close();
                window.__duniyaPrefillPost = { media: s.media, thumb: s.thumb || s.media, mediaType: s.mediaType, caption: '', storyId: s.id };
                if (typeof openDuniyaPostSheet === 'function') openDuniyaPostSheet('post');
              } else if (a === 'copy') {
                const url = `${location.origin}/story/${s.id}`;
                try {
                  await navigator.clipboard.writeText(url);
                  if (typeof showToast === 'function') showToast(NS.tt('copied', 'Copied'));
                } catch (e) {}
              } else if (a === 'mute') {
                NS.muteAuthor(s.uid);
                if (typeof renderDuniyaStories === 'function') renderDuniyaStories();
                if (typeof showToast === 'function') showToast(NS.tt('muted_stories', 'Stories muted'));
              } else if (a === 'flag' && typeof openFlagSheet === 'function') {
                openFlagSheet({ uid: s.uid, name: s.name });
              }
            })
          );
        }
      );
    }

    async function showQuestionInbox(s) {
      try {
        const data = await listStoryInteractive(s);
        const answers = data.answers || [];
        openSheet(
          `<h3>${NS.tt('answers', 'Answers')}</h3>${
            answers.length
              ? answers.map((a) => `<div class="ds-row"><div><strong>${NS.esc(a.name)}</strong><div>${NS.esc(a.text)}</div></div></div>`).join('')
              : `<div class="ds-empty">${NS.tt('no_answers', 'No answers yet')}</div>`
          }`
        );
      } catch (e) {
        NS.report('duniya_story_answers', e);
      }
    }

    paint();
  };
})();
