import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import {authorize,adminApi} from '../src/admin.mjs';
import {markdown} from '../src/markdown.mjs';

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const team='https://example.cloudflareaccess.com';
const env={ACCESS_TEAM_DOMAIN:team, ACCESS_AUD:'the-audience', ADMIN_EMAIL:'owner@example.com',SITE_TITLE:'Test',SITE_DESCRIPTION:'Hello'};
const keypair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const publicKey=await crypto.subtle.exportKey('jwk',keypair.publicKey); publicKey.kid='key1'; publicKey.use='sig';
const oldFetch=globalThis.fetch;
async function token(claims={}) { const h=b64({alg:'RS256',kid:'key1'}), p=b64({iss:team,aud:['the-audience'],email:'owner@example.com',exp:Math.floor(Date.now()/1000)+60,...claims});const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keypair.privateKey,new TextEncoder().encode(h+'.'+p));return h+'.'+p+'.'+Buffer.from(sig).toString('base64url'); }
test('Access validates signature, issuer, audience, email and expiry; failures close', async()=>{
  globalThis.fetch=async()=>Response.json({keys:[publicKey]});
  try {
    const req=async claims=>new Request('https://blog.test/admin',{headers:{'Cf-Access-Jwt-Assertion':await token(claims)}});
    assert.equal(await authorize(await req({}),env),true);
    for(const claims of [{iss:'https://evil.cloudflareaccess.com'},{aud:['other']},{email:'other@example.com'},{exp:1},{nbf:Date.now()/1000+1000}]) assert.equal(await authorize(await req(claims),env),false);
    assert.equal(await authorize(new Request('https://blog.test/admin'),env),false);
    assert.equal(await authorize(await req({}),{...env,ACCESS_AUD:''}),false);
    const bad=await token(); assert.equal(await authorize(new Request('https://blog.test/admin',{headers:{'Cf-Access-Jwt-Assertion':bad.slice(0,-10)+'aaaaaaaaaa'}}),env),false);
  } finally {globalThis.fetch=oldFetch;}
});
test('markdown escapes HTML and rejects unsafe links',()=>{
  const s=markdown('# 标题\n\n<script>alert(1)</script>\n\n[x](javascript:alert)\n\n![图](/media/file.png)\n\n```\n<x>\n```');
  assert.match(s,/<h1>标题<\/h1>/); assert.doesNotMatch(s,/<script>/);assert.doesNotMatch(s,/href="javascript:/);assert.match(s,/src="\/media\/file.png"/);assert.match(s,/&lt;x&gt;/);
});
test('private endpoints reject missing identity before touching storage',async()=>{
  for (const path of ['/admin','/admin/anything','/api/admin/posts','/api/admin/export']) { const r=await worker.fetch(new Request('https://blog.test'+path),env);assert.equal(r.status,403,path); }
});
test('admin writes reject cross-origin and missing Origin',async()=>{
  for(const origin of [null,'https://evil.test']) {const h={'Content-Type':'application/json'};if(origin)h.Origin=origin; const req=new Request('https://blog.test/api/admin/posts',{method:'POST',headers:h,body:'{}'}); assert.equal((await adminApi(req,env,new URL(req.url))).status,403);}
});
test('public pages escape user content and never load drafts',async()=>{
  const seen=[];const db={prepare(sql){seen.push(sql);return {bind(){return this},async all(){return {results:[{title:'<img src=x>',slug:'hello',excerpt:'',category:'',tags:'[]',published_at:'2026-01-01'}]}},async first(){return null}}}};
  const r=await worker.fetch(new Request('https://blog.test/'),{...env,DB:db});const body=await r.text();assert.equal(r.status,200);assert.match(body,/&lt;img src=x&gt;/);assert.ok(seen.every(sql=>sql.includes("status = 'published'")));
  assert.equal((await worker.fetch(new Request('https://blog.test/post/draft'),{...env,DB:db})).status,404);
});

test('D1/R2 workflow: drafts, media visibility, publishing and stale edits', async()=>{
  const {DatabaseSync}=await import('node:sqlite');
  const {readFileSync}=await import('node:fs');
  const db=new DatabaseSync(':memory:'); db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  const D1={prepare(sql){const stmt=db.prepare(sql);let args=[];return {bind(...x){args=x;return this},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}}}}}};
  const storage=new Map(); const BUCKET={async put(key,data,opts){storage.set(key,{data,opts})},async get(key){const x=storage.get(key);return x?{body:x.data,writeHttpMetadata(h){h.set('content-type',x.opts.httpMetadata.contentType)}}:null},async list(){return {objects:[...storage.keys()].map(key=>({key})),truncated:false}}};
  const E={...env,DB:D1,BUCKET}, headers={Origin:'https://blog.test','Content-Type':'application/json'};
  const api=async(path,data)=>{const req=new Request('https://blog.test'+path,{method:'POST',headers,body:JSON.stringify(data)});return adminApi(req,E,new URL(req.url))};
  const form=new FormData();form.set('file',new File([Uint8Array.from([137,80,78,71,13,10,26,10,0])],'test.png',{type:'image/png'}));
  const imageReq=new Request('https://blog.test/api/admin/images',{method:'POST',headers:{Origin:'https://blog.test'},body:form});
  const upload=await adminApi(imageReq,E,new URL(imageReq.url));assert.equal(upload.status,200);const image=(await upload.json()).url;
  const input={title:'Draft title',slug:'draft-title',content:`![secret](${image})`,category:'笔记',tags:['test'],status:'draft'};
  let r=await api('/api/admin/posts',input);assert.equal(r.status,200);let saved=await r.json();
  assert.equal((await worker.fetch(new Request('https://blog.test'+image),E)).status,404);
  assert.equal((await worker.fetch(new Request('https://blog.test/post/draft-title'),E)).status,404);
  const stale={...input,...saved};r=await api('/api/admin/posts',{...stale,status:'published'});assert.equal(r.status,200);saved=await r.json();
  const published=await worker.fetch(new Request('https://blog.test'+image),E);assert.equal(published.status,200);assert.equal(published.headers.get('Cache-Control'),'no-store');
  assert.equal((await worker.fetch(new Request('https://blog.test/post/draft-title'),E)).status,200);
  r=await api('/api/admin/posts',{...stale,content:'old overwrite'});assert.equal(r.status,409);assert.equal(db.prepare('select content from posts').get().content,input.content);
  r=await api('/api/admin/posts',{...input,...saved,status:'draft'});assert.equal(r.status,200);
  const hidden = await worker.fetch(new Request('https://blog.test'+image),E);assert.equal(hidden.status,404);assert.equal(hidden.headers.get('Cache-Control'),'no-store');
  saved=await r.json();r=await api('/api/admin/posts',{...input,...saved,status:'published',content:'```\n![secret]('+image+')\n```'});assert.equal(r.status,200);
  assert.equal((await worker.fetch(new Request('https://blog.test'+image),E)).status,404);
  saved=await r.json();r=await api('/api/admin/posts',{...input,...saved,status:'draft'});assert.equal(r.status,200);
  const expReq=new Request('https://blog.test/api/admin/export');const exp=await adminApi(expReq,E,new URL(expReq.url));const backup=await exp.json();assert.equal(backup.posts[0].content,input.content);assert.equal(backup.posts[0].status,'draft');
  const listReq=new Request('https://blog.test/api/admin/images');const list=await adminApi(listReq,E,new URL(listReq.url));assert.deepEqual((await list.json()).keys,[image.slice(7)]);
  db.close();
});

test('archive groups published posts by year, newest first, and excludes drafts',async()=>{
  const {DatabaseSync}=await import('node:sqlite');const {readFileSync}=await import('node:fs');
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
  const insert=db.prepare('INSERT INTO posts (id,slug,title,status,created_at,updated_at,published_at) VALUES (?,?,?,?,?,?,?)');
  insert.run('1','older','Old','published','2024','2024','2024-06-01');
  insert.run('2','newer','New','published','2025','2025','2025-03-01');
  insert.run('3','newest','Newest','published','2025','2025','2025-10-01');
  insert.run('4','draft','Secret draft','draft','2026','2026','2026-01-01');
  const DB={prepare(sql){return {async all(){return {results:db.prepare(sql).all()}}}}};
  try {
    const res=await worker.fetch(new Request('https://blog.test/archive'),{...env,DB});const html=await res.text();
    assert.equal(res.status,200);assert.ok(html.indexOf('<h2>2025</h2>') < html.indexOf('<h2>2024</h2>'));
    assert.ok(html.indexOf('>Newest</a>') < html.indexOf('>New</a>'));assert.match(html,/\/post\/older/);assert.doesNotMatch(html,/Secret draft/);
    db.exec('DELETE FROM posts');const empty=await worker.fetch(new Request('https://blog.test/archive'),{...env,DB});assert.match(await empty.text(),/这里暂时还没有文章/);
  }finally{db.close()}
});

test('article heading permalinks support unicode and unique duplicate IDs', () => {
  const html = markdown('# 中文 标题\n## 中文 标题\n## 中文 标题-1\n## 中文 标题\n## !!!\n## [链接](https://example.com)\n## <script>', {headingAnchors:true});
  assert.match(html, /id="中文-标题"/);
  assert.match(html, /href="#%E4%B8%AD%E6%96%87-%E6%A0%87%E9%A2%98"/);
  assert.match(html, /id="中文-标题-1"/);
  assert.match(html, /id="中文-标题-1-1"/);
  assert.match(html, /id="中文-标题-2"/);
  assert.match(html, /id="heading"/);
  assert.match(html, /id="链接"/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(markdown('# 标题'), '<h1>标题</h1>');
});

test('article directory links to unique headings and article navigation stays available', async()=>{
  const post={title:'文章',slug:'article',tags:'[]',category:'',published_at:'2026-01-01',content:'## 中文标题\n### 重复\n### 重复\n\n```\n## 代码里的标题\n```'};
  const DB={prepare(){return {bind(){return this},async first(){return post}}}};
  const html=await (await worker.fetch(new Request('https://blog.test/post/article'),{...env,DB})).text();
  assert.match(html,/<summary>文章目录<\/summary>/);
  assert.match(html,/<a href="#%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98">中文标题<\/a>/);
  assert.match(html,/<a href="#%E9%87%8D%E5%A4%8D-1">重复<\/a>/);
  assert.doesNotMatch(html,/<a href="#.*">代码里的标题<\/a>/);
  assert.match(html,/返回首页/);assert.match(html,/返回顶部/);
  post.content='无标题';
  const noToc=await (await worker.fetch(new Request('https://blog.test/post/article'),{...env,DB})).text();
  assert.doesNotMatch(noToc,/<summary>文章目录<\/summary>/);
});

test('topic counts include published posts once per tag', async()=>{
  const posts=[{category:'笔记',tags:'["生活","生活"]'},{category:'笔记',tags:'["生活","代码"]'},{category:'',tags:'[]'}];
  let query='';const DB={prepare(sql){query=sql;return {async all(){return {results:posts}}}}};
  const html=await (await worker.fetch(new Request('https://blog.test/topics'),{...env,DB})).text();
  assert.match(query,/status = 'published'/);
  assert.match(html,/笔记 \(2\)/);assert.match(html,/#生活 \(2\)/);assert.match(html,/#代码 \(1\)/);
});
