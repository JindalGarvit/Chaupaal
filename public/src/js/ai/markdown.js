/**
 * Minimal markdown → safe HTML for AI assistant text.
 * No new dependency — covers headings, bold/italic, lists, hr, code, paragraphs.
 * Escapes HTML first so raw user/AI text cannot inject scripts.
 */
(function () {
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inlineFormat(escaped) {
    return escaped
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^\*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1<em>$2</em>');
  }

  /**
   * @param {string} md
   * @returns {string} HTML
   */
  function renderMarkdown(md) {
    const raw = String(md || '').replace(/\r\n/g, '\n').trim();
    if (!raw) return '';
    const lines = raw.split('\n');
    const out = [];
    let i = 0;
    let inUl = false;
    let inOl = false;

    function closeLists() {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
    }

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        closeLists();
        i++;
        continue;
      }

      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        closeLists();
        out.push('<hr>');
        i++;
        continue;
      }

      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        closeLists();
        const level = heading[1].length;
        out.push(`<h${level}>${inlineFormat(escapeHtml(heading[2]))}</h${level}>`);
        i++;
        continue;
      }

      const ul = trimmed.match(/^[-*]\s+(.+)$/);
      if (ul) {
        if (inOl) {
          out.push('</ol>');
          inOl = false;
        }
        if (!inUl) {
          out.push('<ul>');
          inUl = true;
        }
        out.push(`<li>${inlineFormat(escapeHtml(ul[1]))}</li>`);
        i++;
        continue;
      }

      const ol = trimmed.match(/^\d+\.\s+(.+)$/);
      if (ol) {
        if (inUl) {
          out.push('</ul>');
          inUl = false;
        }
        if (!inOl) {
          out.push('<ol>');
          inOl = true;
        }
        out.push(`<li>${inlineFormat(escapeHtml(ol[1]))}</li>`);
        i++;
        continue;
      }

      closeLists();
      out.push(`<p>${inlineFormat(escapeHtml(trimmed))}</p>`);
      i++;
    }
    closeLists();
    return out.join('');
  }

  window.renderMarkdown = renderMarkdown;
  window.escapeHtml = escapeHtml;
})();
