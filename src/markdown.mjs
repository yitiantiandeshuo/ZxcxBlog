export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeUrl(url, image = false) {
  const s = url.trim();
  if (/^\/(?!\/)/.test(s) || /^https?:\/\//i.test(s) || (!image && /^(mailto:|#)/i.test(s))) return escapeHtml(s);
  return '';
}
function inline(value) {
  const tokens = [];
  const hold = html => `\u0000${tokens.push(html)-1}\u0000`;
  let s = value.replace(/`([^`\n]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^\s)]+)\)|\[([^\]]+)\]\(([^\s)]+)\)/g, (_, alt, image, label, link) => {
    const url = safeUrl(image || link, !!image);
    if (!url) return escapeHtml(alt || label);
    return hold(image ? `<img src="${url}" alt="${escapeHtml(alt)}" loading="lazy">` : `<a href="${url}" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
  });
  s = escapeHtml(s).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => tokens[Number(n)]);
}
export function markdown(input, { headingAnchors = false } = {}) {
  const usedHeadingIds = new Set();
  const lines = String(input ?? '').replace(/\r\n?/g, '\n').split('\n');
  let html = '', para = [], list = false, code = null;
  const flush = () => { if (para.length) { html += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
  const endList = () => { if (list) { html += '</ul>'; list = false; } };
  for (const line of lines) {
    if (/^```/.test(line)) { flush(); endList(); if (code === null) code = []; else { html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`; code = null; } continue; }
    if (code !== null) { code.push(line); continue; }
    if (!line.trim()) { flush(); endList(); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flush(); endList();
      const n = heading[1].length;
      if (!headingAnchors) { html += `<h${n}>${inline(heading[2])}</h${n}>`; continue; }
      const label = heading[2].replace(/!\[([^\]]*)\]\([^)]*\)|\[([^\]]+)\]\([^)]*\)/g, (_, alt, text) => alt || text).replace(/[`*_]/g, '').trim();
      const base = label.toLowerCase().replace(/\s+/gu, '-').replace(/[^\p{L}\p{N}-]/gu, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'heading';
      let id = base, suffix = 1;
      while (usedHeadingIds.has(id)) id = `${base}-${suffix++}`;
      usedHeadingIds.add(id);
      html += `<h${n} id="${escapeHtml(id)}">${inline(heading[2])}<a class="heading-anchor" href="#${encodeURIComponent(id)}" aria-label="${escapeHtml(`链接至：${label}`)}">#</a></h${n}>`;
      continue;
    }
    const item = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (item) { flush(); if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(item[1])}</li>`; continue; }
    endList();
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) { flush(); html += `<blockquote>${inline(quote[1])}</blockquote>`; continue; }
    para.push(line);
  }
  flush(); endList(); if (code !== null) html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`;
  return html;
}
