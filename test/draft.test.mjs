import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {draftRecoverySource} from '../src/draft.mjs';
const create=runInNewContext(`(${draftRecoverySource})`,{setTimeout,clearTimeout,JSON});
test('local recovery is opt-in, debounced, explicit and removable',()=>{
 let value={id:'',content:'one'}, saved=null, timer, restored, status='';
 const storage={getItem(){return saved},setItem(_,v){saved=v},removeItem(){saved=null}};
 const c=create({read:()=>value,write:x=>{restored=x},storage,report:x=>{status=x},setTimer:fn=>{timer=fn;return 1},clearTimer:()=>{timer=undefined}});
 c.changed();assert.equal(saved,null);c.setEnabled(true);value={id:'post',content:'最新'};c.changed();timer();assert.equal(JSON.parse(saved).fields.content,'最新');assert.equal(c.hasBackup(),true);
 assert.equal(c.restore(),true);assert.equal(restored.id,'post');c.clear();assert.equal(c.hasBackup(),false);assert.match(status,/已清除/);
});
test('unavailable local storage is handled without losing editor state',()=>{
 let status='';const storage={getItem(){throw Error('denied')},setItem(){throw Error('denied')},removeItem(){throw Error('denied')}};
 const c=create({read:()=>({content:'x'}),write:()=>{},storage,report:x=>{status=x},setTimer:()=>1,clearTimer:()=>{}});c.setEnabled(true);c.flush();assert.match(status,/不可用/);assert.equal(c.restore(),false);
});
