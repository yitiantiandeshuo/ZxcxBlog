import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';

const key='12345678-1234-1234-1234-123456789012.png', path='/media/'+key;
function fixture() {
  const state={published:true, exists:true, dbReads:0, gets:0, heads:0, puts:0, keys:[], failCache:false, failR2:false, size:3, data:'one', etag:'"v1"'};
  const entries=new Map();
  const cache={async match(req){if(state.failCache)throw Error('unavailable');return entries.get(req.url)?.clone()},async put(req,res){if(state.failCache)throw Error('unavailable');state.puts++;state.keys.push(req.url);entries.set(req.url,res.clone())}};
  const obj=body=>({body,size:state.size,httpEtag:state.etag,writeHttpMetadata(h){h.set('content-type','image/png');h.set('cache-control','public,max-age=999999')}});
  const env={DB:{prepare(){return {bind(){return this},async all(){state.dbReads++;return {results:state.published?[{content:state.content ?? `![x](${path})`}]:[]}}}}},BUCKET:{async get(){state.gets++;if(state.failR2)throw Error('r2');return state.exists?obj(state.data):null},async head(){state.heads++;if(state.failR2)throw Error('r2');return state.exists?obj(null):null}}};
  const fetch=(url=path,options={})=>worker.fetch(new Request('https://blog.example'+url,options),env);
  return {state,cache,fetch,entries};
}
async function withCache(cache,fn){const old=globalThis.caches;globalThis.caches={default:cache};try{return await fn()}finally{if(old===undefined)delete globalThis.caches;else globalThis.caches=old}}

test('cache is normalized, preserves headers, checks publication on every hit', async()=>{
 const f=fixture();await withCache(f.cache,async()=>{
  let r=await f.fetch(path+'?x=1');assert.equal(await r.text(),'one');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('etag'),'"v1"');assert.equal(r.headers.get('content-type'),'image/png');
  r=await f.fetch(path+'?other=2');assert.equal(await r.text(),'one');assert.equal(f.state.gets,1);assert.equal(f.state.dbReads,2);assert.equal(f.state.keys.length,1);assert.equal(new URL(f.state.keys[0]).search,'');
  assert.equal(f.entries.values().next().value.headers.get('cache-control'),'public, max-age=3600');
  f.state.published=false;r=await f.fetch();assert.equal(r.status,404);assert.equal(f.state.gets,1);
  f.state.published=true;f.state.data='two';f.state.etag='"v2"';r=await f.fetch();assert.equal(await r.text(),'one');assert.equal(f.state.gets,1);
  f.entries.clear();r=await f.fetch();assert.equal(await r.text(),'two');assert.equal(r.headers.get('etag'),'"v2"');assert.equal(f.state.gets,2);
 });
});
test('HEAD and conditional requests follow published-state checks',async()=>{
 const f=fixture();await withCache(f.cache,async()=>{
  let r=await f.fetch(path,{method:'HEAD'});assert.equal(r.status,200);assert.equal(await r.text(),'');assert.equal(r.headers.get('etag'),'"v1"');assert.equal(f.state.heads,1);assert.equal(f.state.gets,0);
  r=await f.fetch(path,{headers:{'If-None-Match':'W/"v1"'}});assert.equal(r.status,304);assert.equal(await r.text(),'');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(f.state.gets,1);
  r=await f.fetch(path,{method:'HEAD',headers:{'If-None-Match':'"v1"'}});assert.equal(r.status,304);assert.equal(f.state.heads,1);
  f.state.published=false;r=await f.fetch(path,{headers:{'If-None-Match':'"v1"'}});assert.equal(r.status,404);
 });
});
test('negative caching only occurs after publication check and missing object',async()=>{
 const f=fixture();await withCache(f.cache,async()=>{
  f.state.published=false;assert.equal((await f.fetch()).status,404);assert.equal(f.state.gets,0);assert.equal(f.state.puts,0);
  f.state.published=true;f.state.exists=false;assert.equal((await f.fetch()).status,404);assert.equal((await f.fetch()).status,404);assert.equal(f.state.gets,1);assert.equal(f.state.puts,1);
  assert.match(f.entries.values().next().value.headers.get('cache-control'),/max-age=30/);
 });
});
test('invalid methods and paths are rejected before database or R2',async()=>{
 const f=fixture();await withCache(f.cache,async()=>{
  assert.equal((await f.fetch('/media/../../abc.png')).status,404);assert.equal((await f.fetch('/media/bad.svg')).status,404);assert.equal((await f.fetch(path,{method:'POST'})).status,405);
  assert.equal(f.state.gets,0);assert.equal(f.state.dbReads,0);assert.equal(f.state.puts,0);
 });
});
test('range returns full object, oversized objects bypass cache, failure is not cached',async()=>{
 const f=fixture();await withCache(f.cache,async()=>{
  let r=await f.fetch(path,{headers:{Range:'bytes=0-1'}});assert.equal(r.status,200);assert.equal(await r.text(),'one');assert.equal(r.headers.has('content-range'),false);
  f.entries.clear();f.state.size=6*1024*1024;r=await f.fetch();assert.equal(r.status,200);assert.equal(f.entries.size,0);
  f.state.failR2=true;r=await f.fetch();assert.equal(r.status,500);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(f.entries.size,0);
  f.state.failR2=false;f.state.failCache=true;r=await f.fetch();assert.equal(r.status,200);
 });
});

test('private preview cannot inherit public cache metadata from R2',async()=>{
 const {adminApi}=await import('../src/admin.mjs');
 const req=new Request('https://blog.example/api/admin/media/'+key);
 const env={BUCKET:{async get(){return {body:'private',writeHttpMetadata(h){h.set('cache-control','public, max-age=3600');h.set('content-type','image/png')}}}}};
 const r=await adminApi(req,env,new URL(req.url));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(await r.text(),'private');
});


test('task list images obey published status', async()=>{
 const f=fixture();f.state.content=`- [x] ![任务图](${path})`;
 await withCache(f.cache,async()=>{
  assert.equal((await f.fetch()).status,200);
  f.state.published=false;assert.equal((await f.fetch()).status,404);
 });
});
