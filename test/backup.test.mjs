import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {adminApi} from '../src/admin.mjs';

test('backup includes settings and restores posts and settings into an isolated database',async()=>{
 const files=['0001_initial.sql','0002_site_settings.sql','0003_home_settings.sql','0004_display_settings.sql','0005_theme_navigation.sql','0006_about_page.sql'];
 const makeDB=()=>{const db=new DatabaseSync(':memory:');for(const f of files)db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));return db};
 const source=makeDB(),target=makeDB(),dir=mkdtempSync(join(tmpdir(),'blog-backup-test-'));
 try{
  source.prepare('INSERT INTO posts (id,slug,title,status,created_at,updated_at,content) VALUES (?,?,?,?,?,?,?)').run('11111111-1111-4111-8111-111111111111','test','标题','draft','2026','2026','正文');
  source.prepare('INSERT INTO site_settings (id,title,description,about_content,home_limit,post_share) VALUES (1,?,?,?,?,?)').run("站长的'博客",'介绍','关于我',7,1);
  const DB={prepare(sql){const q=source.prepare(sql);return {async all(){return {results:q.all()}},async first(){return q.get()||null}}}};
  const req=new Request('https://blog.test/api/admin/export'),res=await adminApi(req,{DB},new URL(req.url)),backup=await res.json();
  assert.equal(backup.posts[0].content,'正文');assert.equal(backup.settings.about_content,'关于我');
  const file=join(dir,'backup.json');writeFileSync(file,JSON.stringify(backup));
  const result=spawnSync('python3',['tools/backup_to_sql.py',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);target.exec(result.stdout);
  assert.equal(target.prepare('SELECT content FROM posts').get().content,'正文');const settings=target.prepare('SELECT * FROM site_settings').get();assert.equal(settings.title,"站长的'博客");assert.equal(settings.about_content,'关于我');assert.equal(settings.home_limit,7);assert.equal(settings.post_share,1);
  delete backup.settings;writeFileSync(file,JSON.stringify(backup));assert.equal(spawnSync('python3',['tools/backup_to_sql.py',file],{encoding:'utf8'}).status,0);
 }finally{source.close();target.close();rmSync(dir,{recursive:true,force:true})}
});
