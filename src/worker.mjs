import { css } from './style.mjs';
import { themeScript } from './theme.mjs';
import { tocScript } from './toc.mjs';
import { shareScript } from './share.mjs';
import { escapeHtml as e, markdown } from './markdown.mjs';
import { adminPage, adminApi, authorize } from './admin.mjs';
import { readSettings, settingsEnv, settingsPage } from './settings.mjs';

const response = (html, status = 200) => new Response(html, { status, headers: {'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"} });
const link = (path, label) => `<a href="${path}">${e(label)}</a>`;
const tagLinks = post => { const tags = JSON.parse(post.tags || '[]'); return `<div class="chips">${post.category ? link('/category/' + encodeURIComponent(post.category), post.category) : ''}${tags.map(t=>link('/tag/'+encodeURIComponent(t), '#'+t)).join('')}</div>`; };
const listing = (posts, showExcerpt = false) => posts.length ? `<ul class="post-list">${posts.map(p=>`<li><time>${e((p.published_at || '').slice(0,10))}</time>${showExcerpt && p.excerpt ? `<span class="post-list-entry">${link('/post/'+encodeURIComponent(p.slug),p.title)}<span class="post-excerpt">${e(p.excerpt)}</span></span>` : link('/post/'+encodeURIComponent(p.slug),p.title)}</li>`).join('')}</ul>` : '<p class="muted">这里暂时还没有文章。</p>';
function archiveListing(posts, fold = false) {
  if (!posts.length) return listing(posts);
  const years = new Map();
  for (const post of posts) {
    const year = /^\d{4}-/.test(post.published_at || '') ? post.published_at.slice(0,4) : '未注明年份';
    if (!years.has(year)) years.set(year, []);
    years.get(year).push(post);
  }
  return [...years].map(([year, entries]) => fold ? `<details class="archive-year archive-fold"><summary>${e(year)} <span class="muted">(${entries.length})</span></summary>${listing(entries)}</details>` : `<section class="archive-year"><h2>${e(year)}</h2>${listing(entries)}</section>`).join('');
}
function assetUrl(value) {
  const s = String(value || '').trim();
  if (/^\/media\/[a-f0-9-]{36}\.(?:png|jpg|gif|webp)$/.test(s)) return s;
  try { const url = new URL(s); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; } catch {}
  return '';
}
function layout(env, body, title = '') {
  const name = e(env.SITE_TITLE || '我的博客');
  const avatar = assetUrl(env.SITE_AVATAR_URL);
  const icon = assetUrl(env.SITE_ICON_URL) || '/favicon.svg';
  const color = /^#[0-9a-fA-F]{6}$/.test(env.ACCENT_COLOR || '') ? env.ACCENT_COLOR : '#2bbc8a';
  const mobileNav = env.PUBLIC_PAGE && env.MOBILE_NAV === 1 ? '<nav class="mobile-quick-nav" aria-label="手机快捷导航"><a href="/">首页</a><a href="/archive">归档</a><a href="/search">搜索</a><a href="#">顶部</a></nav>' : '';
  const navigation = '<a href="/archive">归档</a><a href="/topics">分类与标签</a><a href="/about">关于</a><a href="/search">搜索</a>';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${e(env.SITE_DESCRIPTION || '记录生活与思考。')}"><title>${title ? e(title)+' · ' : ''}${name}</title><link rel="icon" href="${e(icon)}"><style>${css}:root,:root[data-theme="dark"]{--accent:${color}}</style><script>${themeScript}</script></head><body><div class="wrap"><header><div class="brand"><a class="avatar-link" href="/" aria-label="返回首页">${avatar ? `<img class="site-avatar" src="${e(avatar)}" alt="">` : `<span class="site-avatar avatar-placeholder" aria-hidden="true">${e(Array.from(String(env.SITE_TITLE || '我').trim())[0] || '我')}</span>`}</a><a class="logo" href="/">${name}</a><button class="theme-toggle" type="button" aria-label="切换深浅色" title="切换深浅色（Alt+T）" aria-pressed="false"><span class="theme-moon" aria-hidden="true">☾</span><span class="theme-sun" aria-hidden="true">☀</span></button></div><nav class="nav nav-desktop" aria-label="主导航">${navigation}</nav><details class="mobile-menu"><summary aria-label="导航菜单"><span aria-hidden="true">☰</span></summary><nav class="nav nav-mobile" aria-label="主导航">${navigation}</nav></details></header><main>${body}</main><footer><span>© ${new Date().getUTCFullYear()} ${name}</span><span><a href="/admin">管理</a></span></footer>${mobileNav}</div></body></html>`;
}
async function publicPosts(env) { return (await env.DB.prepare("SELECT slug,title,excerpt,category,tags,published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC, id DESC").all()).results; }
const mediaNotFound = () => new Response('Not found', {status:404,headers:{'Cache-Control':'no-store'}});
const maxCacheBytes = 5 * 1024 * 1024;
function etagMatches(header, etag) {
  if (!header || !etag) return false;
  return header.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag.replace(/^W\//, ''));
}
function mediaResponse(req, source) {
  const headers = new Headers(source.headers);
  headers.delete('x-blog-cache-missing');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  if (etagMatches(req.headers.get('If-None-Match'), headers.get('ETag'))) {
    headers.delete('Content-Length');
    return new Response(null, {status:304, headers});
  }
  return new Response(req.method === 'HEAD' ? null : source.body, {status:200, headers});
}
async function media(request, env, key, url) {
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(key)) return mediaNotFound();
  const site = await readSettings(env);
  const isSiteImage = site && (site.avatar_url === '/media/'+key || site.icon_url === '/media/'+key);
  if (!isSiteImage) {
    const candidates = (await env.DB.prepare("SELECT content FROM posts WHERE status = 'published' AND instr(content, ?) > 0").bind('/media/'+key).all()).results;
    if (!candidates.some(post => markdown(post.content).includes(`src="/media/${key}"`))) return mediaNotFound();
  }

  // The cache only holds objects, never the decision to make them public.
  const cacheUrl = new URL(url.origin); cacheUrl.pathname = '/__blog_media_cache_v1/' + key;
  const cacheKey = new Request(cacheUrl.toString(), {method:'GET'});
  let cache;
  try { cache = globalThis.caches?.default; } catch { /* Cache API may be unavailable. */ }
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit?.status === 404 && hit.headers.get('x-blog-cache-missing') === '1') return mediaNotFound();
      if (hit?.status === 200) return mediaResponse(request, hit);
    } catch { /* Preserve availability when cache is unavailable. */ }
  }
  const object = request.method === 'HEAD' && typeof env.BUCKET.head === 'function' ? await env.BUCKET.head(key) : await env.BUCKET.get(key);
  if (!object) {
    if (cache) try { await cache.put(cacheKey, new Response(null,{status:404,headers:{'Cache-Control':'public, max-age=30','x-blog-cache-missing':'1'}})); } catch { /* Safe uncached fallback. */ }
    return mediaNotFound();
  }
  const headers = new Headers(); object.writeHttpMetadata(headers);
  headers.set('Content-Type', {'png':'image/png','jpg':'image/jpeg','gif':'image/gif','webp':'image/webp'}[key.split('.').pop()]);
  headers.set('Cache-Control','public, max-age=3600');
  if (object.httpEtag) headers.set('ETag',object.httpEtag);
  if (Number.isSafeInteger(object.size) && object.size >= 0) headers.set('Content-Length',String(object.size));
  const raw = new Response(request.method === 'HEAD' ? null : object.body, {status:200,headers});
  if (cache && request.method === 'GET' && Number.isSafeInteger(object.size) && object.size <= maxCacheBytes && object.size >= 0) {
    try { await cache.put(cacheKey, raw.clone()); } catch { /* Safe uncached fallback. */ }
  }
  return mediaResponse(request,raw);
}
export default { async fetch(request, env) {
  const url = new URL(request.url), path = url.pathname;
  try {
    if (path === '/admin' || path.startsWith('/admin/') || path === '/api/admin' || path.startsWith('/api/admin/')) {
      const user = await authorize(request, env);
      if (!user) return response(layout(env, '<h1>无法访问</h1><p>请通过 Cloudflare Access 登录管理员账户。</p>'), 403);
      if (path.startsWith('/api/admin/')) return await adminApi(request, env, url);
      env = await settingsEnv(env);
      return response(layout(env, path === '/admin/settings' ? settingsPage() : adminPage(), path === '/admin/settings' ? '站点设置' : '文章管理'));
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {status:405});
    if (path === '/favicon.svg') return new Response(request.method === 'HEAD' ? null : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#2bbc8a"/><path d="M19 16h26v32H19z" fill="#fff"/><path d="M25 25h14M25 32h14M25 39h10" stroke="#2bbc8a" stroke-width="3" stroke-linecap="round"/></svg>', {headers:{'Content-Type':'image/svg+xml; charset=utf-8','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
    if (path.startsWith('/media/')) {
      return await media(request, env, path.slice(7), url);
    }
    env = {...await settingsEnv(env),PUBLIC_PAGE:true};
    if (path.startsWith('/post/')) {
      const slug = decodeURIComponent(path.slice(6));
      const p = await env.DB.prepare("SELECT * FROM posts WHERE slug = ? AND status = 'published'").bind(slug).first();
      if (!p) return response(layout(env,'<h1>文章不存在</h1>'),404);
      // Bounded lookups keep the public reading order consistent with the archive.
      const date = p.published_at || '';
      const neighborSql = direction => `SELECT slug,title FROM posts WHERE status = 'published' AND (COALESCE(published_at, '') ${direction === 'newer' ? '>' : '<'} ? OR (COALESCE(published_at, '') = ? AND id ${direction === 'newer' ? '>' : '<'} ?)) ORDER BY published_at ${direction === 'newer' ? 'ASC' : 'DESC'}, id ${direction === 'newer' ? 'ASC' : 'DESC'} LIMIT 1`;
      const [newer, older] = await Promise.all(['newer','older'].map(direction => env.DB.prepare(neighborSql(direction)).bind(date,date,p.id).first()));
      const neighbors = newer || older ? `<nav class="post-neighbors" aria-label="相邻文章">${newer ? `<div><span>上一篇</span>${link('/post/'+encodeURIComponent(newer.slug),newer.title)}</div>` : '<div></div>'}${older ? `<div><span>下一篇</span>${link('/post/'+encodeURIComponent(older.slug),older.title)}</div>` : ''}</nav>` : '';
      const updated = env.POST_SHOW_UPDATED !== 0 && p.updated_at && p.published_at && p.updated_at.slice(0,10) > p.published_at.slice(0,10) ? ` · 更新于 <time datetime="${e(p.updated_at)}">${e(p.updated_at.slice(0,10))}</time>` : '';
      const headings = [];
      const content = markdown(p.content, {headingAnchors:true, onHeading: heading => headings.push(heading)});
      const minLevel = Math.min(...headings.map(h=>h.level));
      const tocList = `<ol>${headings.map(h => `<li class="toc-indent-${h.level - minLevel}"><a href="#${encodeURIComponent(h.id)}">${e(h.label)}</a></li>`).join('')}</ol>`;
      const toc = env.POST_SHOW_TOC !== 0 && headings.length > 1 ? `<details class="post-toc"><summary>文章目录</summary><nav class="post-toc-nav" aria-label="文章目录">${tocList}</nav></details>` : '';
      const sideToc = env.POST_SHOW_TOC !== 0 && headings.length > 1 ? `<aside class="post-toc-side" aria-label="文章目录"><strong>文章目录</strong><nav class="post-toc-nav" aria-label="文章目录">${tocList}</nav></aside><script>${tocScript}</script>` : '';
      const share = env.POST_SHARE === 1 ? `<div class="post-share"><button type="button" id="shareArticle" class="secondary">分享文章</button><span id="shareStatus" role="status"></span><input id="shareFallback" aria-label="文章分享链接" readonly hidden></div><script>${shareScript}</script>` : '';
      return response(layout(env,`<article class="post"><div class="post-heading"><h1>${e(p.title)}</h1>${env.POST_SHOW_PUBLISHED !== 0 || updated ? `<p class="meta">${env.POST_SHOW_PUBLISHED !== 0 ? `<time datetime="${e(p.published_at || '')}">${e((p.published_at || '').slice(0,10))}</time>` : ''}${updated ? (env.POST_SHOW_PUBLISHED !== 0 ? updated : updated.replace(/^ · /, '')) : ''}</p>` : ''}${env.POST_SHOW_TOPICS !== 0 ? tagLinks(p) : ''}</div><div class="content post-content">${toc}${content}</div>${sideToc}${neighbors}${share}<nav class="post-end-nav" aria-label="文章导航"><a href="/">← 返回首页</a><a href="#">返回顶部 ↑</a></nav></article>`,p.title));
    }
    if (path === '/about') return response(layout(env,'<h1>关于</h1><div class="content"><p>你好，欢迎来到我的博客。</p><p>这里记录生活与思考。</p></div>','关于'));
    if (!['/','/archive','/topics','/search'].includes(path) && !path.startsWith('/category/') && !path.startsWith('/tag/')) return response(layout(env,'<h1>页面不存在</h1>'),404);
    if (path === '/search') {
      const q = (url.searchParams.get('q') || '').trim().slice(0,100), lower = q.toLocaleLowerCase();
      const matches = q ? (await env.DB.prepare("SELECT slug,title,excerpt,category,tags,published_at,content FROM posts WHERE status = 'published' ORDER BY published_at DESC, id DESC").all()).results.filter(p=>[p.title,p.content,p.excerpt,p.category,p.tags].some(s=>s.toLocaleLowerCase().includes(lower))) : [];
      return response(layout(env,`<h1>搜索</h1><form action="/search"><label class="sr" for="q">搜索文章</label><div class="row"><input id="q" name="q" value="${e(q)}" placeholder="搜索文章"><button style="flex:0">搜索</button></div></form><div class="results">${q ? listing(matches) : '<p class="muted">输入关键词搜索文章。</p>'}</div>`,'搜索'));
    }
    const posts = await publicPosts(env);
    if (path === '/') { const limit = env.HOME_LIMIT ?? 15;
      const socials = [['GitHub',assetUrl(env.GITHUB_URL)],['个人主页',assetUrl(env.SOCIAL_URL)],['邮箱',env.CONTACT_EMAIL ? 'mailto:'+encodeURIComponent(env.CONTACT_EMAIL) : '']].filter(([,href])=>href).map(([label,href])=>`<a href="${e(href)}" rel="noopener noreferrer">${e(label)}</a>`).join(''); return response(layout(env,`<section class="intro"><p>${e(env.SITE_DESCRIPTION || '记录生活与思考。')}</p>${link('/about','了解更多 →')}${socials ? `<nav class="social-links" aria-label="社交链接">${socials}</nav>` : ''}</section><form class="quick-search" action="/search" role="search"><label class="sr" for="home-search">搜索文章</label><input id="home-search" type="search" name="q" maxlength="100" placeholder="搜索文章…"><button type="submit">搜索</button></form><h2 class="home-posts-title"><a href="/archive">${e(env.HOME_HEADING || '近期发布')}</a></h2>${listing(posts.slice(0,limit), env.HOME_SHOW_EXCERPT !== 0)}${posts.length > limit ? '<p><a href="/archive">查看全部文章 →</a></p>' : ''}`)); }
    if (path === '/archive') return response(layout(env,`<h1>归档</h1>${archiveListing(posts,env.ARCHIVE_FOLD === 1)}`,'归档'));
    if (path === '/topics') {
      const categories = new Map(), tags = new Map();
      for (const post of posts) {
        if (post.category) categories.set(post.category, (categories.get(post.category) || 0) + 1);
        for (const tag of new Set(JSON.parse(post.tags || '[]'))) tags.set(tag, (tags.get(tag) || 0) + 1);
      }
      const categoryLinks = [...categories].sort(([a],[b])=>a.localeCompare(b)).map(([name,count])=>link('/category/'+encodeURIComponent(name), `${name} (${count})`)).join(' ');
      const tagLinks = [...tags].sort(([a],[b])=>a.localeCompare(b)).map(([name,count])=>link('/tag/'+encodeURIComponent(name), `#${name} (${count})`)).join(' ');
      return response(layout(env,`<h1>分类与标签</h1><h2>分类</h2><div class="chips">${categoryLinks || '暂无分类'}</div><h2>标签</h2><div class="chips">${tagLinks || '暂无标签'}</div>`,'分类与标签'));
    }
    if (path.startsWith('/category/') || path.startsWith('/tag/')) {
      const isTag = path.startsWith('/tag/'), name = decodeURIComponent(path.slice(isTag ? 5 : 10));
      const selected = posts.filter(p => isTag ? JSON.parse(p.tags || '[]').includes(name) : p.category === name);
      return response(layout(env,`<h1>${isTag ? '标签' : '分类'}：${e(name)}</h1>${listing(selected)}`,name));
    }
    return response(layout(env,'<h1>页面不存在</h1>'),404);
  } catch (error) { console.error('Request failed', error); if (path.startsWith('/media/')) return new Response('Service unavailable',{status:500,headers:{'Cache-Control':'no-store'}}); return response(layout(env,'<h1>暂时无法加载</h1><p>请稍后重试。</p>'),500); }
} };
