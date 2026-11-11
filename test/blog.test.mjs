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
