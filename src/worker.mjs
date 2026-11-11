import { css } from './style.mjs';
import { escapeHtml as e, markdown } from './markdown.mjs';
import { adminPage, adminApi, authorize } from './admin.mjs';

const response = (html, status = 200) => new Response(html, { status, headers: {'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; img-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"} });
const link = (path, label) => `<a href="${path}">${e(label)}</a>`;
const tagLinks = post => { const tags = JSON.parse(post.tags || '[]'); return `<div class="chips">${post.category ? link('/category/' + encodeURIComponent(post.category), post.category) : ''}${tags.map(t=>link('/tag/'+encodeURIComponent(t), '#'+t)).join('')}</div>`; };
const listing = posts => posts.length ? `<ul class="post-list">${posts.map(p=>`<li><time>${e((p.published_at || '').slice(0,10))}</time>${link('/post/'+encodeURIComponent(p.slug),p.title)}</li>`).join('')}</ul>` : '<p class="muted">这里暂时还没有文章。</p>';
function layout(env, body, title = '') {
  const name = e(env.SITE_TITLE || '我的博客');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${e(env.SITE_DESCRIPTION || '记录生活与思考。')}"><title>${title ? e(title)+' · ' : ''}${name}</title><style>${css}</style></head><body><div class="wrap"><header><a class="logo" href="/">${name}</a><nav class="nav" aria-label="主导航"><a href="/archive">归档</a><a href="/topics">分类与标签</a><a href="/about">关于</a><a href="/search">搜索</a></nav></header><main>${body}</main><footer><span>© ${new Date().getUTCFullYear()} ${name}</span><span><a href="/admin">管理</a></span></footer></div></body></html>`;
}
async function publicPosts(env) { return (await env.DB.prepare("SELECT slug,title,excerpt,category,tags,published_at FROM posts WHERE status = 'published' ORDER BY published_at DESC, id DESC").all()).results; }
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
      const key = path.slice(7);
      if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(key)) return new Response('Not found',{status:404});
      const notFound = () => new Response('Not found',{status:404,headers:{'Cache-Control':'no-store'}});
      const candidates = (await env.DB.prepare("SELECT content FROM posts WHERE status = 'published' AND instr(content, ?) > 0").bind('/media/'+key).all()).results;
      if (!candidates.some(post => markdown(post.content).includes(`src="/media/${key}"`))) return notFound();
      const object = await env.BUCKET.get(key); if (!object) return notFound();
      const headers = new Headers({'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; sandbox"});
      object.writeHttpMetadata(headers); return new Response(object.body,{headers});
    }
    if (path.startsWith('/post/')) {
      const slug = decodeURIComponent(path.slice(6));
      const p = await env.DB.prepare("SELECT * FROM posts WHERE slug = ? AND status = 'published'").bind(slug).first();
      if (!p) return response(layout(env,'<h1>文章不存在</h1>'),404);
      return response(layout(env,`<article><h1>${e(p.title)}</h1><p class="meta">${e((p.published_at || '').slice(0,10))}</p>${tagLinks(p)}<div class="content">${markdown(p.content)}</div></article>`,p.title));
    }
    if (path === '/about') return response(layout(env,'<h1>关于</h1><div class="content"><p>你好，欢迎来到我的博客。</p><p>这里记录生活与思考。</p></div>','关于'));
    const posts = await publicPosts(env);
    if (path === '/') return response(layout(env,`<section class="intro"><p>${e(env.SITE_DESCRIPTION || '记录生活与思考。')}</p>${link('/about','了解更多 →')}</section><h2>近期发布</h2>${listing(posts.slice(0,15))}${posts.length > 15 ? '<p><a href="/archive">查看全部文章 →</a></p>' : ''}`));
    if (path === '/archive') return response(layout(env,`<h1>归档</h1>${listing(posts)}`,'归档'));
    if (path === '/topics') {
      const categories = [...new Set(posts.map(p=>p.category).filter(Boolean))].sort();
      const tags = [...new Set(posts.flatMap(p=>JSON.parse(p.tags || '[]')))].sort();
      return response(layout(env,`<h1>分类与标签</h1><h2>分类</h2><div class="chips">${categories.map(t=>link('/category/'+encodeURIComponent(t),t)).join(' ') || '暂无分类'}</div><h2>标签</h2><div class="chips">${tags.map(t=>link('/tag/'+encodeURIComponent(t),'#'+t)).join(' ') || '暂无标签'}</div>`,'分类与标签'));
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
  } catch (error) { console.error('Request failed', error); return response(layout(env,'<h1>暂时无法加载</h1><p>请稍后重试。</p>'),500); }
} };
