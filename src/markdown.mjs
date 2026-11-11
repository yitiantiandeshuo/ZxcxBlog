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
// Split table cells without treating escaped pipes or pipes in inline code as separators.
function tableCells(line) {
  const cells = []; let cell = '', code = false, separators = 0;
  const text = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && text[i + 1] === '|') { cell += '|'; i++; }
    else if (c === '`') { code = !code; cell += c; }
    else if (c === '|' && !code) { cells.push(cell.trim()); cell = ''; separators++; }
    else cell += c;
  }
  cells.push(cell.trim());
  return separators || line.trim().startsWith('|') || line.trim().endsWith('|') ? cells : null;
}
export function markdown(input, { headingAnchors = false, onHeading = () => {} } = {}) {
  const usedHeadingIds = new Set();
  const lines = String(input ?? '').replace(/\r\n?/g, '\n').split('\n');
  let html = '', para = [], code = null;
  const lists = [];
  const flush = () => { if (para.length) { html += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
  const closeList = () => { const list = lists.pop(); html += `</li></${list.type}>`; };
  const endList = () => { while (lists.length) closeList(); };
  const addItem = (indent, type, start, value) => {
    while (lists.length && indent < lists[lists.length - 1].indent) closeList();
    const current = lists[lists.length - 1];
    if (!current || (indent > current.indent && lists.length < 32)) {
      html += `<${type}${type === 'ol' && start !== 1 ? ` start="${start}"` : ''}><li>${inline(value)}`;
      lists.push({indent, type});
    } else if (type === current.type) {
      html += `</li><li>${inline(value)}`;
    } else {
      closeList();
      html += `<${type}${type === 'ol' && start !== 1 ? ` start="${start}"` : ''}><li>${inline(value)}`;
      lists.push({indent, type});
    }
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/^```/.test(line)) { flush(); endList(); if (code === null) code = []; else { html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`; code = null; } continue; }
    if (code !== null) { code.push(line); continue; }
    if (!line.trim()) { flush(); endList(); continue; }
    const headers = tableCells(line), separators = index + 1 < lines.length ? tableCells(lines[index + 1]) : null;
    if (headers && separators && headers.length === separators.length && separators.every(cell => /^:?-{3,}:?$/.test(cell))) {
      flush(); endList();
      const alignment = separators.map(cell => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : '');
      const cellHtml = (cell, column, tag) => `<${tag}${alignment[column] ? ` class="align-${alignment[column]}"` : ''}>${inline(cell || '')}</${tag}>`;
      html += `<table><thead><tr>${headers.map((cell, i) => cellHtml(cell, i, 'th')).join('')}</tr></thead><tbody>`;
      index++;
      while (index + 1 < lines.length && lines[index + 1].trim()) {
        const row = tableCells(lines[index + 1]); if (!row) break;
        index++; html += `<tr>${headers.map((_, i) => cellHtml(row[i], i, 'td')).join('')}</tr>`;
      }
      html += '</tbody></table>';
      continue;
    }
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
      onHeading({level:n, id, label});
      html += `<h${n} id="${escapeHtml(id)}">${inline(heading[2])}<a class="heading-anchor" href="#${encodeURIComponent(id)}" aria-label="${escapeHtml(`链接至：${label}`)}">#</a></h${n}>`;
      continue;
    }
    const item = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.+)$/.exec(line);
    if (item) {
      flush();
      const indent = item[1].replace(/\t/g, '    ').length;
      const type = /^\d/.test(item[2]) ? 'ol' : 'ul';
      addItem(indent, type, type === 'ol' ? Number.parseInt(item[2], 10) : 1, item[3]);
      continue;
    }
    endList();
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) { flush(); html += `<blockquote>${inline(quote[1])}</blockquote>`; continue; }
    para.push(line);
  }
  flush(); endList(); if (code !== null) html += `<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`;
  return html;
}
