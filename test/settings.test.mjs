import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.mjs';
import {adminApi} from '../src/admin.mjs';

test('site settings require authorization and only selected images become public', async()=>{
  const db=new DatabaseSync(':memory:');
  for (const file of ['0001_initial.sql','0002_site_settings.sql','0003_home_settings.sql','0004_display_settings.sql','0005_theme_navigation.sql','0006_about_page.sql']) db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
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

test('homepage options preserve existing settings and old forms cannot reset them', async()=>{
  const db=new DatabaseSync(':memory:');
  for(const file of ['0001_initial.sql','0002_site_settings.sql']) db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  db.prepare('INSERT INTO site_settings (id,title,description,avatar_url,icon_url) VALUES (1,?,?,?,?)').run('原站名','原简介','','');
  for (const file of ['0003_home_settings.sql','0004_display_settings.sql','0005_theme_navigation.sql','0006_about_page.sql']) db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  db.prepare('INSERT INTO posts (id,slug,title,status,created_at,updated_at,published_at,excerpt) VALUES (?,?,?,?,?,?,?,?)').run('a','example','示例文章','published','2026','2026','2026-01-01','这是摘要');
  const DB={prepare(sql){const stmt=db.prepare(sql);let args=[];return {bind(...v){args=v;return this},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}}}}}};
  const env={DB,BUCKET:{}};const request=(path,options={})=>new Request('https://blog.test'+path,options);
  const save=async(data)=>{const req=request('/api/admin/settings',{method:'POST',headers:{Origin:'https://blog.test','Content-Type':'application/json'},body:JSON.stringify(data)});return adminApi(req,env,new URL(req.url))};
  try {
    const original={title:'原站名',description:'原简介',avatar_url:'',icon_url:''};
    let html=await (await worker.fetch(request('/'),env)).text();assert.match(html,/近期发布/);assert.match(html,/这是摘要/);
    assert.equal((await save({...original,home_heading:'最新 <文章>',home_show_excerpt:false})).status,200);
    html=await (await worker.fetch(request('/'),env)).text();assert.match(html,/最新 &lt;文章&gt;/);assert.doesNotMatch(html,/这是摘要/);
    assert.equal((await save(original)).status,200);
    const row=db.prepare('SELECT * FROM site_settings').get();assert.equal(row.home_heading,'最新 <文章>');assert.equal(row.home_show_excerpt,0);assert.equal(row.title,'原站名');
    assert.equal((await save({...original,home_heading:'',home_show_excerpt:true})).status,400);
    assert.equal((await save({...original,home_heading:'a',home_show_excerpt:'false'})).status,400);
  }finally{db.close()}
});

test('display settings control the homepage and article metadata without exposing drafts', async()=>{
  const db=new DatabaseSync(':memory:');
  for(const file of ['0001_initial.sql','0002_site_settings.sql','0003_home_settings.sql','0004_display_settings.sql','0005_theme_navigation.sql','0006_about_page.sql']) db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const insert=db.prepare('INSERT INTO posts (id,slug,title,status,created_at,updated_at,published_at,category,tags,content) VALUES (?,?,?,?,?,?,?,?,?,?)');
  insert.run('a','first','第一篇','published','2025-01-01','2025-02-02','2025-01-01','分类A','["标签A"]','## 标题一\n\n内容\n\n## 标题二');
  insert.run('b','second','第二篇','published','2026-01-01','2026-01-01','2026-01-01','','[]','正文');
  insert.run('c','secret','私密草稿','draft','2026-02-01','2026-02-01','2026-02-01','','[]','正文');
  const DB={prepare(sql){const stmt=db.prepare(sql);let args=[];return {bind(...v){args=v;return this},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}}}}}};
  const env={DB,BUCKET:{}};const req=(path,options={})=>new Request('https://blog.test'+path,options);
  const save=async(data)=>{const r=req('/api/admin/settings',{method:'POST',headers:{Origin:'https://blog.test','Content-Type':'application/json'},body:JSON.stringify(data)});return adminApi(r,env,new URL(r.url))};
  try {
    const basic={title:'站点',description:'简介',avatar_url:'',icon_url:''};
    const options={...basic,home_limit:1,post_show_toc:false,post_show_published:false,post_show_updated:false,post_show_topics:false};
    assert.equal((await save(options)).status,200);
    const home=await (await worker.fetch(req('/'),env)).text();assert.match(home,/>第二篇<\/a>/);assert.doesNotMatch(home,/>第一篇<\/a>/);assert.doesNotMatch(home,/私密草稿/);assert.match(home,/查看全部文章/);
    const article=await (await worker.fetch(req('/post/first'),env)).text();assert.doesNotMatch(article,/<summary>文章目录/);assert.doesNotMatch(article,/2025-01-01/);assert.doesNotMatch(article,/更新于/);assert.doesNotMatch(article,/\/category\//);assert.match(article,/id="标题一"/);
    assert.equal((await save(basic)).status,200);
    const row=db.prepare('SELECT * FROM site_settings').get();assert.equal(row.home_limit,1);assert.equal(row.post_show_toc,0);assert.equal(row.post_show_topics,0);
    for(const bad of [0,51,1.5,'5'])assert.equal((await save({...basic,home_limit:bad})).status,400);
    assert.equal((await save({...basic,post_show_toc:'false'})).status,400);
    assert.equal((await save({...basic,post_show_updated:true,post_show_published:false})).status,200);
    const updated=await (await worker.fetch(req('/post/first'),env)).text();assert.match(updated,/更新于 <time/);assert.doesNotMatch(updated,/<p class="meta"> ·/);
  }finally{db.close()}
});

test('theme, social and navigation settings are validated and preserve older forms', async()=>{
  const db=new DatabaseSync(':memory:');
  for(const file of ['0001_initial.sql','0002_site_settings.sql','0003_home_settings.sql','0004_display_settings.sql','0005_theme_navigation.sql','0006_about_page.sql']) db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  db.prepare('INSERT INTO posts (id,slug,title,status,created_at,updated_at,published_at,content) VALUES (?,?,?,?,?,?,?,?)').run('1','post','测试文章','published','2026','2026','2026-01-01','## 标题一\n\n## 标题二');
  const DB={prepare(sql){const stmt=db.prepare(sql);let args=[];return {bind(...v){args=v;return this},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}}}}}};
  const env={DB,BUCKET:{}};const req=(path,options={})=>new Request('https://blog.test'+path,options);
  const save=async data=>{const r=req('/api/admin/settings',{method:'POST',headers:{Origin:'https://blog.test','Content-Type':'application/json'},body:JSON.stringify(data)});return adminApi(r,env,new URL(r.url))};
  try{
    const basic={title:'站点',description:'简介',avatar_url:'',icon_url:''};
    const settings={...basic,accent_color:'#175b9a',github_url:'https://github.com/example',social_url:'https://example.com/',contact_email:'hello@example.com',archive_fold:true,post_share:true,mobile_nav:true};
    assert.equal((await save(settings)).status,200);
    let home=await (await worker.fetch(req('/'),env)).text();assert.match(home,/--accent:#175b9a/);assert.match(home,/href="https:\/\/github.com\/example"/);assert.match(home,/mailto:hello%40example.com/);assert.match(home,/手机快捷导航/);
    const archive=await (await worker.fetch(req('/archive'),env)).text();assert.match(archive,/<details class="archive-year archive-fold">/);
    const post=await (await worker.fetch(req('/post/post'),env)).text();assert.match(post,/id="shareArticle"/);assert.match(post,/id="shareFallback"/);
    assert.equal((await save(basic)).status,200);let row=db.prepare('SELECT * FROM site_settings').get();assert.equal(row.accent_color,'#175b9a');assert.equal(row.mobile_nav,1);assert.equal(row.github_url,'https://github.com/example');
    for(const bad of [{accent_color:'red;}'},{github_url:'javascript:alert(1)'},{social_url:'https://user:pass@example.com/'},{contact_email:'x@example.com?subject=bad'},{post_share:'false'}]) assert.equal((await save({...basic,...bad})).status,400);
    row=db.prepare('SELECT * FROM site_settings').get();assert.equal(row.accent_color,'#175b9a');
  }finally{db.close()}
});

test('new migration preserves previously saved display options',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const file of ['0001_initial.sql','0002_site_settings.sql','0003_home_settings.sql','0004_display_settings.sql'])db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  db.prepare('INSERT INTO site_settings (id,title,description,avatar_url,icon_url,home_heading,home_show_excerpt,home_limit,post_show_toc) VALUES (1,?,?,?,?,?,?,?,?)').run('已有名称','已有简介','','','已有标题',0,7,0);
  db.exec(readFileSync(new URL('../migrations/0005_theme_navigation.sql',import.meta.url),'utf8'));
  const row=db.prepare('SELECT * FROM site_settings').get();assert.equal(row.title,'已有名称');assert.equal(row.home_heading,'已有标题');assert.equal(row.home_limit,7);assert.equal(row.home_show_excerpt,0);assert.equal(row.post_show_toc,0);assert.equal(row.accent_color,'#2bbc8a');assert.equal(row.post_share,0);assert.equal(row.mobile_nav,0);
 }finally{db.close()}
});

test('about page renders safely and only publishes images actually referenced',async()=>{
 const db=new DatabaseSync(':memory:');for(const f of ['0001_initial.sql','0002_site_settings.sql','0003_home_settings.sql','0004_display_settings.sql','0005_theme_navigation.sql','0006_about_page.sql'])db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const DB={prepare(sql){const q=db.prepare(sql);let args=[];return {bind(...x){args=x;return this},async first(){return q.get(...args)||null},async all(){return {results:q.all(...args)}},async run(){return {meta:{changes:Number(q.run(...args).changes)}}}}}};
 const key='11111111-1111-4111-8111-111111111111.png';const BUCKET={async get(){return {body:'image',size:5,writeHttpMetadata(){}}},async head(){return {}}};const env={DB,BUCKET};
 const request=(p,o={})=>new Request('https://blog.test'+p,o), save=async data=>{const r=request('/api/admin/settings',{method:'POST',headers:{Origin:'https://blog.test','Content-Type':'application/json'},body:JSON.stringify(data)});return adminApi(r,env,new URL(r.url))};
 try{
  const basic={title:'站点',description:'',avatar_url:'',icon_url:''};
  assert.equal((await save({...basic,about_content:'## 我的介绍\n\n<script>\n\n![图](/media/'+key+')'})).status,200);
  const html=await (await worker.fetch(request('/about'),env)).text();assert.match(html,/<h2>我的介绍<\/h2>/);assert.match(html,/&lt;script&gt;/);assert.equal((await worker.fetch(request('/media/'+key),env)).status,200);
  assert.equal((await save({...basic,about_content:'```\n![图](/media/'+key+')\n```'})).status,200);assert.equal((await worker.fetch(request('/media/'+key),env)).status,404);
 }finally{db.close()}
});
