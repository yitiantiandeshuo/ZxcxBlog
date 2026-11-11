import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.mjs';
import {adminApi} from '../src/admin.mjs';

test('site settings require authorization and only selected images become public', async()=>{
  const db=new DatabaseSync(':memory:');
  for (const file of ['0001_initial.sql','0002_site_settings.sql']) db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const DB={prepare(sql){const stmt=db.prepare(sql);let args=[];return {bind(...v){args=v;return this},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}}}}}};
  const a='11111111-1111-4111-8111-111111111111.png', b='22222222-2222-4222-8222-222222222222.png';
  const BUCKET={async head(key){return [a,b].includes(key)?{}:null},async get(key){return [a,b].includes(key)?{body:'image',size:5,writeHttpMetadata(h){h.set('content-type','image/png')}}:null}};
  const env={DB,BUCKET,SITE_TITLE:'旧名称',SITE_DESCRIPTION:'旧简介'};
  const request=(path,options={})=>new Request('https://blog.test'+path,options);
  const save=async (data,origin='https://blog.test')=>{const req=request('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)});return adminApi(req,env,new URL(req.url))};
  const settings={title:'新 <名称>',description:'我的简介',avatar_url:'/media/'+a,icon_url:''};
  try {
    assert.equal((await worker.fetch(request('/admin/settings'),env)).status,403);
    assert.equal((await worker.fetch(request('/api/admin/settings',{method:'POST',headers:{Origin:'https://blog.test'},body:'{}'}),env)).status,403);
    assert.equal((await save(settings,'https://evil.test')).status,403);
    assert.equal((await worker.fetch(request('/media/'+a),env)).status,404);
    assert.equal((await save({...settings,avatar_url:'javascript:alert(1)'})).status,400);
    assert.equal((await save({...settings,avatar_url:'/media/33333333-3333-4333-8333-333333333333.png'})).status,400);
    assert.equal((await save(settings)).status,200);
    let home=await (await worker.fetch(request('/'),env)).text();assert.match(home,/新 &lt;名称&gt;/);assert.match(home,new RegExp('/media/'+a));
    assert.equal((await worker.fetch(request('/media/'+a),env)).status,200);
    assert.equal((await worker.fetch(request('/media/'+b),env)).status,404);
    assert.equal((await save({...settings,avatar_url:'/media/'+b})).status,200);
    assert.equal((await worker.fetch(request('/media/'+a),env)).status,404);
    assert.equal((await worker.fetch(request('/media/'+b),env)).status,200);
    const get=request('/api/admin/settings');const data=await (await adminApi(get,env,new URL(get.url))).json();assert.equal(data.avatar_url,'/media/'+b);
  }finally{db.close()}
});
