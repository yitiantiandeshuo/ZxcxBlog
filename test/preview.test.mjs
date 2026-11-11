import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewControllerSource} from '../src/preview.mjs';
import {runInNewContext} from 'node:vm';
const createPreviewController = runInNewContext(`(${previewControllerSource})`, {setTimeout, clearTimeout});

test('automatic preview is opt-in and debounces typing', async()=>{
  let content='one', pending, calls=0, rendered;
  const controller=createPreviewController({read:()=>content,request:async x=>{calls++;return x},render:x=>{rendered=x},report:()=>{},setTimer:fn=>{pending=fn;return 1},clearTimer:()=>{pending=undefined}});
  controller.changed();assert.equal(calls,0);assert.equal(pending,undefined);
  controller.setEnabled(true);await new Promise(resolve => setImmediate(resolve));assert.equal(calls,1);assert.equal(rendered,'one');
  content='two';controller.changed();content='three';controller.changed();assert.equal(calls,1);
  await pending();assert.equal(calls,2);assert.equal(rendered,'three');
  content='four';controller.changed();controller.setEnabled(false);assert.equal(pending,undefined);
});

test('late preview responses cannot replace newer or reset content', async()=>{
  let content='old', resolveOld, result='';
  const controller=createPreviewController({read:()=>content,request:value=>value==='old'?new Promise(resolve=>{resolveOld=resolve}):Promise.resolve(value),render:value=>{result=value},report:()=>{}});
  const old=controller.run();content='new';controller.changed();await controller.run();resolveOld('old');await old;assert.equal(result,'new');
  content='old';const reset=controller.run();controller.invalidate();content='';resolveOld('old');await reset;assert.equal(result,'new');
});
