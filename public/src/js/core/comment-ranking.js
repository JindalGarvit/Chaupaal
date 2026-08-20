/**
 * Engagement ranking for feed-level comment previews.
 * One preview slot max per thread root.
 */
(function () {
  'use strict';

  function buildCommentById(comments) {
    const map = new Map();
    (comments || []).forEach((c) => {
      if (c?.id) map.set(c.id, c);
    });
    return map;
  }

  function resolveThreadRootId(commentId, commentById) {
    let id = commentId;
    let guard = 0;
    while (id && guard < 10) {
      const c = commentById.get(id);
      if (!c || !c.parentId) return id;
      id = c.parentId;
      guard += 1;
    }
    return commentId;
  }

  function enrichReplyCounts(comments) {
    const direct = new Map();
    (comments || []).forEach((c) => {
      if (!c?.parentId) return;
      direct.set(c.parentId, (direct.get(c.parentId) || 0) + 1);
    });
    (comments || []).forEach((c) => {
      if (c && c.replyCount == null) c.replyCount = direct.get(c.id) || 0;
    });
    return comments;
  }

  /**
   * @param {Array} comments
   * @param {{ limit?: number, viewerUid?: string, nowMs?: number }} [opts]
   */
  function rankCommentsForPreview(comments, opts) {
    const o = opts || {};
    const limit = Math.max(1, Number(o.limit) || 3);
    const viewerUid = o.viewerUid || null;
    const nowMs = Number(o.nowMs) || Date.now();
    const list = enrichReplyCounts(Array.isArray(comments) ? comments.slice() : []);
    const commentById = buildCommentById(list);
    const candidates = list.filter((c) => c && !c.deleted);

    function score(c) {
      const likeCount = Number(c.likeCount) || 0;
      const replyCount = Number(c.replyCount) || 0;
      const ageMs = Math.max(0, nowMs - (Number(c.createdAt) || nowMs));
      const recencyBoost = Math.max(0, 5 - (ageMs / (7 * 86400000)) * 5);
      const viewerOwnBoost = viewerUid && (c.uid === viewerUid || c.user?.uid === viewerUid) ? 8 : 0;
      return likeCount * 3 + replyCount * 2 + recencyBoost + viewerOwnBoost;
    }

    const bestByRoot = new Map();
    candidates.forEach((c) => {
      const rootId = c.parentId ? resolveThreadRootId(c.id, commentById) : c.id;
      const s = score(c);
      const prev = bestByRoot.get(rootId);
      if (
        !prev ||
        s > prev.score ||
        (s === prev.score && (Number(c.createdAt) || 0) > (Number(prev.comment.createdAt) || 0))
      ) {
        bestByRoot.set(rootId, { comment: c, score: s });
      }
    });

    return Array.from(bestByRoot.values())
      .sort(
        (a, b) =>
          b.score - a.score ||
          (Number(b.comment.createdAt) || 0) - (Number(a.comment.createdAt) || 0)
      )
      .slice(0, limit)
      .map((x) => x.comment);
  }

  window.buildCommentById = buildCommentById;
  window.resolveThreadRootId = resolveThreadRootId;
  window.enrichCommentAggregates = enrichReplyCounts;
  window.rankCommentsForPreview = rankCommentsForPreview;
})();
