import { css } from './style.mjs';
import { themeScript } from './theme.mjs';
import { escapeHtml as e, markdown } from './markdown.mjs';
import { adminPage, adminApi, authorize } from './admin.mjs';

const response = (html, status = 200) => new Response(html, { status, headers: {'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"} });
const link = (path, label) => `<a href="${path}">${e(label)}</a>`;
const tagLinks = post => { const tags = JSON.parse(post.tags || '[]'); return `<div class="chips">${post.category ? link('/category/' + encodeURIComponent(post.category), post.category) : ''}${tags.map(t=>link('/tag/'+encodeURIComponent(t), '#'+t)).join('')}</div>`; };
const listing = posts => posts.length ? `<ul class="post-list">${posts.map(p=>`<li><time>${e((p.published_at || '').slice(0,10))}</time>${link('/post/'+encodeURIComponent(p.slug),p.title)}</li>`).join('')}</ul>` : '<p class="muted">这里暂时还没有文章。</p>';
function archiveListing(posts) {
  if (!posts.length) return listing(posts);
  const years = new Map();
  for (const post of posts) {
    const year = /^\d{4}-/.test(post.published_at || '') ? post.published_at.slice(0,4) : '未注明年份';
    if (!years.has(year)) years.set(year, []);
    years.get(year).push(post);
  }
  return [...years].map(([year, entries]) => `<section class="archive-year"><h2>${e(year)}</h2>${listing(entries)}</section>`).join('');
}
function layout(env, body, title = '') {
  const name = e(env.SITE_TITLE || '我的博客');
  const navigation = '<a href="/archive">归档</a><a href="/topics">分类与标签</a><a href="/about">关于</a><a href="/search">搜索</a>';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${e(env.SITE_DESCRIPTION || '记录生活与思考。')}"><title>${title ? e(title)+' · ' : ''}${name}</title><style>${css}</style><script>${themeScript}</script></head><body><div class="wrap"><header><div class="brand"><a class="logo" href="/">${name}</a><button class="theme-toggle" type="button" aria-label="切换深浅色" aria-pressed="false"><span class="theme-moon" aria-hidden="true">☾</span><span class="theme-sun" aria-hidden="true">☀</span></button></div><nav class="nav nav-desktop" aria-label="主导航">${navigation}</nav><details class="mobile-menu"><summary aria-label="导航菜单"><span aria-hidden="true">☰</span></summary><nav class="nav nav-mobile" aria-label="主导航">${navigation}</nav></details></header><main>${body}</main><footer><span>© ${new Date().getUTCFullYear()} ${name}</span><span><a href="/admin">管理</a></span></footer></div></body></html>`;
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
  const candidates = (await env.DB.prepare("SELECT content FROM posts WHERE status = 'published' AND instr(content, ?) > 0").bind('/media/'+key).all()).results;
  if (!candidates.some(post => markdown(post.content).includes(`src="/media/${key}"`))) return mediaNotFound();

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
      return response(layout(env, adminPage(), '文章管理'));
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', {status:405});
    if (path.startsWith('/media/')) {
      return await media(request, env, path.slice(7), url);
    }
    if (path.startsWith('/post/')) {
      const slug = decodeURIComponent(path.slice(6));
      const p = await env.DB.prepare("SELECT * FROM posts WHERE slug = ? AND status = 'published'").bind(slug).first();
      if (!p) return response(layout(env,'<h1>文章不存在</h1>'),404);
      const headings = [];
      const content = markdown(p.content, {headingAnchors:true, onHeading: heading => { if (heading.level <= 4) headings.push(heading); }});
      const toc = headings.length > 1 ? `<details class="post-toc"><summary>文章目录</summary><nav aria-label="文章目录"><ol>${headings.map(h => `<li class="toc-level-${h.level}"><a href="#${encodeURIComponent(h.id)}">${e(h.label)}</a></li>`).join('')}</ol></nav></details>` : '';
      return response(layout(env,`<article class="post"><div class="post-heading"><h1>${e(p.title)}</h1><p class="meta"><time datetime="${e(p.published_at || '')}">${e((p.published_at || '').slice(0,10))}</time></p>${tagLinks(p)}</div><div class="content post-content">${toc}${content}</div><nav class="post-end-nav" aria-label="文章导航"><a href="/">← 返回首页</a><a href="#">返回顶部 ↑</a></nav></article>`,p.title));
    }
    if (path === '/about') return response(layout(env,'<h1>关于</h1><div class="content"><p>你好，欢迎来到我的博客。</p><p>这里记录生活与思考。</p></div>','关于'));
    if (!['/','/archive','/topics','/search'].includes(path) && !path.startsWith('/category/') && !path.startsWith('/tag/')) return response(layout(env,'<h1>页面不存在</h1>'),404);
    const posts = await publicPosts(env);
    if (path === '/') return response(layout(env,`<section class="intro"><p>${e(env.SITE_DESCRIPTION || '记录生活与思考。')}</p>${link('/about','了解更多 →')}</section><h2 class="home-posts-title"><a href="/archive">近期发布</a></h2>${listing(posts.slice(0,15))}${posts.length > 15 ? '<p><a href="/archive">查看全部文章 →</a></p>' : ''}`));
    if (path === '/archive') return response(layout(env,`<h1>归档</h1>${archiveListing(posts)}`,'归档'));
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
    if (path === '/search') {
      const q = (url.searchParams.get('q') || '').trim().slice(0,100), lower = q.toLocaleLowerCase();
      const matches = q ? (await env.DB.prepare("SELECT slug,title,excerpt,category,tags,published_at,content FROM posts WHERE status = 'published' ORDER BY published_at DESC, id DESC").all()).results.filter(p=>[p.title,p.content,p.excerpt,p.category,p.tags].some(s=>s.toLocaleLowerCase().includes(lower))) : [];
      return response(layout(env,`<h1>搜索</h1><form action="/search"><label class="sr" for="q">搜索文章</label><div class="row"><input id="q" name="q" value="${e(q)}" placeholder="搜索文章"><button style="flex:0">搜索</button></div></form><div class="results">${q ? listing(matches) : '<p class="muted">输入关键词搜索文章。</p>'}</div>`,'搜索'));
    }
    return response(layout(env,'<h1>页面不存在</h1>'),404);
  } catch (error) { console.error('Request failed', error); if (path.startsWith('/media/')) return new Response('Service unavailable',{status:500,headers:{'Cache-Control':'no-store'}}); return response(layout(env,'<h1>暂时无法加载</h1><p>请稍后重试。</p>'),500); }
} };
