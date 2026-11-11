import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {editorToolsSource} from '../src/editor_tools.mjs';
const apply=runInNewContext(`(${editorToolsSource})`,{Event});
function field(value,start,end){return {value,selectionStart:start,selectionEnd:end,events:[],setRangeText(text,a,b){this.value=this.value.slice(0,a)+text+this.value.slice(b)},setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b},focus(){},dispatchEvent(e){this.events.push(e.type)}}}
test('toolbar wraps selection, preserves selection and triggers preview update',()=>{const f=field('hello world',0,5);assert.equal(apply(f,'bold'),true);assert.equal(f.value,'**hello** world');assert.equal(f.selectionStart,2);assert.equal(f.selectionEnd,7);assert.deepEqual(f.events,['input'])});
test('toolbar inserts usable placeholders and ignores unknown actions',()=>{const f=field('',0,0);apply(f,'table');assert.match(f.value,/\| --- \| --- \|/);assert.equal(apply(f,'unknown'),false)});

test('embedded admin script stays syntactically valid as delivered',async()=>{
 const {adminPage}=await import('../src/admin.mjs');const html=adminPage();const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];assert.equal(scripts.length,1);assert.doesNotThrow(()=>new Function(scripts[0][1]));
});
