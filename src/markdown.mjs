import { Marked } from 'marked';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Do not let Markdown destinations escape the current origin via //, backslashes,
// encoded schemes or control characters. External images and links remain HTTPS/HTTP.
function safeUrl(value, image = false) {
  const s = String(value ?? '').trim();
  if (!s || /[\u0000-\u001f\u007f\\]/.test(s)) return '';
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  if (!image && (s.startsWith('#') || /^mailto:[^\s]+$/i.test(s))) return s;
  try {
    const url = new URL(s);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return s;
  } catch { /* Not an absolute URL. */ }
  return '';
}

export function markdown(input, { headingAnchors = false, onHeading = () => {} } = {}) {
  const usedHeadingIds = new Set();
  const parser = new Marked({
    gfm:true, breaks:true,
    renderer:{
      html(token) { return escapeHtml(token.text); },
      link(token) {
        const body = this.parser.parseInline(token.tokens);
        const url = safeUrl(token.href);
        if (!url) return body;
        return `<a href="${escapeHtml(url)}"${token.title ? ` title="${escapeHtml(token.title)}"` : ''} rel="noopener noreferrer">${body}</a>`;
      },
      image(token) {
        const url = safeUrl(token.href, true);
        if (!url) return escapeHtml(token.text);
        return `<img src="${escapeHtml(url)}" alt="${escapeHtml(token.text)}"${token.title ? ` title="${escapeHtml(token.title)}"` : ''} loading="lazy">`;
      },
      heading(token) {
        const body = this.parser.parseInline(token.tokens), n = token.depth;
        if (!headingAnchors) return `<h${n}>${body}</h${n}>`;
        // Preserve the project's existing heading IDs and duplicate suffixes.
        const label = token.text.replace(/!\[([^\]]*)\]\([^)]*\)|\[([^\]]+)\]\([^)]*\)/g, (_, alt, text) => alt || text || '').replace(/[`*_]/g, '').trim();
        const base = label.toLowerCase().replace(/\s+/gu, '-').replace(/[^\p{L}\p{N}-]/gu, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'heading';
        let id = base, suffix = 1;
        while (usedHeadingIds.has(id)) id = `${base}-${suffix++}`;
        usedHeadingIds.add(id);
        onHeading({level:n,id,label});
        return `<h${n} id="${escapeHtml(id)}">${body}<a class="heading-anchor" href="#${encodeURIComponent(id)}" aria-label="${escapeHtml(`链接至：${label}`)}">#</a></h${n}>`;
      },
      checkbox(token) {
        return `<input type="checkbox" disabled${token.checked ? ' checked' : ''} aria-label="${token.checked ? '已完成' : '未完成'}">`;
      }
    }
  });
  return parser.parse(String(input ?? ''));
}
