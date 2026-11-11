import { escapeHtml as e, markdown } from './markdown.mjs';
import { createPreviewController } from './preview.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), {status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const decode = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
const parsePart = s => JSON.parse(new TextDecoder().decode(decode(s)));
export async function authorize(request, env) {
  try {
    const team = (env.ACCESS_TEAM_DOMAIN || '').replace(/\/$/,'');
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !env.ACCESS_AUD || !env.ADMIN_EMAIL) return false;
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) return false;
    const parts = token.split('.'); if (parts.length !== 3) return false;
    const header = parsePart(parts[0]), claim = parsePart(parts[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || claim.iss !== team || !Number.isFinite(claim.exp) || claim.exp <= Date.now()/1000 || (claim.nbf != null && (!Number.isFinite(claim.nbf) || claim.nbf > Date.now()/1000)) || !(Array.isArray(claim.aud) && claim.aud.includes(env.ACCESS_AUD)) || typeof claim.email !== 'string' || claim.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) return false;
    const res = await fetch(`${team}/cdn-cgi/access/certs`); if (!res.ok) return false;
    const data = await res.json(); const jwk = data.keys?.find(k=>k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig'));
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch { return false; }
}
function validatePost(input) {
  if (!input || typeof input !== 'object') throw new Error('文章格式无效');
  const title = String(input.title || '').trim(), slug = String(input.slug || '').trim(), content = String(input.content || ''), excerpt = String(input.excerpt || '').trim(), category = String(input.category || '').trim();
  const tags = Array.isArray(input.tags) ? [...new Set(input.tags.map(t=>String(t).trim()).filter(Boolean))] : [];
  if (!title || title.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120 || content.length > 500000 || excerpt.length > 500 || category.length > 60 || tags.length > 20 || tags.some(t=>t.length > 60) || !['draft','published'].includes(input.status)) throw new Error('请检查标题、英文短链接、正文长度、分类、标签及状态');
  return {title,slug,content,excerpt,category,tags:JSON.stringify(tags),status:input.status};
}
function sameOrigin(req) { const origin = req.headers.get('Origin'); return !!origin && origin === new URL(req.url).origin; }
const fields = 'id,slug,title,content,excerpt,category,tags,status,created_at,updated_at,published_at';
export async function adminApi(req, env, url) {
  const path = url.pathname;
  if (req.method !== 'GET' && !sameOrigin(req)) return json({error:'请求来源无效'},403);
  try {
    if (path === '/api/admin/posts' && req.method === 'GET') return json((await env.DB.prepare(`SELECT ${fields} FROM posts ORDER BY updated_at DESC`).all()).results);
    if (path === '/api/admin/export' && req.method === 'GET') {
      const posts = (await env.DB.prepare(`SELECT ${fields} FROM posts ORDER BY created_at`).all()).results;
      return new Response(JSON.stringify({format:'zxcx-blog-backup',version:1,exported_at:new Date().toISOString(),posts},null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="blog-backup.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    if (path === '/api/admin/images' && req.method === 'GET') {
      const keys = []; let cursor;
      do {
        const page = await env.BUCKET.list({cursor});
        keys.push(...page.objects.map(o => o.key));
        cursor = page.truncated ? page.cursor : undefined;
        if (page.truncated && !cursor) throw new Error('R2 pagination failed');
      } while (cursor);
      return json({keys});
    }
    if (path.startsWith('/api/admin/media/') && req.method === 'GET') {
      const key = path.slice('/api/admin/media/'.length);
      if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(key)) return json({error:'图片不存在'},404);
      const object = await env.BUCKET.get(key); if (!object) return json({error:'图片不存在'},404);
      const headers = new Headers(); object.writeHttpMetadata(headers);
      headers.set('Cache-Control','no-store'); headers.set('X-Content-Type-Options','nosniff'); headers.set('Content-Security-Policy',"default-src 'none'; sandbox");
      return new Response(object.body,{headers});
    }
    if (path === '/api/admin/preview' && req.method === 'POST') { const input = await req.json(); if (typeof input.content !== 'string' || input.content.length > 500000) return json({error:'正文过长'},400); return json({html:markdown(input.content).replaceAll('src="/media/', 'src="/api/admin/media/')}); }
    if (path === '/api/admin/posts' && req.method === 'POST') {
      const input = await req.json(), post = validatePost(input);
      const isUpdate = typeof input.id === 'string' && input.id !== '';
      if (isUpdate && !/^[a-f0-9-]{36}$/.test(input.id)) return json({error:'文章 ID 无效'},400);
      const id = isUpdate ? input.id : crypto.randomUUID();
      const previous = isUpdate ? await env.DB.prepare('SELECT id,published_at,updated_at FROM posts WHERE id=?').bind(id).first() : null;
      if (isUpdate && (!previous || typeof input.updated_at !== 'string' || previous.updated_at !== input.updated_at)) return json({error:'文章已在其他窗口修改，请复制当前内容后重新载入，避免覆盖。'},409);
      const now = new Date(Math.max(Date.now(), previous ? Date.parse(previous.updated_at)+1 : 0)).toISOString();
      const published = post.status === 'published' ? previous?.published_at || now : previous?.published_at || null;
      if (isUpdate) {
        const result = await env.DB.prepare('UPDATE posts SET slug=?,title=?,content=?,excerpt=?,category=?,tags=?,status=?,updated_at=?,published_at=? WHERE id=? AND updated_at=?').bind(post.slug,post.title,post.content,post.excerpt,post.category,post.tags,post.status,now,published,id,input.updated_at).run();
        if (result.meta.changes !== 1) return json({error:'文章已在其他窗口修改，请复制当前内容后重新载入，避免覆盖。'},409);
      } else await env.DB.prepare(`INSERT INTO posts (${fields}) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id,post.slug,post.title,post.content,post.excerpt,post.category,post.tags,post.status,now,now,published).run();
      return json({id,updated_at:now});
    }
    if (path === '/api/admin/images' && req.method === 'POST') {
      const form = await req.formData(), file = form.get('file');
      if (!(file instanceof File) || file.size < 1 || file.size > 5*1024*1024) return json({error:'图片需小于 5 MB'},400);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const starts = arr => arr.every((b,i)=>bytes[i]===b);
      const format = starts([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]) ? ['png','image/png'] : starts([0xff,0xd8,0xff]) ? ['jpg','image/jpeg'] : starts([0x47,0x49,0x46,0x38]) ? ['gif','image/gif'] : starts([0x52,0x49,0x46,0x46]) && bytes.length > 12 && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP' ? ['webp','image/webp'] : null;
      if (!format) return json({error:'仅支持 PNG、JPEG、GIF 和 WebP 图片'},400);
      const key = `${crypto.randomUUID()}.${format[0]}`;
      await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:format[1]}});
      return json({url:'/media/'+key});
    }
    return json({error:'接口不存在'},404);
  } catch (err) { console.error('Admin API error',err); return json({error: err instanceof SyntaxError ? '请求格式无效' : (err.message?.startsWith('请检查') || err.message === '文章格式无效' ? err.message : '保存失败，请检查短链接是否重复或稍后重试')},400); }
}
export function adminPage() { return `<h1>文章管理</h1><p class="muted">使用 Markdown 写作。短链接使用小写英文字母、数字和连字符。</p><div class="toolbar"><button type="button" id="new">新建文章</button><a class="button secondary" href="/api/admin/export">导出文章备份</a></div><div id="notice" class="notice" role="status"></div><section class="panel"><h2 style="margin-top:0">文章列表</h2><div id="posts">加载中…</div></section><form id="editor" class="panel"><h2 style="margin-top:0">编辑文章</h2><input type="hidden" name="id"><input type="hidden" name="updated_at"><label class="field"><span>标题</span><input name="title" required maxlength="200"></label><label class="field"><span>短链接</span><input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="120" placeholder="my-first-post"></label><div class="row"><label class="field"><span>分类</span><input name="category" maxlength="60"></label><label class="field"><span>标签（逗号分隔）</span><input name="tags"></label></div><label class="field"><span>摘要（可选）</span><input name="excerpt" maxlength="500"></label><div class="editor-layout"><label class="field"><span>正文（Markdown）</span><textarea class="editor" name="content"></textarea></label><section class="preview-panel" aria-label="文章预览"><div class="preview-heading"><strong>预览</strong><label class="live-preview-toggle"><input id="livePreview" type="checkbox">自动预览</label></div><p id="previewStatus" class="status" role="status">点击预览，或开启自动预览。</p><div id="previewResult" class="content post-content"></div></section></div><label class="field"><span>上传图片（不超过 5 MB）</span><input id="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></label><div class="toolbar"><button type="button" id="upload" class="secondary">上传并插入图片</button><button type="button" id="preview" class="secondary">预览</button><button type="submit" name="status" value="draft">保存草稿</button><button type="submit" name="status" value="published">发布文章</button></div></form><script>
const createPreviewController = ${createPreviewController.toString()};
const form=document.querySelector('#editor'), notice=document.querySelector('#notice'), postsEl=document.querySelector('#posts'); let posts=[];
function message(s){notice.textContent=s;}
async function api(path, options={}){const r=await fetch(path,options);let d=await r.json();if(!r.ok)throw Error(d.error||'请求失败');return d;}
const previewController=createPreviewController({read:()=>form.elements.content.value,request:content=>api('/api/admin/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content})}),render:result=>{document.querySelector('#previewResult').innerHTML=result.html;},report:text=>{document.querySelector('#previewStatus').textContent=text;}});
function reset(){previewController.setEnabled(false);form.reset();form.elements.id.value='';document.querySelector('#previewResult').replaceChildren();document.querySelector('#previewStatus').textContent='点击预览，或开启自动预览。';message('');}
async function refresh(){posts=await api('/api/admin/posts');postsEl.replaceChildren();if(!posts.length){postsEl.textContent='还没有文章。';return}for(const p of posts){const row=document.createElement('p'),b=document.createElement('button'),s=document.createElement('span');b.type='button';b.className='secondary';b.textContent=p.title;b.addEventListener('click',()=>{for(const k of ['id','updated_at','title','slug','content','excerpt','category'])form.elements[k].value=p[k]||'';form.elements.tags.value=JSON.parse(p.tags||'[]').join(', ');previewController.changed();document.querySelector('#previewResult').replaceChildren();message('已载入文章');form.scrollIntoView();});s.className='status';s.textContent='　'+(p.status==='published'?'已发布':'草稿')+' · '+p.updated_at.slice(0,10);row.append(b,s);postsEl.append(row);}}
document.querySelector('#new').onclick=reset;
form.onsubmit=async ev=>{ev.preventDefault();try{const data=Object.fromEntries(new FormData(form));data.status=ev.submitter?.value||'draft';data.tags=data.tags.split(/[,，]/).map(t=>t.trim()).filter(Boolean);const result=await api('/api/admin/posts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});form.elements.id.value=result.id;form.elements.updated_at.value=result.updated_at;await refresh();message(data.status==='draft'?'草稿已保存':'文章已发布');}catch(e){message(e.message)}};
document.querySelector('#preview').onclick=()=>previewController.run();
form.elements.content.addEventListener('input',()=>previewController.changed());
document.querySelector('#livePreview').addEventListener('change',ev=>previewController.setEnabled(ev.target.checked));
document.querySelector('#upload').onclick=async()=>{try{const file=document.querySelector('#file').files[0];if(!file)throw Error('请先选择图片');const body=new FormData();body.append('file',file);const d=await api('/api/admin/images',{method:'POST',body});const t=form.elements.content,start=t.selectionStart,end=t.selectionEnd;t.setRangeText('![图片]('+d.url+')',start,end,'end');t.focus();previewController.changed();message('图片已上传');}catch(e){message(e.message)}};
refresh().catch(e=>message(e.message));</script>`; }
